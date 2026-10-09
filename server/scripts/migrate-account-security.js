import dotenv from 'dotenv'
dotenv.config()

import { getAuth, getFirestore, initializeFirebase } from '../src/config/firebase.js'

initializeFirebase()

const auth = getAuth()
const db = getFirestore()
let pageToken
let inspected = 0
let updated = 0

do {
  const page = await auth.listUsers(1000, pageToken)
  for (const user of page.users) {
    inspected += 1
    const ref = db.collection('users').doc(user.uid)
    const snapshot = await ref.get()
    const profile = snapshot.exists ? snapshot.data() : {}
    const patch = {}

    if (!['active', 'blocked'].includes(profile.accountStatus)) {
      patch.accountStatus = user.disabled ? 'blocked' : 'active'
    }
    if (!profile.loginSecurity || typeof profile.loginSecurity !== 'object') {
      patch.loginSecurity = {
        failedAttempts: 0,
        locked: false,
        lockedAt: null,
        unlockAvailableAt: null,
        lockedUntil: null,
        lastFailedAt: null
      }
    }

    if (Object.keys(patch).length) {
      await ref.set({ ...patch, updatedAt: new Date() }, { merge: true })
      updated += 1
    }
  }
  pageToken = page.pageToken
} while (pageToken)

console.log(JSON.stringify({ inspected, updated }))
