import express from 'express'
import admin from 'firebase-admin'
import { getFirestore } from '../config/firebase.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'
import { decryptData } from '../services/encryption.js'
import { needsRewrap, unwrapDataKey, wrapDataKey } from '../services/keyManagement.js'
import {
  deleteOwnedLocalAudio,
  parseLocalAudioReference,
  readOwnedLocalAudio
} from '../services/localAudioStorage.js'

const router = express.Router()

const decodeStoragePath = (request) => (
  request.params[0]
    .split('/')
    .map(segment => decodeURIComponent(segment))
    .join('/')
)

const getOwnedVoiceprint = async (storagePath, userId) => {
  const reference = parseLocalAudioReference(storagePath)
  if (!reference) {
    const error = new Error('Invalid local audio reference')
    error.code = 'INVALID_LOCAL_AUDIO_REFERENCE'
    throw error
  }

  const document = await getFirestore()
    .collection('voiceprints')
    .doc(reference.voiceprintId)
    .get()
  const data = document.exists ? document.data() : null

  if (!data || data.userId !== userId) {
    const error = new Error('Access denied')
    error.code = 'LOCAL_AUDIO_ACCESS_DENIED'
    throw error
  }

  return { document, data, voiceprintId: reference.voiceprintId }
}

const getVoiceprintDataKey = async ({ document, data, userId }) => {
  if (data.wrappedDataKey) {
    const dataKey = unwrapDataKey(data.wrappedDataKey)
    if (needsRewrap(data.wrappedDataKey)) {
      await document.ref.set({ wrappedDataKey: wrapDataKey(dataKey) }, { merge: true })
    }
    return dataKey
  }

  const userRef = getFirestore().collection('users').doc(userId)
  const userDoc = await userRef.get()
  const userData = userDoc.data() || {}
  const legacyHex = userData.voiceprintKeys?.[document.id] || userData.voiceprintEncryptionKey

  if (!/^[a-f0-9]{64}$/i.test(String(legacyHex || ''))) {
    const error = new Error('Voiceprint encryption key is unavailable')
    error.code = 'LOCAL_AUDIO_KEY_UNAVAILABLE'
    throw error
  }

  const dataKey = Buffer.from(legacyHex, 'hex')
  await document.ref.set({ wrappedDataKey: wrapDataKey(dataKey) }, { merge: true })
  await userRef.update({
    voiceprintEncryptionKey: admin.firestore.FieldValue.delete(),
    [`voiceprintKeys.${document.id}`]: admin.firestore.FieldValue.delete()
  })
  return dataKey
}

const sendStorageError = (res, error, operation) => {
  if (error.code === 'INVALID_LOCAL_AUDIO_REFERENCE') {
    return res.status(400).json({ success: false, error: 'Invalid audio reference' })
  }
  if (error.code === 'LOCAL_AUDIO_ACCESS_DENIED') {
    return res.status(403).json({ success: false, error: 'Access denied' })
  }
  if (error.code === 'ENOENT') {
    return res.status(404).json({ success: false, error: 'Audio file not found' })
  }
  if (error.code === 'LOCAL_AUDIO_KEY_UNAVAILABLE') {
    return res.status(500).json({ success: false, error: 'Audio decryption key unavailable' })
  }

  logger.error(`${operation} local audio error:`, error)
  return res.status(500).json({ success: false, error: `Failed to ${operation} audio file` })
}

/**
 * Direct storage uploads are disabled. Enrollment is the only supported path
 * because it encrypts audio before committing it to local storage.
 */
router.post('/upload', authenticate, (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Direct storage uploads are disabled; use the enrollment endpoint'
  })
})

/** Download and decrypt the authenticated user's local enrollment audio. */
router.get('/download/*', authenticate, async (req, res) => {
  try {
    const storagePath = decodeStoragePath(req)
    const userId = req.user.uid
    const owned = await getOwnedVoiceprint(storagePath, userId)
    const stored = await readOwnedLocalAudio({
      storagePath,
      requestUserId: userId,
      voiceprintId: owned.voiceprintId,
      voiceprintData: owned.data
    })
    const dataKey = await getVoiceprintDataKey({
      document: owned.document,
      data: owned.data,
      userId
    })
    const payload = JSON.parse(stored.buffer.toString('utf8'))
    const decrypted = decryptData(payload, dataKey)
    const audioBuffer = Buffer.isBuffer(decrypted) ? decrypted : Buffer.from(decrypted)
    const originalName = String(
      payload.originalFileName || owned.data.enrollmentMeta?.processedFileName || 'voice-recording.wav'
    ).replace(/[^A-Za-z0-9._-]/g, '_')

    res.setHeader('Content-Type', payload.originalMimeType || 'audio/wav')
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`)
    res.setHeader('Cache-Control', 'private, no-store')
    logger.info('Local audio downloaded:', { userId, voiceprintId: owned.voiceprintId })
    return res.send(audioBuffer)
  } catch (error) {
    return sendStorageError(res, error, 'download')
  }
})

/** Local audio has no public URL; playback must use authenticated download. */
router.get('/url/*', authenticate, async (req, res) => {
  try {
    const storagePath = decodeStoragePath(req)
    await getOwnedVoiceprint(storagePath, req.user.uid)
    return res.status(409).json({
      success: false,
      error: 'Public audio URLs are disabled',
      code: 'AUTHENTICATED_DOWNLOAD_REQUIRED'
    })
  } catch (error) {
    return sendStorageError(res, error, 'resolve')
  }
})

/** Delete the authenticated user's local encrypted audio file. */
router.delete('/delete/*', authenticate, async (req, res) => {
  try {
    const storagePath = decodeStoragePath(req)
    const userId = req.user.uid
    const owned = await getOwnedVoiceprint(storagePath, userId)
    const result = await deleteOwnedLocalAudio({
      storagePath,
      requestUserId: userId,
      voiceprintId: owned.voiceprintId,
      voiceprintData: owned.data
    })

    if (result.missing) {
      return res.status(404).json({ success: false, error: 'Audio file not found' })
    }

    logger.info('Local audio deleted:', { userId, voiceprintId: owned.voiceprintId })
    return res.json({ success: true, message: 'Audio file deleted successfully' })
  } catch (error) {
    return sendStorageError(res, error, 'delete')
  }
})

export default router
