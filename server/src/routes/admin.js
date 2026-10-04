import express from 'express'
import { getAuth, getFirestore } from '../config/firebase.js'
import { cleanText, isSafeDocumentId } from '../utils/validation.js'
import { logger } from '../utils/logger.js'

const router = express.Router()

router.get('/users', async (req, res) => {
  try {
    const requested = Number.parseInt(req.query.limit, 10)
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 50
    const snapshot = await getFirestore().collection('users').limit(limit).get()
    const users = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        uid: doc.id,
        email: data.email || '',
        displayName: data.displayName || '',
        role: data.role === 'admin' ? 'admin' : 'user',
        emailVerified: Boolean(data.emailVerified),
        mfaEnabled: Boolean(data.mfaEnabled),
        hasVoiceprint: Boolean(data.hasVoiceprint),
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
      }
    })
    res.json({ success: true, data: { users, count: users.length } })
  } catch (error) {
    logger.error('Admin user list error:', error)
    res.status(500).json({ success: false, error: 'Failed to list users' })
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
    await getFirestore().collection('users').doc(uid).set({ role, updatedAt: new Date() }, { merge: true })
    logger.info('Role changed', { changedBy: req.user.uid, targetUid: uid, role })
    res.json({ success: true, message: 'Role updated. The user must sign in again.' })
  } catch (error) {
    logger.error('Admin role update error:', error)
    res.status(500).json({ success: false, error: 'Failed to update role' })
  }
})

export default router
