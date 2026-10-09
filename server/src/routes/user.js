import express from 'express'
import admin from 'firebase-admin'
import { getFirestore } from '../config/firebase.js'
import { authenticate, requireRecentAuthentication } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'
import {
  cleanText,
  isSafeDocumentId,
  isValidPersonName,
  isValidUsername,
  normalizePersonName,
  normalizeUsername,
} from '../utils/validation.js'
import { wrapDataKey } from '../services/keyManagement.js'
import {
  createLocalAudioReference,
  deleteOwnedLocalAudio,
  parseLocalAudioReference
} from '../services/localAudioStorage.js'
import {
  listUserFeedback,
  listUserNotifications,
  markUserNotificationRead,
  storeEncryptedFeedback
} from '../services/securityNotifications.js'
import { openEventStream } from '../services/eventStream.js'

const router = express.Router()

// Lazy initialization - get db when needed, not at module load
const getDbInstance = () => getFirestore()

const deleteQueryInBatches = async query => {
  let deleted = 0
  while (true) {
    const snapshot = await query.limit(400).get()
    if (snapshot.empty) break
    const batch = getDbInstance().batch()
    snapshot.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    deleted += snapshot.size
  }
  return deleted
}

const toIsoString = (value) => {
  if (!value) {
    return value ?? null
  }

  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString()
    } catch {
      return value.toString?.() || null
    }
  }

  return value
}

const normalizeEncryptionKey = (key) => {
  if (!key) {
    return null
  }

  if (Buffer.isBuffer(key)) {
    return key.toString('hex')
  }

  if (typeof key === 'string') {
    return key
  }

  if (typeof key === 'object' && typeof key.toString === 'function') {
    return key.toString()
  }

  return null
}

const mapVoiceprintDoc = (doc) => {
  if (!doc?.exists) {
    return null
  }

  const data = { ...doc.data() }

  // Cryptographic material and biometric ciphertext never leave the API.
  delete data.wrappedDataKey
  delete data.encryptedEmbedding
  delete data.encryptedFeatureVector
  delete data.encryptedFeatureSummary
  delete data.integrityHash
  delete data.featureIntegrityHash

  data.createdAt = toIsoString(data.createdAt)
  data.updatedAt = toIsoString(data.updatedAt)

  const localReference = parseLocalAudioReference(data.audioStoragePath)
  if (data.audioStorageType === 'local' || localReference) {
    data.audioStoragePath = createLocalAudioReference(doc.id)
    data.audioUrl = null
  } else {
    // Unsupported/legacy external paths are never reflected to the client.
    delete data.audioStoragePath
    delete data.audioUrl
  }

  if (data.enrollmentMeta) {
    data.enrollmentMeta = {
      ...data.enrollmentMeta,
      createdAt: toIsoString(data.enrollmentMeta.createdAt),
      updatedAt: toIsoString(data.enrollmentMeta.updatedAt),
    }
    delete data.enrollmentMeta.processedFilePath
    if (data.audioStoragePath) {
      data.enrollmentMeta.storageFilePath = data.audioStoragePath
    }
  }

  const resolvedName = data.name || data.enrollmentMeta?.name || 'My Voice Recording'

  return {
    id: doc.id,
    ...data,
    name: resolvedName,
  }
}

/**
 * GET /api/user/profile
 * Get user profile
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid

    const db = getDbInstance()
    const userDoc = await db.collection('users').doc(userId).get()

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found'
      })
    }

    const data = userDoc.data()
    
    // Convert Firestore timestamps to ISO strings
    const profile = {
      email: data.email || req.user.email || '',
      username: data.username || '',
      displayName: data.displayName || '',
      age: data.age ?? null,
      phoneNumber: data.phoneNumber ?? null,
      gender: data.gender ?? null,
      country: data.country ?? null,
      role: req.user.role,
      emailVerified: req.user.emailVerified,
      mfaEnabled: Boolean(data.mfaEnabled),
      hasVoiceprint: Boolean(data.hasVoiceprint),
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      lastLogin: data.lastLogin?.toDate?.()?.toISOString() || data.lastLogin,
      memberSince: data.memberSince?.toDate?.()?.toISOString() || data.memberSince,
      registrationDate: data.registrationDate?.toDate?.()?.toISOString() || data.registrationDate,
    }

    res.json({
      success: true,
      data: profile
    })
  } catch (error) {
    logger.error('Get user profile error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile',
      message: error.message
    })
  }
})

/**
 * PUT /api/user/profile
 * Update user profile
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid
    const updates = req.body

    // Validate updates
    const allowedFields = ['username', 'displayName', 'age', 'phoneNumber', 'gender', 'country']
    const filteredUpdates = {}
    
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        filteredUpdates[field] = updates[field]
      }
    }

    if (Object.hasOwn(filteredUpdates, 'displayName')) {
      filteredUpdates.displayName = normalizePersonName(filteredUpdates.displayName)
      if (!isValidPersonName(filteredUpdates.displayName)) {
        return res.status(400).json({ success: false, error: 'Full name must contain letters and spaces only' })
      }
    }
    if (Object.hasOwn(filteredUpdates, 'username')) {
      filteredUpdates.username = normalizeUsername(filteredUpdates.username)
      if (!isValidUsername(filteredUpdates.username)) {
        return res.status(400).json({
          success: false,
          error: 'Username must be 3-30 characters and use only letters, numbers, dots, underscores, or hyphens'
        })
      }
      filteredUpdates.usernameNormalized = filteredUpdates.username
    }
    if (Object.hasOwn(filteredUpdates, 'country')) {
      filteredUpdates.country = filteredUpdates.country == null
        ? null
        : cleanText(filteredUpdates.country, { maxLength: 80 })
    }
    if (Object.hasOwn(filteredUpdates, 'phoneNumber')) {
      const phone = filteredUpdates.phoneNumber
      if (phone != null && (typeof phone !== 'string' || !/^\+?[0-9 ()-]{7,24}$/.test(phone))) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' })
      }
    }
    if (Object.hasOwn(filteredUpdates, 'age')) {
      if (filteredUpdates.age == null || filteredUpdates.age === '') {
        filteredUpdates.age = null
      } else {
      const age = Number(filteredUpdates.age)
      if (!Number.isInteger(age) || age < 13 || age > 120) {
        return res.status(400).json({ success: false, error: 'Age must be between 13 and 120' })
      }
      filteredUpdates.age = age
      }
    }
    if (Object.hasOwn(filteredUpdates, 'gender') && ![null, '', 'male', 'female'].includes(filteredUpdates.gender)) {
      return res.status(400).json({ success: false, error: 'Invalid gender value' })
    }

    // Add updatedAt timestamp
    filteredUpdates.updatedAt = new Date()

    const db = getDbInstance()
    const userRef = db.collection('users').doc(userId)
    const currentProfile = (await userRef.get()).data() || {}
    const previousUsername = normalizeUsername(currentProfile.username)
    const nextUsername = filteredUpdates.username
    let reservedUsernameRef = null

    if (nextUsername && nextUsername !== previousUsername) {
      const nextRef = db.collection('usernames').doc(nextUsername)
      try {
        await nextRef.create({ uid: userId, email: req.user.email || '', createdAt: new Date() })
        reservedUsernameRef = nextRef
      } catch (error) {
        if (error.code === 6 || error.code === 'already-exists') {
          const existing = await nextRef.get()
          if (existing.data()?.uid !== userId) {
            return res.status(409).json({ success: false, error: 'Username is already taken' })
          }
        } else {
          throw error
        }
      }
    }

    try {
      await userRef.update(filteredUpdates)
    } catch (error) {
      if (reservedUsernameRef) await reservedUsernameRef.delete().catch(() => {})
      throw error
    }

    if (nextUsername && previousUsername && nextUsername !== previousUsername) {
      const previousRef = db.collection('usernames').doc(previousUsername)
      const previousDoc = await previousRef.get()
      if (previousDoc.data()?.uid === userId) await previousRef.delete()
    }

    logger.info('User profile updated:', { userId })

    res.json({
      success: true,
      message: 'Profile updated successfully'
    })
  } catch (error) {
    logger.error('Update user profile error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      message: error.message
    })
  }
})

/**
 * GET /api/user/voiceprint
 * Get user voiceprint
 */
router.get('/voiceprint', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid

    // Get user profile to find voiceprintId
    const db = getDbInstance()
    const userDoc = await db.collection('users').doc(userId).get()
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found'
      })
    }

    const userData = userDoc.data()
    
    if (!userData.voiceprintId) {
      return res.status(404).json({
        success: false,
        error: 'No voiceprint found for this user'
      })
    }

    const voiceprintId = userData.voiceprintId
    const voiceprintDoc = await db.collection('voiceprints').doc(voiceprintId).get() // db already initialized above

    if (!voiceprintDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Voiceprint document not found'
      })
    }

    const voiceprintData = mapVoiceprintDoc(voiceprintDoc)

    res.json({
      success: true,
      data: {
        ...voiceprintData,
        timestamp: voiceprintData?.createdAt || new Date().toISOString(),
      }
    })
  } catch (error) {
    logger.error('Get voiceprint error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get voiceprint',
      message: error.message
    })
  }
})

/**
 * GET /api/user/voiceprints
 * Get all voiceprints for the authenticated user
 */
router.get('/voiceprints', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid

    const db = getDbInstance()
    const userDoc = await db.collection('users').doc(userId).get()
    const snapshot = await db.collection('voiceprints')
      .where('userId', '==', userId)
      .get()

    const voiceprints = snapshot.docs
      .map((doc) => mapVoiceprintDoc(doc))
      .filter(Boolean)
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })

    res.json({
      success: true,
      data: voiceprints,
      count: voiceprints.length
    })
  } catch (error) {
    logger.error('Get voiceprints error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get voiceprints',
      message: error.message
    })
  }
})

/**
 * POST /api/user/voiceprint
 * Store voiceprint
 */
router.post('/voiceprint', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid
    const { voiceprintData, encryptionKey, name } = req.body

    if (!voiceprintData) {
      return res.status(400).json({
        success: false,
        error: 'Voiceprint data is required'
      })
    }

    // Create voiceprint document
    const db = getDbInstance()
    const voiceprintRef = db.collection('voiceprints').doc()
    const voiceprintId = voiceprintRef.id

    const normalizedKey = normalizeEncryptionKey(encryptionKey)
    if (!normalizedKey || !/^[a-f0-9]{64}$/i.test(normalizedKey)) {
      return res.status(400).json({ success: false, error: 'A valid 256-bit encryption key is required' })
    }

    const voiceprintDoc = {
      userId,
      encryptedFeatures: voiceprintData.encryptedFeatures,
      audioStoragePath: voiceprintData.audioStoragePath,
      audioUrl: voiceprintData.audioUrl,
      duration: voiceprintData.duration,
      sampleRate: voiceprintData.sampleRate,
      name: name || voiceprintData.name || 'My Voice Recording',
      createdAt: new Date(),
      updatedAt: new Date(),
      wrappedDataKey: wrapDataKey(Buffer.from(normalizedKey, 'hex')),
    }

    await voiceprintRef.set(voiceprintDoc)

    // Update user profile with voiceprint reference
    const userRef = db.collection('users').doc(userId) // db already initialized above
    const userUpdate = {
      voiceprintId: voiceprintId,
      voiceprintIds: admin.firestore.FieldValue.arrayUnion(voiceprintId),
      hasVoiceprint: true,
      voiceprintCreatedAt: new Date(),
      updatedAt: new Date(),
    }

    await userRef.set(userUpdate, { merge: true })

    logger.info('Voiceprint stored:', { userId, voiceprintId })

    res.json({
      success: true,
      data: {
        voiceprintId
      }
    })
  } catch (error) {
    logger.error('Store voiceprint error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to store voiceprint',
      message: error.message
    })
  }
})

/**
 * PUT /api/user/voiceprint/name
 * Update voiceprint name
 */
router.put('/voiceprint/name', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid
    const { name, voiceprintId: requestedVoiceprintId } = req.body || {}

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Name cannot be empty'
      })
    }

    const db = getDbInstance()
    const userDoc = await db.collection('users').doc(userId).get()

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'No voiceprint found for this user'
      })
    }

    const userData = userDoc.data()
    const fallbackVoiceprintId = userData?.voiceprintId
    const targetVoiceprintId = requestedVoiceprintId || fallbackVoiceprintId

    if (!targetVoiceprintId) {
      return res.status(404).json({
        success: false,
        error: 'No voiceprint found for this user'
      })
    }

    const voiceprintDoc = await db.collection('voiceprints').doc(targetVoiceprintId).get()

    if (!voiceprintDoc.exists || voiceprintDoc.data()?.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Voiceprint not found or does not belong to this user'
      })
    }

    const safeName = cleanText(name, { maxLength: 80, allowEmpty: false })
    await db.collection('voiceprints').doc(targetVoiceprintId).update({
      name: safeName,
      updatedAt: new Date(),
    })

    logger.info('Voiceprint name updated:', { userId, voiceprintId: targetVoiceprintId, name })

    res.json({
      success: true,
      message: 'Voiceprint name updated successfully'
    })
  } catch (error) {
    logger.error('Update voiceprint name error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update voiceprint name',
      message: error.message
    })
  }
})

/**
 * DELETE /api/user/voiceprint
 * Delete voiceprint
 */
router.delete('/voiceprint', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid
    const { voiceprintId: requestedVoiceprintId } = req.body || {}

    // Get user profile to find voiceprintId
    const db = getDbInstance()
    const userDoc = await db.collection('users').doc(userId).get()

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'No voiceprint found for this user'
      })
    }

    const userData = userDoc.data()
    const fallbackVoiceprintId = userData?.voiceprintId
    const voiceprintId = requestedVoiceprintId || fallbackVoiceprintId

    if (!voiceprintId) {
      return res.status(404).json({
        success: false,
        error: 'No voiceprint found for this user'
      })
    }

    // Get voiceprint data to find audioStoragePath before deleting
    const voiceprintDoc = await db.collection('voiceprints').doc(voiceprintId).get()
    const voiceprintData = voiceprintDoc.exists ? voiceprintDoc.data() : null

    if (!voiceprintData || voiceprintData.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Voiceprint not found or does not belong to this user'
      })
    }

    // Delete the owned local ciphertext before removing its ownership record.
    // A missing file is harmless, while other failures abort to avoid orphans.
    let audioDeleted = false
    const audioStoragePath = voiceprintData.audioStoragePath || null
    if (parseLocalAudioReference(audioStoragePath)) {
      const deletion = await deleteOwnedLocalAudio({
        storagePath: audioStoragePath,
        requestUserId: userId,
        voiceprintId,
        voiceprintData
      })
      audioDeleted = deletion.deleted === true
    }

    // Delete voiceprint document
    await db.collection('voiceprints').doc(voiceprintId).delete()

    const remainingSnapshot = await db.collection('voiceprints')
      .where('userId', '==', userId)
      .limit(1)
      .get()

    const hasRemainingVoiceprints = !remainingSnapshot.empty
    const userRef = db.collection('users').doc(userId)
    const userUpdate = {
      updatedAt: new Date(),
      voiceprintIds: admin.firestore.FieldValue.arrayRemove(voiceprintId),
    }

    if (hasRemainingVoiceprints) {
      const nextVoiceprintDoc = remainingSnapshot.docs[0]
      const nextVoiceprintData = nextVoiceprintDoc.data()
      userUpdate.voiceprintId = nextVoiceprintDoc.id
      userUpdate.voiceprintCreatedAt = nextVoiceprintData?.createdAt || new Date()
      userUpdate.hasVoiceprint = true
    } else {
      userUpdate.voiceprintId = null
      userUpdate.voiceprintCreatedAt = null
      userUpdate.hasVoiceprint = false
    }

    await userRef.update(userUpdate)

    logger.info('Voiceprint deleted:', { userId, voiceprintId, audioDeleted })

    res.json({
      success: true,
      message: 'Voiceprint deleted successfully',
      data: {
        audioDeleted
      }
    })
  } catch (error) {
    logger.error('Delete voiceprint error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete voiceprint',
      message: error.message
    })
  }
})

/** Store user feedback encrypted at rest with AES-256-GCM. */
router.get('/feedback', async (req, res) => {
  try {
    const feedback = await listUserFeedback(req.user.uid, 50)
    res.json({ success: true, data: { feedback, count: feedback.length } })
  } catch (error) {
    logger.error('User feedback history failed:', error)
    res.status(500).json({ success: false, error: 'Failed to load feedback history' })
  }
})

router.post('/feedback', async (req, res) => {
  try {
    if (typeof req.body?.message !== 'string' || !req.body.message.trim()) {
      return res.status(400).json({ success: false, error: 'Feedback message is required' })
    }
    const category = cleanText(req.body?.category || 'general', { maxLength: 20 }).toLowerCase()
    const message = cleanText(req.body?.message, { maxLength: 2000, allowEmpty: false })
    if (!['general', 'bug', 'security', 'suggestion'].includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid feedback category' })
    }
    const feedbackId = await storeEncryptedFeedback({
      userId: req.user.uid,
      category,
      message
    })
    logger.info('Encrypted feedback submitted', { userId: req.user.uid, feedbackId, category })
    res.status(201).json({
      success: true,
      message: 'Feedback submitted securely',
      data: { feedbackId, encrypted: true }
    })
  } catch (error) {
    logger.error('Encrypted feedback submission failed:', error)
    res.status(500).json({ success: false, error: 'Failed to submit feedback' })
  }
})

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await listUserNotifications(req.user.uid, 50)
    res.json({ success: true, data: { notifications, count: notifications.length } })
  } catch (error) {
    logger.error('User notification list failed:', error)
    res.status(500).json({ success: false, error: 'Failed to load notifications' })
  }
})

router.patch('/notifications/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params
    if (!isSafeDocumentId(notificationId)) return res.status(400).json({ success: false, error: 'Invalid notification' })
    const found = await markUserNotificationRead({ notificationId, userId: req.user.uid })
    if (!found) return res.status(404).json({ success: false, error: 'Notification not found' })
    res.json({ success: true, message: 'Notification marked as read' })
  } catch (error) {
    logger.error('User notification update failed:', error)
    res.status(500).json({ success: false, error: 'Failed to update notification' })
  }
})

router.get('/events', (req, res) => openEventStream(req, res, `user:${req.user.uid}`))

/**
 * DELETE /api/user/account
 * Irreversibly erase the authenticated user's biometric files and records.
 * A freshly issued Firebase token and an explicit confirmation are required.
 */
router.delete('/account', authenticate, requireRecentAuthentication(300), async (req, res) => {
  try {
    if (req.body?.confirmation !== 'DELETE') {
      return res.status(400).json({
        success: false,
        error: 'Type DELETE to confirm account erasure',
        code: 'ACCOUNT_DELETE_CONFIRMATION_REQUIRED'
      })
    }

    const userId = req.user.uid
    const db = getDbInstance()
    const voiceprints = await db.collection('voiceprints').where('userId', '==', userId).get()

    for (const document of voiceprints.docs) {
      const data = document.data()
      if (parseLocalAudioReference(data.audioStoragePath)) {
        await deleteOwnedLocalAudio({
          storagePath: data.audioStoragePath,
          requestUserId: userId,
          voiceprintId: document.id,
          voiceprintData: data
        }).catch(error => {
          if (error.code !== 'ENOENT') throw error
        })
      }
    }

    const voiceprintBatch = db.batch()
    voiceprints.docs.forEach(document => voiceprintBatch.delete(document.ref))
    if (!voiceprints.empty) await voiceprintBatch.commit()

    await deleteQueryInBatches(db.collection('enrollments').where('userId', '==', userId))
    await deleteQueryInBatches(db.collection('audit_events').where('userId', '==', userId))
    await deleteQueryInBatches(db.collection('security_alerts').where('userId', '==', userId))
    await deleteQueryInBatches(db.collection('encrypted_feedback').where('userId', '==', userId))
    await deleteQueryInBatches(db.collection('user_notifications').where('userId', '==', userId))
    await deleteQueryInBatches(db.collection('mfaChallenges').where('uid', '==', userId))
    await deleteQueryInBatches(db.collection('usernames').where('uid', '==', userId))
    await db.collection('users').doc(userId).delete()
    await admin.auth().deleteUser(userId)

    logger.info('User account and biometric records erased:', {
      userId,
      voiceprints: voiceprints.size
    })
    return res.json({ success: true, message: 'Account and biometric data deleted' })
  } catch (error) {
    logger.error('Account erasure failed:', error)
    return res.status(500).json({ success: false, error: 'Account erasure failed' })
  }
})

export default router
