import dotenv from 'dotenv'
dotenv.config()

import { getAuth, initializeFirebase } from '../src/config/firebase.js'

initializeFirebase()

const auth = getAuth()
const apiKey = process.env.FIREBASE_WEB_API_KEY
const apiBase = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api'
if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY is required')

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

const request = async (path, token) => {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { authorization: `Bearer ${token}` }
  })
  const data = await response.json()
  return { status: response.status, data }
}

const allUsers = []
let pageToken
do {
  const page = await auth.listUsers(1000, pageToken)
  allUsers.push(...page.users)
  pageToken = page.pageToken
} while (pageToken)

const bootstrapAdmins = new Set((process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean))
const admin = allUsers.find(user => user.customClaims?.role === 'admin' || bootstrapAdmins.has(String(user.email || '').toLowerCase()))
const regularUser = allUsers.find(user => user.uid !== admin?.uid && user.customClaims?.role !== 'admin' && !bootstrapAdmins.has(String(user.email || '').toLowerCase()))
if (!admin) throw new Error('No administrator account found')

const adminToken = await exchangeToken(admin.uid)
const [overview, users, alerts, feedback] = await Promise.all([
  request('/admin/overview', adminToken),
  request('/admin/users', adminToken),
  request('/admin/alerts', adminToken),
  request('/admin/feedback', adminToken)
])

let regularUserAdminStatus = null
if (regularUser) {
  const userToken = await exchangeToken(regularUser.uid)
  regularUserAdminStatus = (await request('/admin/users', userToken)).status
}

console.log(JSON.stringify({
  adminEmail: admin.email,
  overviewStatus: overview.status,
  usersStatus: users.status,
  alertsStatus: alerts.status,
  feedbackStatus: feedback.status,
  listedUsers: users.data?.data?.count ?? null,
  regularUserAdminStatus
}))
