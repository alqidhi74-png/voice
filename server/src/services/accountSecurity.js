import { getFirestore } from '../config/firebase.js'

export const MAX_FAILED_LOGIN_ATTEMPTS = 3
export const ACCOUNT_LOCKOUT_MS = 60 * 1000

const toMillis = value => {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export const getLoginLockState = (loginSecurity = {}, nowMs = Date.now()) => {
  const failedAttempts = Number(loginSecurity.failedAttempts || 0)
  const unlockAvailableAtMs = toMillis(loginSecurity.unlockAvailableAt || loginSecurity.lockedUntil)
  const locked = loginSecurity.locked === true || (
    failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS &&
    Boolean(loginSecurity.lockedAt || unlockAvailableAtMs)
  )
  return {
    locked,
    canUnlock: locked && (!unlockAvailableAtMs || unlockAvailableAtMs <= nowMs),
    unlockAvailableAt: unlockAvailableAtMs ? new Date(unlockAvailableAtMs) : null,
    // Keep this alias for API compatibility with older clients.
    lockedUntil: unlockAvailableAtMs ? new Date(unlockAvailableAtMs) : null,
    retryAfterSeconds: locked && unlockAvailableAtMs > nowMs
      ? Math.max(1, Math.ceil((unlockAvailableAtMs - nowMs) / 1000))
      : 0,
    failedAttempts
  }
}

export const calculateFailedLoginUpdate = (
  loginSecurity = {},
  nowMs = Date.now(),
  { maxAttempts = MAX_FAILED_LOGIN_ATTEMPTS, lockoutMs = ACCOUNT_LOCKOUT_MS } = {}
) => {
  const current = getLoginLockState(loginSecurity, nowMs)
  if (current.locked) return current

  const failedAttempts = current.failedAttempts + 1
  const locked = failedAttempts >= maxAttempts
  const unlockAvailableAt = locked ? new Date(nowMs + lockoutMs) : null
  return {
    locked,
    canUnlock: false,
    unlockAvailableAt,
    lockedUntil: unlockAvailableAt,
    retryAfterSeconds: locked ? Math.ceil(lockoutMs / 1000) : 0,
    failedAttempts,
    attemptsRemaining: Math.max(0, maxAttempts - failedAttempts)
  }
}

export const recordFailedLogin = async (uid, now = new Date()) => {
  const db = getFirestore()
  const userRef = db.collection('users').doc(uid)
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(userRef)
    const profile = snapshot.exists ? snapshot.data() : {}
    const update = calculateFailedLoginUpdate(profile.loginSecurity, now.getTime())

    transaction.set(userRef, {
      accountStatus: profile.accountStatus === 'blocked' ? 'blocked' : 'active',
      loginSecurity: {
        failedAttempts: update.failedAttempts,
        locked: update.locked,
        lockedAt: update.locked ? now : profile.loginSecurity?.lockedAt || null,
        unlockAvailableAt: update.unlockAvailableAt,
        lockedUntil: update.unlockAvailableAt,
        lastFailedAt: now
      },
      updatedAt: now
    }, { merge: true })

    return update
  })
  return result
}

export const clearLoginFailures = async (uid, now = new Date()) => {
  await getFirestore().collection('users').doc(uid).set({
    loginSecurity: {
      failedAttempts: 0,
      locked: false,
      lockedAt: null,
      unlockAvailableAt: null,
      lockedUntil: null,
      lastFailedAt: null,
      unlockedAt: now
    },
    updatedAt: now
  }, { merge: true })
}

export const unlockAccount = clearLoginFailures

export default {
  MAX_FAILED_LOGIN_ATTEMPTS,
  ACCOUNT_LOCKOUT_MS,
  getLoginLockState,
  calculateFailedLoginUpdate,
  recordFailedLogin,
  clearLoginFailures,
  unlockAccount
}
