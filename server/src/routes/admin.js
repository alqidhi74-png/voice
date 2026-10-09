import express from 'express'
import { getAuth, getFirestore } from '../config/firebase.js'
import { cleanText, isSafeDocumentId } from '../utils/validation.js'
import { logger } from '../utils/logger.js'
import {
  deleteOwnedLocalAudio,
  parseLocalAudioReference
} from '../services/localAudioStorage.js'
import { getLoginLockState, unlockAccount } from '../services/accountSecurity.js'
import {
  createUserNotification,
  listEncryptedFeedback,
  listSecurityAlerts,
  markSecurityAlertRead,
  recordSecurityAlert,
  updateEncryptedFeedback
} from '../services/securityNotifications.js'
import { sendNotificationEmail } from '../services/emailNotifications.js'
import { openEventStream } from '../services/eventStream.js'

const router = express.Router()
const MAX_ADMIN_USERS = 5000

const bootstrapAdminEmails = () => new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
)

const isAdminRecord = (authUser, profile = {}) => (
  authUser.customClaims?.role === 'admin' ||
  profile.role === 'admin' ||
  bootstrapAdminEmails().has(String(authUser.email || '').toLowerCase())
)

const toIsoString = value => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  return null
}

const timestampDate = value => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const buildDashboardCharts = (users, auditDocuments) => {
  const activityTrend = []
  const activityByDate = new Map()
  const now = new Date()

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now)
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - offset)
    const key = date.toISOString().slice(0, 10)
    const item = {
      key,
      label: date.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }),
      verifications: 0,
      enrollments: 0
    }
    activityTrend.push(item)
    activityByDate.set(key, item)
  }

  const verificationTotals = { ACCEPT: 0, CHALLENGE: 0, REJECT: 0, FAILED: 0 }
  auditDocuments.forEach(document => {
    const data = document.data()
    const date = timestampDate(data.timestamp)
    if (date) {
      const day = activityByDate.get(date.toISOString().slice(0, 10))
      if (day && data.operation === 'verify') day.verifications += 1
      if (day && data.operation === 'enroll') day.enrollments += 1
    }

    if (data.operation === 'verify') {
      if (data.status !== 'success') verificationTotals.FAILED += 1
      else if (data.decision === 'ACCEPT') verificationTotals.ACCEPT += 1
      else if (data.decision === 'CHALLENGE') verificationTotals.CHALLENGE += 1
      else verificationTotals.REJECT += 1
    }
  })

  const monthBuckets = []
  const registrationsByMonth = new Map()
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    const item = {
      key,
      label: date.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }),
      registrations: 0
    }
    monthBuckets.push(item)
    registrationsByMonth.set(key, item)
  }

  users.forEach(user => {
    const createdAt = timestampDate(user.metadata?.creationTime)
    if (!createdAt) return
    const key = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`
    const bucket = registrationsByMonth.get(key)
    if (bucket) bucket.registrations += 1
  })

  return {
    activityTrend: activityTrend.map(({ key: _key, ...item }) => item),
    userGrowth: monthBuckets.map(({ key: _key, ...item }) => item),
    verificationBreakdown: [
      { name: 'Accepted', value: verificationTotals.ACCEPT },
      { name: 'Challenged', value: verificationTotals.CHALLENGE },
      { name: 'Rejected', value: verificationTotals.REJECT },
      { name: 'Failed', value: verificationTotals.FAILED }
    ]
  }
}

const listAuthUsers = async () => {
  const users = []
  let pageToken

  do {
    const remaining = MAX_ADMIN_USERS - users.length
    if (remaining <= 0) break
    const page = await getAuth().listUsers(Math.min(1000, remaining), pageToken)
    users.push(...page.users)
    pageToken = page.pageToken
  } while (pageToken)

  return { users, truncated: Boolean(pageToken) }
}

const deleteQueryInBatches = async query => {
  let deleted = 0
  while (true) {
    const snapshot = await query.limit(400).get()
    if (snapshot.empty) break
    const batch = getFirestore().batch()
    snapshot.docs.forEach(document => batch.delete(document.ref))
    await batch.commit()
    deleted += snapshot.size
  }
  return deleted
}

router.get('/overview', async (_req, res) => {
  try {
    const db = getFirestore()
    const [{ users }, voiceprints, verificationCount, auditEvents] = await Promise.all([
      listAuthUsers(),
      db.collection('voiceprints').select('userId').get(),
      db.collection('audit_events').where('operation', '==', 'verify').count().get(),
      db.collection('audit_events').orderBy('timestamp', 'desc').limit(500).get()
    ])

    const enrolledUsers = new Set(
      voiceprints.docs.map(document => document.data().userId).filter(Boolean)
    )
    const adminCount = users.filter(user => isAdminRecord(user)).length
    const verifiedUsers = users.filter(user => user.emailVerified).length

    const recentActivity = auditEvents.docs.slice(0, 8).map(document => {
      const data = document.data()
      return {
        id: document.id,
        userId: data.userId || '',
        operation: data.operation || 'unknown',
        status: data.status || 'unknown',
        decision: data.decision || null,
        timestamp: toIsoString(data.timestamp)
      }
    })

    const charts = buildDashboardCharts(users, auditEvents.docs)

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers: users.length,
          adminUsers: adminCount,
          verifiedUsers,
          enrolledUsers: enrolledUsers.size,
          voiceRecordings: voiceprints.size,
          totalVerifications: verificationCount.data().count
        },
        recentActivity,
        charts
      }
    })
  } catch (error) {
    logger.error('Admin overview error:', error)
    res.status(500).json({ success: false, error: 'Failed to load administration overview' })
  }
})

router.get('/users', async (_req, res) => {
  try {
    const db = getFirestore()
    const [{ users: authUsers, truncated }, voiceprints] = await Promise.all([
      listAuthUsers(),
      db.collection('voiceprints').select('userId').get()
    ])

    const profileDocuments = authUsers.length
      ? await db.getAll(...authUsers.map(user => db.collection('users').doc(user.uid)))
      : []
    const profiles = new Map(
      profileDocuments.map(document => [document.id, document.exists ? document.data() : {}])
    )
    const voiceprintCounts = new Map()
    voiceprints.docs.forEach(document => {
      const userId = document.data().userId
      if (userId) voiceprintCounts.set(userId, (voiceprintCounts.get(userId) || 0) + 1)
    })

    const users = authUsers.map(authUser => {
      const profile = profiles.get(authUser.uid) || {}
      const lockState = getLoginLockState(profile.loginSecurity)
      const accountStatus = authUser.disabled || profile.accountStatus === 'blocked' ? 'blocked' : 'active'
      return {
        uid: authUser.uid,
        email: authUser.email || profile.email || '',
        displayName: profile.displayName || authUser.displayName || '',
        username: profile.username || '',
        role: isAdminRecord(authUser, profile) ? 'admin' : 'user',
        emailVerified: Boolean(authUser.emailVerified),
        mfaEnabled: Boolean(profile.mfaEnabled || authUser.multiFactor?.enrolledFactors?.length),
        disabled: Boolean(authUser.disabled),
        accountStatus,
        locked: lockState.locked,
        canUnlock: lockState.canUnlock,
        unlockAvailableAt: lockState.unlockAvailableAt?.toISOString?.() || null,
        lockedUntil: lockState.unlockAvailableAt?.toISOString?.() || null,
        failedLoginAttempts: lockState.locked ? lockState.failedAttempts : 0,
        voiceprintCount: voiceprintCounts.get(authUser.uid) || 0,
        createdAt: authUser.metadata?.creationTime || toIsoString(profile.createdAt),
        lastSignInAt: authUser.metadata?.lastSignInTime || null
      }
    }).sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))

    res.json({ success: true, data: { users, count: users.length, truncated } })
  } catch (error) {
    logger.error('Admin user list error:', error)
    res.status(500).json({ success: false, error: 'Failed to list users' })
  }
})

router.get('/alerts', async (req, res) => {
  try {
    const requested = Number.parseInt(req.query.limit, 10)
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 50
    const alerts = await listSecurityAlerts(limit)
    res.json({ success: true, data: { alerts, count: alerts.length } })
  } catch (error) {
    logger.error('Admin alert list error:', error)
    res.status(500).json({ success: false, error: 'Failed to load security alerts' })
  }
})

router.get('/events', (req, res) => openEventStream(req, res, 'admin'))

router.patch('/alerts/:alertId/read', async (req, res) => {
  try {
    const { alertId } = req.params
    if (!isSafeDocumentId(alertId)) return res.status(400).json({ success: false, error: 'Invalid alert' })
    const read = req.body?.read !== false
    const found = await markSecurityAlertRead({ alertId, adminId: req.user.uid, read })
    if (!found) return res.status(404).json({ success: false, error: 'Alert not found' })
    res.json({ success: true, message: read ? 'Notification marked as read' : 'Notification marked as unread' })
  } catch (error) {
    logger.error('Admin alert update error:', error)
    res.status(500).json({ success: false, error: 'Failed to update notification' })
  }
})

router.post('/alerts/read-all', async (req, res) => {
  try {
    const db = getFirestore()
    const snapshot = await db.collection('security_alerts').where('read', '==', false).limit(400).get()
    if (!snapshot.empty) {
      const batch = db.batch()
      snapshot.docs.forEach(document => batch.update(document.ref, {
        read: true,
        readAt: new Date(),
        readBy: req.user.uid
      }))
      await batch.commit()
    }
    res.json({ success: true, message: 'All notifications marked as read', data: { updated: snapshot.size } })
  } catch (error) {
    logger.error('Admin mark-all-read error:', error)
    res.status(500).json({ success: false, error: 'Failed to update notifications' })
  }
})

router.get('/feedback', async (req, res) => {
  try {
    const requested = Number.parseInt(req.query.limit, 10)
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 50
    const feedback = await listEncryptedFeedback(limit)
    res.json({ success: true, data: { feedback, count: feedback.length } })
  } catch (error) {
    logger.error('Admin feedback list error:', error)
    res.status(500).json({ success: false, error: 'Failed to load encrypted feedback' })
  }
})

router.patch('/feedback/:feedbackId', async (req, res) => {
  try {
    const { feedbackId } = req.params
    if (!isSafeDocumentId(feedbackId)) return res.status(400).json({ success: false, error: 'Invalid feedback' })
    const status = typeof req.body?.status === 'string'
      ? cleanText(req.body.status, { maxLength: 20, allowEmpty: false }).toLowerCase()
      : ''
    const reply = typeof req.body?.reply === 'string'
      ? cleanText(req.body.reply, { maxLength: 2000, allowEmpty: true })
      : ''
    if (!['new', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid feedback status' })
    }

    const feedback = await updateEncryptedFeedback({ feedbackId, status, reply, adminId: req.user.uid })
    if (!feedback) return res.status(404).json({ success: false, error: 'Feedback not found' })

    const notificationMessage = reply
      ? `Administrator response: ${reply}`
      : `Your feedback status changed to ${status.replace('_', ' ')}`
    await createUserNotification({
      userId: feedback.userId,
      type: 'feedback_updated',
      title: reply ? 'Administrator replied to your feedback' : 'Feedback status updated',
      message: notificationMessage,
      metadata: { feedbackId, status }
    })

    const targetUser = await getAuth().getUser(feedback.userId).catch(() => null)
    await sendNotificationEmail({
      to: targetUser?.email,
      subject: '[Voice Identity Shield] Your feedback was updated',
      text: `${notificationMessage}\nStatus: ${status.replace('_', ' ')}`
    })

    res.json({ success: true, message: 'Feedback updated and user notified', data: { feedback } })
  } catch (error) {
    logger.error('Admin feedback update error:', error)
    res.status(500).json({ success: false, error: 'Failed to update feedback' })
  }
})

router.patch('/users/:uid/role', async (req, res) => {
  try {
    const { uid } = req.params
    const role = cleanText(req.body?.role, { maxLength: 10, allowEmpty: false })
    if (!isSafeDocumentId(uid) || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid user or role' })
    }
    if (uid === req.user.uid && role !== 'admin') {
      return res.status(400).json({ success: false, error: 'Administrators cannot remove their own admin role' })
    }

    const targetUser = await getAuth().getUser(uid)
    await getAuth().setCustomUserClaims(uid, { ...(targetUser.customClaims || {}), role })
    // Invalidate existing ID-token sessions so a removed administrator cannot
    // continue using an old privileged token until its normal expiry.
    await getAuth().revokeRefreshTokens(uid)
    await getFirestore().collection('users').doc(uid).set({ role, updatedAt: new Date() }, { merge: true })
    await recordSecurityAlert({
      userId: uid,
      type: 'role_changed',
      severity: 'info',
      message: `Account role changed to ${role}`,
      metadata: { changedBy: req.user.uid, role }
    })
    logger.info('Role changed', { changedBy: req.user.uid, targetUid: uid, role })
    res.json({ success: true, message: 'Role updated. The user must sign in again.' })
  } catch (error) {
    logger.error('Admin role update error:', error)
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ success: false, error: 'User not found' })
    }
    res.status(500).json({ success: false, error: 'Failed to update role' })
  }
})

router.patch('/users/:uid/status', async (req, res) => {
  try {
    const { uid } = req.params
    const status = typeof req.body?.status === 'string'
      ? cleanText(req.body.status, { maxLength: 10, allowEmpty: false }).toLowerCase()
      : ''
    if (!isSafeDocumentId(uid) || !['active', 'blocked'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid user or account status' })
    }
    if (uid === req.user.uid && status === 'blocked') {
      return res.status(400).json({ success: false, error: 'Administrators cannot block their own account' })
    }

    const auth = getAuth()
    await auth.getUser(uid)
    await auth.updateUser(uid, { disabled: status === 'blocked' })
    await auth.revokeRefreshTokens(uid)
    const now = new Date()
    await getFirestore().collection('users').doc(uid).set({
      accountStatus: status,
      blockedAt: status === 'blocked' ? now : null,
      blockedBy: status === 'blocked' ? req.user.uid : null,
      updatedAt: now
    }, { merge: true })
    await recordSecurityAlert({
      userId: uid,
      type: status === 'blocked' ? 'account_blocked' : 'account_activated',
      severity: status === 'blocked' ? 'warning' : 'info',
      message: status === 'blocked' ? 'Account blocked by an administrator' : 'Account activated by an administrator',
      metadata: { changedBy: req.user.uid }
    })

    logger.warn('Account status changed by administrator', { changedBy: req.user.uid, targetUid: uid, status })
    res.json({ success: true, message: status === 'blocked' ? 'Account blocked and active sessions revoked' : 'Account activated' })
  } catch (error) {
    logger.error('Admin account status error:', error)
    if (error.code === 'auth/user-not-found') return res.status(404).json({ success: false, error: 'User not found' })
    res.status(500).json({ success: false, error: 'Failed to update account status' })
  }
})

router.post('/users/:uid/unlock', async (req, res) => {
  try {
    const { uid } = req.params
    if (!isSafeDocumentId(uid)) {
      return res.status(400).json({ success: false, error: 'Invalid user' })
    }
    await getAuth().getUser(uid)
    const profile = await getFirestore().collection('users').doc(uid).get()
    const lockState = getLoginLockState(profile.data()?.loginSecurity)
    if (!lockState.locked) {
      return res.status(409).json({ success: false, error: 'Account is not locked' })
    }
    if (!lockState.canUnlock) {
      return res.status(409).json({
        success: false,
        error: `Account can be unlocked in ${lockState.retryAfterSeconds} seconds`,
        code: 'UNLOCK_COOLDOWN',
        retryAfterSeconds: lockState.retryAfterSeconds
      })
    }
    await unlockAccount(uid)
    await recordSecurityAlert({
      userId: uid,
      type: 'account_unlocked',
      severity: 'info',
      message: 'Temporary login lock removed by an administrator',
      metadata: { unlockedBy: req.user.uid }
    })
    logger.info('Account unlocked by administrator', { unlockedBy: req.user.uid, targetUid: uid })
    res.json({ success: true, message: 'Account login lock removed' })
  } catch (error) {
    logger.error('Admin unlock error:', error)
    if (error.code === 'auth/user-not-found') return res.status(404).json({ success: false, error: 'User not found' })
    res.status(500).json({ success: false, error: 'Failed to unlock account' })
  }
})

router.delete('/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params
    if (!isSafeDocumentId(uid)) {
      return res.status(400).json({ success: false, error: 'Invalid user' })
    }
    if (uid === req.user.uid) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own administrator account' })
    }

    const auth = getAuth()
    const targetUser = await auth.getUser(uid)
    if (typeof req.body?.confirmation !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Enter the user email to confirm permanent deletion'
      })
    }
    const confirmation = cleanText(req.body.confirmation, { maxLength: 254, allowEmpty: false }).toLowerCase()
    if (!targetUser.email || confirmation !== targetUser.email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Enter the user email to confirm permanent deletion'
      })
    }
    if (isAdminRecord(targetUser)) {
      return res.status(409).json({
        success: false,
        error: 'Remove this user\'s admin role before deleting the account'
      })
    }

    const db = getFirestore()
    const voiceprints = await db.collection('voiceprints').where('userId', '==', uid).get()

    for (const document of voiceprints.docs) {
      const data = document.data()
      if (parseLocalAudioReference(data.audioStoragePath)) {
        await deleteOwnedLocalAudio({
          storagePath: data.audioStoragePath,
          requestUserId: uid,
          voiceprintId: document.id,
          voiceprintData: data
        }).catch(error => {
          if (error.code !== 'ENOENT') throw error
        })
      }
    }

    if (!voiceprints.empty) {
      const batch = db.batch()
      voiceprints.docs.forEach(document => batch.delete(document.ref))
      await batch.commit()
    }

    await deleteQueryInBatches(db.collection('enrollments').where('userId', '==', uid))
    await deleteQueryInBatches(db.collection('audit_events').where('userId', '==', uid))
    await deleteQueryInBatches(db.collection('security_alerts').where('userId', '==', uid))
    await deleteQueryInBatches(db.collection('encrypted_feedback').where('userId', '==', uid))
    await deleteQueryInBatches(db.collection('user_notifications').where('userId', '==', uid))
    await deleteQueryInBatches(db.collection('mfaChallenges').where('uid', '==', uid))
    await deleteQueryInBatches(db.collection('usernames').where('uid', '==', uid))
    await db.collection('users').doc(uid).delete()
    await auth.deleteUser(uid)

    logger.warn('User deleted by administrator', {
      deletedBy: req.user.uid,
      targetUid: uid,
      voiceprints: voiceprints.size
    })
    res.json({ success: true, message: 'User and associated data deleted permanently' })
  } catch (error) {
    logger.error('Admin user deletion error:', error)
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ success: false, error: 'User not found' })
    }
    res.status(500).json({ success: false, error: 'Failed to delete user' })
  }
})

export default router
