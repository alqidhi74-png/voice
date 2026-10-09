import dotenv from 'dotenv'
dotenv.config()

import { getAuth, getFirestore, initializeFirebase } from '../src/config/firebase.js'
import { recordSecurityAlert } from '../src/services/securityNotifications.js'

initializeFirebase()
const auth = getAuth()
const db = getFirestore()
const apiKey = process.env.FIREBASE_WEB_API_KEY
const apiBase = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api'
let temporaryUser
let feedbackId
let alertId

const exchangeToken = async uid => {
  const customToken = await auth.createCustomToken(uid)
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Token exchange failed')
  return data.idToken
}

const api = async (path, token, options = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) }
  })
  const data = await response.json()
  return { status: response.status, data }
}

const deleteOwnedDocuments = async (collection, userId) => {
  const snapshot = await db.collection(collection).where('userId', '==', userId).get()
  if (snapshot.empty) return
  const batch = db.batch()
  snapshot.docs.forEach(document => batch.delete(document.ref))
  await batch.commit()
}

try {
  const allUsers = await auth.listUsers(1000)
  const bootstrap = new Set((process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean))
  const admin = allUsers.users.find(user => user.customClaims?.role === 'admin' || bootstrap.has(String(user.email || '').toLowerCase()))
  if (!admin) throw new Error('No administrator found')

  temporaryUser = await auth.createUser({
    email: `feedback-smoke-${Date.now()}@example.com`,
    password: 'Temp-Feedback7!Aa',
    emailVerified: true
  })
  await db.collection('users').doc(temporaryUser.uid).set({
    email: temporaryUser.email,
    role: 'user',
    accountStatus: 'active',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date()
  })

  const [adminToken, userToken] = await Promise.all([exchangeToken(admin.uid), exchangeToken(temporaryUser.uid)])
  const streamController = new AbortController()
  const stream = await fetch(`${apiBase}/admin/events`, {
    headers: { authorization: `Bearer ${adminToken}`, accept: 'text/event-stream' },
    signal: streamController.signal
  })
  const reader = stream.body.getReader()
  await reader.read()

  const submitted = await api('/user/feedback', userToken, {
    method: 'POST',
    body: JSON.stringify({ category: 'suggestion', message: 'Encrypted integration-test feedback' })
  })
  feedbackId = submitted.data?.data?.feedbackId

  const liveChunk = await Promise.race([
    reader.read(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Live event timeout')), 8000))
  ])
  const liveText = new TextDecoder().decode(liveChunk.value)
  streamController.abort()

  const updated = await api(`/admin/feedback/${feedbackId}`, adminToken, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'resolved', reply: 'Thank you. This suggestion has been reviewed.' })
  })
  const userFeedback = await api('/user/feedback', userToken)
  const userNotifications = await api('/user/notifications', userToken)
  const notification = userNotifications.data?.data?.notifications?.[0]
  const readResult = notification
    ? await api(`/user/notifications/${notification.id}/read`, userToken, { method: 'PATCH' })
    : { status: null }

  const alert = await recordSecurityAlert({
    userId: temporaryUser.uid,
    type: 'integration_test',
    message: 'Encrypted integration-test security notification'
  })
  alertId = alert.id
  const alertRead = await api(`/admin/alerts/${alertId}/read`, adminToken, {
    method: 'PATCH',
    body: JSON.stringify({ read: true })
  })

  const returnedFeedback = userFeedback.data?.data?.feedback?.find(item => item.id === feedbackId)
  console.log(JSON.stringify({
    submitStatus: submitted.status,
    liveEventReceived: liveText.includes('feedback_created'),
    adminReplyStatus: updated.status,
    feedbackStatus: returnedFeedback?.status,
    replyMatches: returnedFeedback?.reply === 'Thank you. This suggestion has been reviewed.',
    userNotificationStatus: userNotifications.status,
    markUserNotificationReadStatus: readResult.status,
    markAdminAlertReadStatus: alertRead.status
  }))
} finally {
  if (temporaryUser) {
    await Promise.all([
      deleteOwnedDocuments('encrypted_feedback', temporaryUser.uid),
      deleteOwnedDocuments('user_notifications', temporaryUser.uid),
      deleteOwnedDocuments('security_alerts', temporaryUser.uid)
    ])
    await db.collection('users').doc(temporaryUser.uid).delete()
    await auth.deleteUser(temporaryUser.uid)
  }
}
