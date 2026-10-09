import dotenv from 'dotenv'
dotenv.config()

import { getAuth, getFirestore, initializeFirebase } from '../src/config/firebase.js'

initializeFirebase()

const auth = getAuth()
const db = getFirestore()
const apiKey = process.env.FIREBASE_WEB_API_KEY
const apiBase = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api'
const email = `security-smoke-${Date.now()}@example.com`
const password = 'Temp-Lock7!Aa'
let temporaryUser

const jsonRequest = async (path, options = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  })
  const data = await response.json()
  return { status: response.status, data }
}

const exchangeAdminToken = async () => {
  const bootstrap = new Set((process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean))
  const page = await auth.listUsers(1000)
  const admin = page.users.find(user => user.customClaims?.role === 'admin' || bootstrap.has(String(user.email || '').toLowerCase()))
  if (!admin) throw new Error('No administrator account found')
  const token = await auth.createCustomToken(admin.uid)
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, returnSecureToken: true })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Admin token exchange failed')
  return data.idToken
}

try {
  temporaryUser = await auth.createUser({ email, password, emailVerified: true })
  await db.collection('users').doc(temporaryUser.uid).set({
    email,
    role: 'user',
    accountStatus: 'active',
    emailVerified: true,
    loginSecurity: {
      failedAttempts: 0,
      locked: false,
      lockedAt: null,
      unlockAvailableAt: null,
      lockedUntil: null,
      lastFailedAt: null
    },
    createdAt: new Date(),
    updatedAt: new Date()
  })

  const failedStatuses = []
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: email, password: 'Wrong-Password7!' })
    })
    failedStatuses.push(result.status)
  }

  const adminToken = await exchangeAdminToken()
  const authorization = { authorization: `Bearer ${adminToken}` }
  const earlyUnlock = await jsonRequest(`/admin/users/${temporaryUser.uid}/unlock`, {
    method: 'POST',
    headers: authorization
  })

  const past = new Date(Date.now() - 1000)
  await db.collection('users').doc(temporaryUser.uid).update({
    'loginSecurity.unlockAvailableAt': past,
    'loginSecurity.lockedUntil': past
  })

  const adminUnlock = await jsonRequest(`/admin/users/${temporaryUser.uid}/unlock`, {
    method: 'POST',
    headers: authorization
  })
  const successfulLogin = await jsonRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: email, password })
  })

  console.log(JSON.stringify({
    failedStatuses,
    earlyUnlockStatus: earlyUnlock.status,
    earlyUnlockCode: earlyUnlock.data?.code,
    adminUnlockStatus: adminUnlock.status,
    successfulLoginStatus: successfulLogin.status
  }))
} finally {
  if (temporaryUser) {
    const alerts = await db.collection('security_alerts').where('userId', '==', temporaryUser.uid).get()
    if (!alerts.empty) {
      const batch = db.batch()
      alerts.docs.forEach(document => batch.delete(document.ref))
      await batch.commit()
    }
    await db.collection('users').doc(temporaryUser.uid).delete()
    await auth.deleteUser(temporaryUser.uid)
  }
}
