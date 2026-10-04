import express from 'express'
import multer from 'multer'
import admin from 'firebase-admin'
import { authenticate } from '../middleware/auth.js'
import { strictLimiter } from '../middleware/rateLimiter.js'
import { logger } from '../utils/logger.js'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { preprocessAudio, validateAudioFile, cleanupFiles } from '../services/audioPreprocessor.js'
import { getFirestore } from '../config/firebase.js'
import { logVerification, getUserAuditEvents } from '../services/auditLogger.js'
import { processVerification, makeDecision, calculateRiskScore } from '../services/scoreFusion.js'
import { needsRewrap, unwrapDataKey, wrapDataKey } from '../services/keyManagement.js'
import { isSafeDocumentId } from '../utils/validation.js'
import { extractEmbedding, calculateCosineSimilarity } from '../services/featureExtractor.js'
import { detectSynthetic } from '../services/antiSpoof.js'
import { createTemporaryFileTracker } from '../services/temporaryFiles.js'

const router = express.Router()

// Configure multer for file uploads
const uploadDir = process.env.UPLOAD_DIR || './uploads'
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
const AUDIO_EXTENSIONS = new Map([
  ['audio/webm', 'webm'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['audio/m4a', 'm4a'],
  ['audio/x-m4a', 'm4a']
])

// Ensure upload directory exists
mkdir(uploadDir, { recursive: true }).catch(err => {
  logger.error('Failed to create upload directory:', err.message)
})

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`
    const ext = AUDIO_EXTENSIONS.get(file.mimetype) || 'bin'
    cb(null, `verify-${req.user.uid}-${uniqueSuffix}.${ext}`)
  }
})

const fileFilter = (req, file, cb) => {
  // Accept audio files
  if (AUDIO_EXTENSIONS.has(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid audio file type'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSize
  }
})

const buildVectorComparison = (probeVector, referenceVector, options = {}) => {
  if (
    !Array.isArray(probeVector) ||
    !Array.isArray(referenceVector) ||
    probeVector.length !== referenceVector.length
  ) {
    return null
  }

  const { labels = null, previewLimit = 96 } = options
  const dimension = probeVector.length
  const previewCount = Math.min(previewLimit, dimension)

  const probePreview = []
  const referencePreview = []
  const differencePreview = []
  const deltaDetails = []

  let sumDiff = 0
  let sumAbsDiff = 0
  let sumSquares = 0
  let maxAbsDiff = Number.NEGATIVE_INFINITY
  let minAbsDiff = Number.POSITIVE_INFINITY

  for (let i = 0; i < dimension; i++) {
    const probeValue = Number(probeVector[i]) || 0
    const referenceValue = Number(referenceVector[i]) || 0
    const diff = probeValue - referenceValue
    const absDiff = Math.abs(diff)
    const label = Array.isArray(labels) && labels[i] ? labels[i] : null

    sumDiff += diff
    sumAbsDiff += absDiff
    sumSquares += diff * diff
    if (absDiff > maxAbsDiff) {
      maxAbsDiff = absDiff
    }
    if (absDiff < minAbsDiff) {
      minAbsDiff = absDiff
    }

    if (i < previewCount) {
      probePreview.push(probeValue)
      referencePreview.push(referenceValue)
      differencePreview.push(diff)
    }

    if (deltaDetails.length < 128) {
      deltaDetails.push({
        index: i,
        label,
        probe: probeValue,
        reference: referenceValue,
        delta: diff,
        magnitude: absDiff
      })
    } else {
      // Maintain top 128 magnitudes using simple replacement
      const smallestIndex = deltaDetails.reduce(
        (acc, entry, idx, arr) => (entry.magnitude < arr[acc].magnitude ? idx : acc),
        0
      )
      if (absDiff > deltaDetails[smallestIndex].magnitude) {
        deltaDetails[smallestIndex] = {
          index: i,
          label,
          probe: probeValue,
          reference: referenceValue,
          delta: diff,
          magnitude: absDiff
        }
      }
    }
  }

  const meanDiff = sumDiff / dimension
  const meanAbsDiff = sumAbsDiff / dimension
  const l2Distance = Math.sqrt(sumSquares)

  deltaDetails.sort((a, b) => b.magnitude - a.magnitude)

  return {
    dimension,
    previewCount,
    labels: labels || null,
    probePreview,
    referencePreview,
    differencePreview,
    stats: {
      meanDiff,
      meanAbsDiff,
      maxAbsDiff,
      minAbsDiff: Number.isFinite(minAbsDiff) ? minAbsDiff : 0,
      l2Distance
    },
    topDeltas: deltaDetails.slice(0, 10)
  }
}

const isBase64String = value => {
  if (typeof value !== 'string') {
    return false
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length % 4 !== 0) {
    return false
  }
  return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)
}

const bufferToFloatArray = buffer => {
  if (!buffer || buffer.length % 4 !== 0) {
    return null
  }
  const result = new Array(buffer.length / 4)
  for (let i = 0; i < result.length; i++) {
    result[i] = buffer.readFloatLE(i * 4)
  }
  return result
}

const tryParseJSON = value => {
  if (typeof value !== 'string') {
    return null
  }
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const coerceToNumericArray = payload => {
  if (!payload) {
    return null
  }

  const sanitizeArray = array => {
    if (!Array.isArray(array)) {
      return null
    }
    const numeric = array.map(value => {
      const numberValue = Number(value)
      return Number.isFinite(numberValue) ? numberValue : 0
    })
    return numeric.every(value => Number.isFinite(value)) ? numeric : null
  }

  if (Array.isArray(payload)) {
    return sanitizeArray(payload)
  }

  if (ArrayBuffer.isView(payload)) {
    const buffer = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)
    return bufferToFloatArray(buffer)
  }

  if (payload instanceof ArrayBuffer) {
    const buffer = Buffer.from(payload)
    return bufferToFloatArray(buffer)
  }

  if (payload?.type === 'Buffer' && Array.isArray(payload?.data)) {
    const buffer = Buffer.from(payload.data)
    return bufferToFloatArray(buffer)
  }

  if (Array.isArray(payload?.data)) {
    return sanitizeArray(payload.data)
  }

  if (typeof payload?.data === 'string') {
    const parsed = coerceToNumericArray(payload.data)
    if (Array.isArray(parsed)) {
      return parsed
    }
  }

  if (Array.isArray(payload?.values)) {
    return sanitizeArray(payload.values)
  }

  if (Array.isArray(payload?.vector)) {
    return sanitizeArray(payload.vector)
  }

  if (typeof payload === 'object' && payload !== null) {
    const keys = Object.keys(payload)
    if (keys.length > 0) {
      const numericKeys = keys.every(key => /^[0-9]+$/.test(key))
      if (numericKeys) {
        const orderedValues = keys
          .map(Number)
          .sort((a, b) => a - b)
          .map(key => payload[key])
        const orderedNumeric = sanitizeArray(orderedValues)
        if (orderedNumeric) {
          return orderedNumeric
        }
      }
      const directValues = keys.map(key => payload[key])
      const directNumeric = sanitizeArray(directValues)
      if (directNumeric) {
        return directNumeric
      }
    }
    const entries = Object.values(payload)
    if (entries.length && entries.every(value => Number.isFinite(Number(value)))) {
      return sanitizeArray(entries.map(Number))
    }
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (!trimmed) {
      return null
    }

    try {
      const parsed = JSON.parse(trimmed)
      const parsedArray = coerceToNumericArray(parsed)
      if (Array.isArray(parsedArray) && parsedArray.length > 0) {
        return parsedArray
      }
    } catch {
      // Not JSON, continue with other fallbacks
    }

    if (trimmed.includes(',')) {
      const parts = trimmed.split(/[, \r\n\t]+/).filter(Boolean)
      const values = parts.map(part => Number(part))
      if (values.every(Number.isFinite)) {
        return values
      }
    }

    if (isBase64String(trimmed)) {
      try {
        const decodedBuffer = Buffer.from(trimmed, 'base64')
        const decodedArray = bufferToFloatArray(decodedBuffer)
        if (decodedArray) {
          return decodedArray
        }
      } catch {
        // Ignore base64 decode errors
      }
    }
  }

  return null
}

const normalizeVectorLength = (vector, targetLength) => {
  if (!Array.isArray(vector) || typeof targetLength !== 'number' || targetLength <= 0) {
    return vector
  }

  if (vector.length === targetLength) {
    return vector
  }

  if (vector.length > targetLength) {
    return vector.slice(0, targetLength)
  }

  const padded = vector.slice()
  while (padded.length < targetLength) {
    padded.push(0)
  }
  return padded
}

/**
 * POST /api/verify
 * Verify audio against enrolled voiceprint
 */
router.post(
  '/',
  authenticate,
  strictLimiter,
  upload.single('audio'),
  async (req, res) => {
    const temporaryFiles = createTemporaryFileTracker()
    temporaryFiles.add(req.file?.path)
    const sendJson = res.json.bind(res)
    res.json = async payload => {
      await temporaryFiles.cleanup()
      return sendJson(payload)
    }

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No audio file provided',
          message: 'Please upload an audio file'
        })
      }

      const { targetUserId } = req.body || {}
      const userId = req.user.uid
      const verifyUserId = targetUserId || userId // Default to self-verification
      if (!isSafeDocumentId(verifyUserId)) {
        return res.status(400).json({ success: false, error: 'Invalid target user ID' })
      }
      if (verifyUserId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only administrators can verify against another user account',
          code: 'ROLE_FORBIDDEN',
        })
      }
      const filePath = req.file.path
      const fileName = req.file.filename

      const verificationId = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      const baseMetadata = {
        verificationId,
        fileName,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        initiatedBy: userId,
        targetUserId: verifyUserId
      }

      logger.info('Verification request received:', {
        ...baseMetadata,
        userId,
        verifyUserId
      })

      // Log verification start
      await logVerification(verifyUserId, 'processing', null, null, baseMetadata)

      // Step 1: Validate audio file
      const validation = await validateAudioFile(filePath)
      if (!validation.valid) {
        await cleanupFiles([filePath])
        await logVerification(
          verifyUserId,
          'failure',
          null,
          'REJECT',
          {
            ...baseMetadata,
            failureReason: validation.error
          },
          new Error(validation.error)
        )
        return res.status(400).json({
          success: false,
          error: 'Invalid audio file',
          message: validation.error
        })
      }

      logger.info('Audio validation passed:', validation.metadata)

      // Step 2: Preprocess audio (denoise, VAD, normalize, resample to 16kHz)
      const uploadDir = process.env.UPLOAD_DIR || './uploads'
      const processedFileName = `processed-${fileName.replace(/\.[^/.]+$/, '.wav')}`
      const processedFilePath = join(uploadDir, processedFileName)
      temporaryFiles.add(
        processedFilePath,
        processedFilePath.replace(/\.wav$/i, '_vad.wav')
      )

      let processedAudio = null
      try {
        processedAudio = await preprocessAudio(filePath, processedFilePath, {
          enableDenoise: true,
          enableVAD: true,
          enableNormalize: true,
          targetSampleRate: 16000
        })
        temporaryFiles.add(processedAudio.outputPath)

        logger.info('Audio preprocessing completed:', processedAudio.metadata)

        // Cleanup original file after processing
        await cleanupFiles([filePath])
      } catch (preprocessError) {
        logger.error('Audio preprocessing failed:', preprocessError.message)
        await cleanupFiles([filePath, processedFilePath])
        await logVerification(
          verifyUserId,
          'failure',
          null,
          'REJECT',
          {
            ...baseMetadata,
            failureReason: preprocessError.message
          },
          preprocessError
        )
        return res.status(500).json({
          success: false,
          error: 'Audio processing failed',
          message: preprocessError.message
        })
      }

      // Step 3: Extract features (X-Vector/ECAPA-TDNN)
      const featureResult = await extractEmbedding(processedAudio.outputPath)
      if (!featureResult.success) {
        throw new Error('Feature extraction failed')
      }

      // Step 4: Retrieve stored voiceprint
      const db = getFirestore()
      const userProfile = await db.collection('users').doc(verifyUserId).get()
      if (!userProfile.exists || !userProfile.data().voiceprintId) {
        await logVerification(
          verifyUserId,
          'failure',
          null,
          'REJECT',
          {
            ...baseMetadata,
            failureReason: 'No voiceprint found for user'
          },
          new Error('No voiceprint found')
        )
        return res.status(404).json({
          success: false,
          error: 'No voiceprint found',
          message: 'User must enroll their voice first'
        })
      }

      const userData = userProfile.data()
      const voiceprintId = userData.voiceprintId
      const legacyEncryptionKeyHex =
        userData.voiceprintEncryptionKey ??
        (userData.voiceprintKeys && voiceprintId ? userData.voiceprintKeys[voiceprintId] : null)

      const voiceprintDoc = await db.collection('voiceprints').doc(voiceprintId).get()

      if (!voiceprintDoc.exists) {
        await logVerification(
          verifyUserId,
          'failure',
          null,
          'REJECT',
          {
            ...baseMetadata,
            failureReason: 'Voiceprint document not found'
          },
          new Error('Voiceprint document not found')
        )
        return res.status(404).json({
          success: false,
          error: 'Voiceprint not found',
          message: 'Voiceprint document does not exist'
        })
      }

      const wrappedDataKey = voiceprintDoc.data()?.wrappedDataKey
      if (!wrappedDataKey && !legacyEncryptionKeyHex) {
        await logVerification(
          verifyUserId,
          'failure',
          null,
          'REJECT',
          {
            ...baseMetadata,
            failureReason: 'Encryption key not found'
          },
          new Error('Encryption key not found')
        )
        return res.status(500).json({
          success: false,
          error: 'Encryption key not found',
          message: 'Cannot decrypt voiceprint'
        })
      }

      logger.debug('Voiceprint doc data (sanitized):', {
        encryptionKeyStored: Boolean(wrappedDataKey || legacyEncryptionKeyHex),
        hasEncryptedEmbedding: Boolean(voiceprintDoc.data()?.encryptedEmbedding),
        hasFeatureVector: Boolean(voiceprintDoc.data()?.encryptedFeatureVector),
        legacyKeys: {
          hasVoiceprint: Boolean(voiceprintDoc.data()?.voiceprint),
          hasVoiceprintEmbedding: Boolean(voiceprintDoc.data()?.voiceprint?.embedding),
          hasVoiceprintVector: Boolean(
            Array.isArray(voiceprintDoc.data()?.voiceprint?.embedding?.vector)
          )
        },
        fieldNames: Object.keys(voiceprintDoc.data() || {})
      })

      // Decrypt stored voiceprint embedding
      const { decryptData } = await import('../services/encryption.js')
      const encryptionKey = wrappedDataKey
        ? unwrapDataKey(wrappedDataKey)
        : Buffer.from(legacyEncryptionKeyHex, 'hex')

      if (wrappedDataKey && needsRewrap(wrappedDataKey)) {
        await voiceprintDoc.ref.set({ wrappedDataKey: wrapDataKey(encryptionKey) }, { merge: true })
      }

      // Transparently migrate legacy plaintext data keys to envelope encryption.
      if (!wrappedDataKey && legacyEncryptionKeyHex) {
        await voiceprintDoc.ref.set({ wrappedDataKey: wrapDataKey(encryptionKey) }, { merge: true })
        await userProfile.ref.update({
          voiceprintEncryptionKey: admin.firestore.FieldValue.delete(),
          [`voiceprintKeys.${voiceprintId}`]: admin.firestore.FieldValue.delete(),
        })
      }
      const encryptedEmbedding = voiceprintDoc.data().encryptedEmbedding
      const legacyEmbeddingRaw =
        voiceprintDoc.data()?.encryptedFeatures ||
        voiceprintDoc.data()?.features ||
        voiceprintDoc.data()?.featureVector ||
        null
      logger.debug('Embedding payload introspection:', {
        encryptedEmbeddingKeys: encryptedEmbedding
          ? Object.keys(encryptedEmbedding)
          : null,
        encryptedEmbeddingType: encryptedEmbedding ? typeof encryptedEmbedding : null,
        legacyEmbeddingType: legacyEmbeddingRaw ? typeof legacyEmbeddingRaw : null,
        legacyEmbeddingKeys:
          legacyEmbeddingRaw && typeof legacyEmbeddingRaw === 'object' && !Array.isArray(legacyEmbeddingRaw)
            ? Object.keys(legacyEmbeddingRaw)
            : null,
        legacyStringLength:
          typeof legacyEmbeddingRaw === 'string'
            ? legacyEmbeddingRaw.length
            : null,
        legacyEncryptedShape:
          legacyEmbeddingRaw && legacyEmbeddingRaw.data && legacyEmbeddingRaw.iv && legacyEmbeddingRaw.tag
            ? 'encrypted'
            : null
      })
      
      let storedEmbedding
      try {
        if (encryptedEmbedding && encryptedEmbedding.iv && encryptedEmbedding.tag && encryptedEmbedding.data) {
          storedEmbedding = decryptData(encryptedEmbedding, encryptionKey)
        } else if (Array.isArray(encryptedEmbedding)) {
          storedEmbedding = encryptedEmbedding
        } else if (encryptedEmbedding?.vector && Array.isArray(encryptedEmbedding.vector)) {
          storedEmbedding = encryptedEmbedding.vector
        } else if (encryptedEmbedding?.data && encryptedEmbedding?.iv && encryptedEmbedding?.tag) {
          storedEmbedding = decryptData(encryptedEmbedding, encryptionKey)
        } else if (voiceprintDoc.data()?.voiceprint?.embedding) {
          const legacyEmbedding = voiceprintDoc.data().voiceprint.embedding
          storedEmbedding = Array.isArray(legacyEmbedding)
            ? legacyEmbedding
            : Array.isArray(legacyEmbedding?.vector)
              ? legacyEmbedding.vector
              : (() => {
                  throw new Error('Unsupported voiceprint format')
                })()
        } else if (legacyEmbeddingRaw) {
          if (legacyEmbeddingRaw.iv && legacyEmbeddingRaw.tag && legacyEmbeddingRaw.data) {
            const decryptedLegacy = decryptData(legacyEmbeddingRaw, encryptionKey)
            const coercedLegacy = coerceToNumericArray(decryptedLegacy)
            if (Array.isArray(coercedLegacy)) {
              storedEmbedding = coercedLegacy
            } else if (typeof decryptedLegacy === 'object' && decryptedLegacy !== null) {
              const values = Object.values(decryptedLegacy)
              const coercedValues = coerceToNumericArray(values)
              if (Array.isArray(coercedValues)) {
                storedEmbedding = coercedValues
              }
            } else if (typeof decryptedLegacy === 'string') {
              const parsed = tryParseJSON(decryptedLegacy) ?? coerceToNumericArray(decryptedLegacy)
              if (Array.isArray(parsed)) {
                storedEmbedding = parsed
              } else {
                logger.debug('Legacy decrypted embedding string could not be parsed into array.')
              }
            } else {
              logger.warn('Legacy decrypted embedding is in unsupported format', {
                type: typeof decryptedLegacy,
                keys: decryptedLegacy && typeof decryptedLegacy === 'object' ? Object.keys(decryptedLegacy) : null
              })
            }
          } else if (Array.isArray(legacyEmbeddingRaw)) {
            storedEmbedding = legacyEmbeddingRaw
          } else if (legacyEmbeddingRaw?.vector && Array.isArray(legacyEmbeddingRaw.vector)) {
            storedEmbedding = legacyEmbeddingRaw.vector
          } else if (typeof legacyEmbeddingRaw === 'string') {
            const parsedLegacy = tryParseJSON(legacyEmbeddingRaw) ?? coerceToNumericArray(legacyEmbeddingRaw)
            if (Array.isArray(parsedLegacy)) {
              storedEmbedding = parsedLegacy
            } else {
              logger.warn('Legacy embedding string could not be normalized', {
                preview: legacyEmbeddingRaw.slice(0, 120)
              })
            }
          }
        } else {
          throw new Error('Unsupported voiceprint format')
        }

        logger.debug('Normalized embedding preflight', {
          type: typeof storedEmbedding,
          isBuffer: Buffer.isBuffer?.(storedEmbedding) || false,
          isArray: Array.isArray(storedEmbedding),
          length: Array.isArray(storedEmbedding)
            ? storedEmbedding.length
            : Buffer.isBuffer?.(storedEmbedding)
              ? storedEmbedding.length
              : null,
        })

        storedEmbedding = coerceToNumericArray(storedEmbedding)
          ?? (storedEmbedding && typeof storedEmbedding === 'object'
            ? coerceToNumericArray(Object.values(storedEmbedding))
            : null)
        if (!storedEmbedding || !Array.isArray(storedEmbedding)) {
          logger.error('Voiceprint embedding normalization failed', {
            type: typeof storedEmbedding,
            constructor: storedEmbedding?.constructor?.name || null,
            isArray: Array.isArray(storedEmbedding),
            fallbackKeys: storedEmbedding && typeof storedEmbedding === 'object' ? Object.keys(storedEmbedding) : null,
            propertyNames: storedEmbedding && typeof storedEmbedding === 'object'
              ? Object.getOwnPropertyNames(storedEmbedding).slice(0, 10)
              : null,
            originalPayloadType: typeof encryptedEmbedding,
            legacyPayloadType: typeof legacyEmbeddingRaw
          })
          throw new Error('Unsupported voiceprint format')
        }
      } catch (decryptError) {
        logger.error('Failed to decrypt voiceprint:', decryptError.message)
        await logVerification(
          verifyUserId,
          'failure',
          null,
          'REJECT',
          {
            ...baseMetadata,
            failureReason: 'Decryption failed'
          },
          decryptError
        )
        return res.status(500).json({
          success: false,
          error: 'Failed to decrypt voiceprint',
          message: decryptError.message
        })
      }

      // Step 5: Calculate cosine similarity
      const expectedEmbeddingLength = Array.isArray(featureResult.embedding) ? featureResult.embedding.length : null
      if (expectedEmbeddingLength && storedEmbedding.length !== expectedEmbeddingLength) {
        logger.warn('Embedding length mismatch detected. Normalizing stored embedding length.', {
          storedLength: storedEmbedding.length,
          expectedLength: expectedEmbeddingLength
        })
        storedEmbedding = normalizeVectorLength(storedEmbedding, expectedEmbeddingLength)
      }

      const matchScore = calculateCosineSimilarity(featureResult.embedding, storedEmbedding)
      const biometricComparison = buildVectorComparison(featureResult.embedding, storedEmbedding)

      let storedFeatureVector = null
      const encryptedFeatureVector = voiceprintDoc.data().encryptedFeatureVector || null
      if (encryptedFeatureVector) {
        try {
          if (typeof encryptedFeatureVector === 'string') {
            try {
              const parsed = JSON.parse(encryptedFeatureVector)
              if (parsed && typeof parsed === 'object') {
                storedFeatureVector = coerceToNumericArray(parsed)
              }
            } catch (parseError) {
              logger.debug('Encrypted feature vector string could not be parsed as JSON', {
                error: parseError.message
              })
            }
          }

          if (!storedFeatureVector && encryptedFeatureVector && encryptedFeatureVector.iv && encryptedFeatureVector.tag && encryptedFeatureVector.data) {
            const decryptedFeatures = decryptData(encryptedFeatureVector, encryptionKey)
            storedFeatureVector = coerceToNumericArray(decryptedFeatures)
          } else if (Array.isArray(encryptedFeatureVector)) {
            storedFeatureVector = coerceToNumericArray(encryptedFeatureVector)
          } else if (encryptedFeatureVector?.vector && Array.isArray(encryptedFeatureVector.vector)) {
            storedFeatureVector = coerceToNumericArray(encryptedFeatureVector.vector)
          } else {
            storedFeatureVector = coerceToNumericArray(encryptedFeatureVector)
          }
        } catch (featureDecryptError) {
          logger.warn('Failed to decrypt stored feature vector:', featureDecryptError.message)
        }
      }

      if (storedFeatureVector && Array.isArray(featureResult.featureVector) && storedFeatureVector.length !== featureResult.featureVector.length) {
        logger.warn('Feature vector length mismatch detected. Normalizing stored feature vector length.', {
          storedLength: storedFeatureVector.length,
          expectedLength: featureResult.featureVector.length
        })
        storedFeatureVector = normalizeVectorLength(storedFeatureVector, featureResult.featureVector.length)
      }

      const storedFeatureNames = Array.isArray(voiceprintDoc.data().featureNames)
        ? voiceprintDoc.data().featureNames
        : (Array.isArray(featureResult.featureNames) ? featureResult.featureNames : [])
      let storedFeatureSummary = voiceprintDoc.data().featureSummary || null
      if (voiceprintDoc.data().encryptedFeatureSummary) {
        try {
          storedFeatureSummary = decryptData(voiceprintDoc.data().encryptedFeatureSummary, encryptionKey)
        } catch (summaryError) {
          logger.warn('Failed to decrypt stored feature summary:', summaryError.message)
          storedFeatureSummary = null
        }
      }

      const featureComparison = (
        storedFeatureVector &&
        Array.isArray(featureResult.featureVector) &&
        featureResult.featureVector.length === storedFeatureVector.length
      )
        ? buildVectorComparison(featureResult.featureVector, storedFeatureVector, {
            labels: storedFeatureNames,
            previewLimit: Math.min(storedFeatureNames.length || 96, 96)
          })
        : null

      // Step 6: Run anti-spoof detection
      const antiSpoofResult = await detectSynthetic(processedAudio.outputPath)
      if (
        antiSpoofResult.success !== true ||
        !Number.isFinite(antiSpoofResult.syntheticScore)
      ) {
        const unavailableResult = processVerification({
          matchScore,
          syntheticScore: null,
          antiSpoofAvailable: false
        })

        await logVerification(
          verifyUserId,
          'failure',
          { matchScore, syntheticScore: null, finalScore: null, riskScore: null },
          unavailableResult.verdict,
          {
            ...baseMetadata,
            failureReason: 'Anti-spoof service unavailable',
            failureCode: unavailableResult.decisionCode,
            antispoofError: antiSpoofResult.error || 'Invalid anti-spoof response'
          },
          new Error(antiSpoofResult.error || 'Anti-spoof service unavailable')
        )

        return res.status(503).json({
          success: false,
          error: 'Anti-spoof service unavailable',
          code: unavailableResult.decisionCode,
          message: 'Verification cannot be accepted without anti-spoof validation',
          data: {
            verificationId,
            decision: unavailableResult.verdict,
            ...unavailableResult
          }
        })
      }

      const syntheticScore = antiSpoofResult.syntheticScore
      
      // Step 7: Fuse scores and make decision
      const baseVerificationResult = processVerification({
        matchScore,
        syntheticScore
      })

      const overrideReject = baseVerificationResult?.decisionSource === 'match_override_reject'
      const antiSpoofVeto = baseVerificationResult?.decisionSource === 'anti_spoof_veto'

      const featureStats = featureComparison?.stats || null
      const featureDrift = featureStats
        ? {
            meanAbsDiff: featureStats.meanAbsDiff,
            l2Distance: featureStats.l2Distance,
            maxAbsDiff: featureStats.maxAbsDiff,
            meanDiff: featureStats.meanDiff
          }
        : null

      let adjustedFinalScore = baseVerificationResult.finalScore
      let adjustedVerdict = baseVerificationResult.verdict
      let adjustedRiskLevel = baseVerificationResult.riskLevel
      let adjustedRiskScore = baseVerificationResult.riskScore
      let adjustedConfidence = baseVerificationResult.confidence
      let featurePenalty = 0

      if (featureStats && !overrideReject && !antiSpoofVeto) {
        const meanAbs = Number.isFinite(featureStats.meanAbsDiff) ? Math.abs(featureStats.meanAbsDiff) : 0
        const maxAbs = Number.isFinite(featureStats.maxAbsDiff) ? Math.abs(featureStats.maxAbsDiff) : 0
        const l2 = Number.isFinite(featureStats.l2Distance) ? Math.abs(featureStats.l2Distance) : 0

        // Heuristic penalty: emphasize sustained mean drift, cap to keep score in range
        const driftComponent = Math.max(meanAbs * 3.5, maxAbs * 1.2)
        const l2Component = l2 * 0.04
        featurePenalty = Math.min(0.35, driftComponent + l2Component)

        if (featurePenalty > 0.015) {
          adjustedFinalScore = Math.max(0, adjustedFinalScore - featurePenalty)
          const decision = makeDecision(adjustedFinalScore, baseVerificationResult.thresholds)
          adjustedVerdict = decision.verdict
          adjustedRiskLevel = decision.riskLevel
          adjustedConfidence = decision.confidence
          adjustedRiskScore = calculateRiskScore(adjustedFinalScore)
        }
      }

      const verificationResult = {
        ...baseVerificationResult,
        finalScore: adjustedFinalScore,
        verdict: adjustedVerdict,
        riskLevel: adjustedRiskLevel,
        riskScore: adjustedRiskScore,
        confidence: adjustedConfidence,
        featureMeanAbsDiff: featureStats ? featureStats.meanAbsDiff : null,
        featureL2Distance: featureStats ? featureStats.l2Distance : null,
        featurePenalty,
        featureDrift
      }

      // Step 8: Log audit event with scores and decision
      await logVerification(
        verifyUserId,
        'success',
        {
          matchScore: verificationResult.matchScore,
          syntheticScore: verificationResult.syntheticScore,
          finalScore: verificationResult.finalScore,
          riskScore: verificationResult.riskScore
        },
        verificationResult.verdict,
        {
          ...baseMetadata,
          embeddingModelVersion: featureResult.metadata?.modelVersion || null,
          embeddingServiceLatencyMs: featureResult.metadata?.serviceLatencyMs ?? null,
          embeddingTransportLatencyMs: featureResult.metadata?.transportLatencyMs ?? null,
          antispoofModelVersion: antiSpoofResult.metadata?.modelVersion || null,
          antispoofDecision: antiSpoofResult.metadata?.decision || null,
          antispoofServiceLatencyMs: antiSpoofResult.metadata?.serviceLatencyMs ?? null,
          antispoofTransportLatencyMs: antiSpoofResult.metadata?.transportLatencyMs ?? null,
          biometricComparison: biometricComparison
            ? {
                stats: biometricComparison.stats,
                previewCount: biometricComparison.previewCount
              }
            : null,
          featureComparison: featureComparison
            ? {
                stats: featureComparison.stats,
                previewCount: featureComparison.previewCount,
                topDeltas: featureComparison.topDeltas
              }
            : null,
          featureSummaryAvailable: Boolean(featureResult.features || storedFeatureSummary)
        }
      )

      res.json({
        success: true,
        message: 'Verification completed',
        data: {
          verificationId,
          userId,
          verifyUserId,
          fileName,
          metadata: processedAudio.metadata,
          status: 'success',
          decision: verificationResult.verdict,
          riskScore: verificationResult.riskScore,
          syntheticScore: verificationResult.syntheticScore,
          matchScore: verificationResult.matchScore,
          finalScore: verificationResult.finalScore,
          embeddingModelVersion: featureResult.metadata?.modelVersion || null,
          embeddingLatencyMs: featureResult.metadata?.serviceLatencyMs ?? null,
          antispoofModelVersion: antiSpoofResult.metadata?.modelVersion || null,
          antispoofLatencyMs: antiSpoofResult.metadata?.serviceLatencyMs ?? null,
          ...verificationResult, // Include all verification results (verdict, scores, etc.)
          biometricComparison,
          features: {
            names: featureResult.featureNames || [],
            vector: featureResult.featureVector || [],
            summary: featureResult.features || null
          },
          featureComparison,
          storedFeatureSummary,
          storedFeatureNames: storedFeatureNames || [],
          timestamp: new Date().toISOString()
        }
      })
    } catch (error) {
      logger.error('Verification error:', error.message)
      
      if (error.message.includes('Invalid file type')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file type',
          message: error.message
        })
      }

      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File too large',
          message: `Maximum file size is ${maxFileSize / 1024 / 1024}MB`
        })
      }

      res.status(500).json({
        success: false,
        error: 'Verification failed',
        message: error.message
      })
    } finally {
      await temporaryFiles.cleanup()
    }
  }
)

/**
 * GET /api/verify/history
 * Retrieve verification history for the authenticated user
 */
router.get(
  '/history',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user.uid
      const limitParam = parseInt(req.query.limit, 10)
      const limit = Number.isNaN(limitParam) ? 50 : Math.max(1, Math.min(limitParam, 200))

      const result = await getUserAuditEvents(userId, limit)

      if (!result.success) {
        if (result.needsIndex) {
          return res.status(503).json({
            success: false,
            error: 'Firestore index required',
            code: 'FIRESTORE_INDEX_REQUIRED',
            message: 'The verification history index is not deployed.'
          })
        }
        return res.status(500).json({
          success: false,
          error: 'Failed to retrieve verification history'
        })
      }

      const events = (result.events || [])
        .filter(event => event.operation === 'verify' && event.status !== 'processing')
        .map(event => {
          const scoreDetails = event.scoreDetails || {}
          const metadata = event.metadata || {}

          return {
            id: event.id,
            verificationId: metadata.verificationId || event.id,
            status: event.status,
            decision: event.decision || null,
            matchScore: typeof scoreDetails.matchScore === 'number' ? scoreDetails.matchScore : null,
            syntheticScore: typeof scoreDetails.syntheticScore === 'number' ? scoreDetails.syntheticScore : null,
            finalScore: typeof scoreDetails.finalScore === 'number' ? scoreDetails.finalScore : null,
            riskScore: typeof scoreDetails.riskScore === 'number' ? scoreDetails.riskScore : null,
            scoreDetails,
            metadata: {
              ...metadata,
              initiatedBy: metadata.initiatedBy || null,
              targetUserId: metadata.targetUserId || userId
            },
            error: event.error || null,
            timestamp: event.timestamp
          }
        })

      res.json({
        success: true,
        data: {
          events,
          count: events.length
        }
      })
    } catch (error) {
      logger.error('Failed to fetch verification history:', error.message)
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve verification history',
        message: error.message
      })
    }
  }
)

export default router
