import express from 'express'
import multer from 'multer'
import admin from 'firebase-admin'
import { authenticate } from '../middleware/auth.js'
import { strictLimiter } from '../middleware/rateLimiter.js'
import { logger } from '../utils/logger.js'
import { dirname, join } from 'path'
import { mkdir } from 'fs/promises'
import {
  preprocessAudio,
  validateAudioFile,
  cleanupFiles
} from '../services/audioPreprocessor.js'
import { getFirestore } from '../config/firebase.js'
import { logEnrollment } from '../services/auditLogger.js'
import {
  extractEmbedding,
  createCanonicalVoiceprint
} from '../services/featureExtractor.js'
import {
  generateVoiceprintId,
  encryptData,
  generateEncryptionKey,
  encryptAudioFile,
  hashData
} from '../services/encryption.js'
import { wrapDataKey } from '../services/keyManagement.js'
import { cleanText, isSafeDocumentId } from '../utils/validation.js'
import {
  LOCAL_ENCRYPTED_AUDIO_ROOT,
  createLocalAudioReference,
  getLocalEncryptedAudioPath,
  writeEncryptedAudioFile
} from '../services/localAudioStorage.js'
import { createTemporaryFileTracker } from '../services/temporaryFiles.js'

const router = express.Router()

// Configure multer for temporary audio uploads
const uploadDir = process.env.UPLOAD_DIR || './uploads'
const maxFileSize =
  parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default

// Local encrypted audio storage
const encryptedAudioRoot = LOCAL_ENCRYPTED_AUDIO_ROOT
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

// Ensure temporary upload directory exists
mkdir(uploadDir, { recursive: true }).catch(err => {
  logger.error(
    'Failed to create upload directory:',
    err.message
  )
})

// Ensure encrypted local storage directory exists
mkdir(encryptedAudioRoot, { recursive: true }).catch(err => {
  logger.error(
    'Failed to create encrypted audio directory:',
    err.message
  )
})

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },

  filename: (req, file, cb) => {
    const uniqueSuffix =
      `${Date.now()}-${Math.round(Math.random() * 1E9)}`

    const ext = AUDIO_EXTENSIONS.get(file.mimetype) || 'bin'

    cb(
      null,
      `enroll-${req.user.uid}-${uniqueSuffix}.${ext}`
    )
  }
})

const fileFilter = (req, file, cb) => {
  if (AUDIO_EXTENSIONS.has(file.mimetype)) {
    cb(null, true)
  } else {
    cb(
      new Error(
        'Invalid audio file type'
      ),
      false
    )
  }
}

const upload = multer({
  storage: multerStorage,
  fileFilter,
  limits: {
    fileSize: maxFileSize
  }
})

/**
 * POST /api/enroll
 * Upload enrollment audio and create voiceprint
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

      const name = cleanText(
        req.body?.name || 'My Voice Recording',
        {
          maxLength: 80,
          allowEmpty: false
        }
      )

      const userId = req.user.uid

      let clientFeatures = null

      if (req.body?.features) {
        if (
          typeof req.body.features !== 'string' ||
          req.body.features.length > 100_000
        ) {
          return res.status(400).json({
            success: false,
            error: 'Invalid client feature payload'
          })
        }

        try {
          clientFeatures = JSON.parse(
            req.body.features
          )
        } catch (parseError) {
          logger.warn(
            'Failed to parse client-provided features',
            {
              userId,
              error: parseError.message
            }
          )
        }
      }

      const filePath = req.file.path
      const fileName = req.file.filename

      logger.info('Enrollment request received:', {
        userId,
        fileName,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      })

      // Log enrollment start
      await logEnrollment(
        userId,
        'processing',
        {
          fileName,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),

          clientFeaturesSummary: clientFeatures
            ? {
                duration:
                  clientFeatures.duration,
                sampleRate:
                  clientFeatures.sampleRate,
                timestamp:
                  clientFeatures.timestamp
              }
            : null
        }
      )

      // ==================================================
      // STEP 1: Validate audio
      // ==================================================

      const validation =
        await validateAudioFile(filePath)

      if (!validation.valid) {
        await cleanupFiles([filePath])

        await logEnrollment(
          userId,
          'failure',
          {
            fileName,
            error: validation.error
          },
          new Error(validation.error)
        )

        return res.status(400).json({
          success: false,
          error: 'Invalid audio file',
          message: validation.error
        })
      }

      logger.info(
        'Audio validation passed:',
        validation.metadata
      )

      // ==================================================
      // STEP 2: Preprocess audio
      // ==================================================

      const processedFileName =
        `processed-${fileName.replace(
          /\.[^/.]+$/,
          '.wav'
        )}`

      const processedFilePath = join(
        dirname(filePath),
        processedFileName
      )
      temporaryFiles.add(
        processedFilePath,
        processedFilePath.replace(/\.wav$/i, '_vad.wav')
      )

      let processedAudio = null

      try {
        processedAudio =
          await preprocessAudio(
            filePath,
            processedFilePath,
            {
              enableDenoise: true,
              enableVAD: true,
              enableNormalize: true,
              targetSampleRate: 16000
            }
          )
        temporaryFiles.add(processedAudio.outputPath)

        logger.info(
          'Audio preprocessing completed:',
          processedAudio.metadata
        )

        // Remove original uploaded file
        await cleanupFiles([filePath])

      } catch (preprocessError) {
        logger.error(
          'Audio preprocessing failed:',
          preprocessError.message
        )

        await cleanupFiles([
          filePath,
          processedFilePath
        ])

        await logEnrollment(
          userId,
          'failure',
          {
            fileName,
            error: preprocessError.message
          },
          preprocessError
        )

        return res.status(500).json({
          success: false,
          error: 'Audio processing failed',
          message: preprocessError.message
        })
      }

      // ==================================================
      // STEP 3: Extract speaker embedding/features
      // ==================================================

      const featureResult =
        await extractEmbedding(
          processedAudio.outputPath
        )

      if (!featureResult.success) {
        throw new Error(
          'Feature extraction failed: ' +
            featureResult.error
        )
      }

      const featureVector =
        Array.isArray(
          featureResult.featureVector
        )
          ? featureResult.featureVector
          : []

      const featureNames =
        Array.isArray(
          featureResult.featureNames
        )
          ? featureResult.featureNames
          : []

      const featureSummaryRaw =
        featureResult.features &&
        typeof featureResult.features ===
          'object'
          ? featureResult.features
          : null

      const featureVectorSanitized =
        featureVector.map(value => {
          const numericValue = Number(value)

          return Number.isFinite(
            numericValue
          )
            ? numericValue
            : 0
        })

      const featureSummary =
        featureNames.length
          ? featureNames.reduce(
              (acc, key, index) => {
                const rawValue =
                  featureSummaryRaw?.[key]

                if (
                  Number.isFinite(rawValue)
                ) {
                  acc[key] =
                    Number(rawValue)
                } else if (
                  Number.isFinite(
                    featureVectorSanitized[
                      index
                    ]
                  )
                ) {
                  acc[key] =
                    featureVectorSanitized[
                      index
                    ]
                } else {
                  acc[key] = 0
                }

                return acc
              },
              {}
            )
          : featureSummaryRaw

      // ==================================================
      // STEP 4: Create canonical voiceprint
      // ==================================================

      const voiceprint =
        createCanonicalVoiceprint([
          featureResult.embedding
        ])

      // ==================================================
      // STEP 5: Generate ID + encryption key
      // ==================================================

      const encryptionKey =
        generateEncryptionKey()

      const voiceprintId =
        generateVoiceprintId(
          voiceprint.embedding,
          userId,
          new Date()
        )

      // Encrypt voiceprint embedding
      const encryptedVoiceprint =
        encryptData(
          voiceprint.embedding,
          encryptionKey
        )

      const integrityHash =
        hashData(
          voiceprint.embedding
        )

      const encryptedFeatures =
        featureVector.length
          ? encryptData(
              featureVector,
              encryptionKey
            )
          : null

      const featureIntegrityHash =
        featureVector.length
          ? hashData(featureVector)
          : null

      const encryptedFeatureSummary =
        featureSummary
          ? encryptData(
              featureSummary,
              encryptionKey
            )
          : null

      // ==================================================
      // STEP 6: Save encrypted audio LOCALLY
      // ==================================================

      const finalProcessedFileName =
        processedAudio.outputPath
          .split(/[\\/]/)
          .pop() || processedFileName

      const encryptedFileName =
        finalProcessedFileName.replace(
          /\.wav$/i,
          '.encrypted'
        )

      /*
       * Logical storage path saved in Firestore.
       *
       * This is intentionally a relative path,
       * not an absolute Windows path.
       */
      const audioStoragePath = createLocalAudioReference(voiceprintId)

      /*
       * Actual filesystem location on the server.
       */
      const localAudioPath = getLocalEncryptedAudioPath({
        root: encryptedAudioRoot,
        userId,
        voiceprintId,
        fileName: encryptedFileName
      })

      const audioStorageType = 'local'

      let audioUrl = null
      let audioEncryptionMetadata = null

      try {
        // Encrypt the processed WAV file
        const encryptedAudio =
          await encryptAudioFile(
            processedAudio.outputPath,
            encryptionKey
          )

        audioEncryptionMetadata = {
          algorithm:
            encryptedAudio.algorithm,

          iv:
            encryptedAudio.iv,

          tag:
            encryptedAudio.tag,

          createdAt:
            new Date().toISOString(),

          originalFileName:
            finalProcessedFileName,

          originalMimeType:
            'audio/wav'
        }

        /*
         * Store metadata + encrypted payload
         * together inside one JSON file.
         */
        const encryptedPayload =
          JSON.stringify({
            ...audioEncryptionMetadata,
            data: encryptedAudio.data
          })

        // Save encrypted biometric audio atomically with restrictive permissions.
        await writeEncryptedAudioFile(localAudioPath, encryptedPayload)

        logger.info(
          'Encrypted audio saved locally:',
          {
            userId,
            voiceprintId,
            audioStorageType,
            audioStoragePath
          }
        )

        /*
         * Do NOT expose the physical local path
         * or create a public URL.
         */
        audioUrl = null

      } catch (storageError) {
        logger.error(
          'Failed to save encrypted audio locally:',
          storageError
        )

        await cleanupFiles([
          processedAudio.outputPath
        ])

        await logEnrollment(
          userId,
          'failure',
          {
            fileName,
            stage:
              'local-storage-write',
            error:
              storageError.message,
            metadata:
              processedAudio.metadata
          },
          storageError
        )

        return res.status(500).json({
          success: false,
          error:
            'Audio local storage failed',
          message:
            storageError.message
        })
      }

      // ==================================================
      // STEP 7: Store voiceprint in Firestore
      // ==================================================

      const db = getFirestore()

      const enrollmentId =
        `enroll-${Date.now()}-` +
        Math.random()
          .toString(36)
          .substr(2, 9)

      try {
        const savedName =
          name || 'My Voice Recording'

        // ------------------------------------------
        // Voiceprint document
        // ------------------------------------------

        await db
          .collection('voiceprints')
          .doc(voiceprintId)
          .set({
            userId,

            encryptedEmbedding:
              encryptedVoiceprint,

            integrityHash,

            centroidsCount:
              voiceprint.centroidsCount,

            dimension:
              voiceprint.dimension,

            model:
              featureResult.model,

            featureVectorDimension:
              featureVector.length,

            featureNames,

            encryptedFeatureSummary,

            encryptedFeatureVector:
              encryptedFeatures,

            featureIntegrityHash,

            wrappedDataKey:
              wrapDataKey(
                encryptionKey
              ),

            // Local storage information
            audioStorageType,
            audioStoragePath,

            // No public URL
            audioUrl,

            name: savedName,

            enrollmentMeta: {
              name: savedName,

              originalFileName:
                fileName,

              processedFileName:
                finalProcessedFileName,

              encryptedFileName,

              /*
               * This temporary processed file
               * is deleted after enrollment.
               * Retained only as metadata.
               */
              storageType:
                audioStorageType,

              storageFilePath:
                audioStoragePath,

              metadata:
                processedAudio.metadata,

              featureNames,

              featureVectorDimension:
                featureVector.length,

              encryption:
                audioEncryptionMetadata
            },

            createdAt:
              new Date(),

            updatedAt:
              new Date()
          })

        // ------------------------------------------
        // User profile
        // ------------------------------------------

        const userRef =
          db
            .collection('users')
            .doc(userId)

        await userRef.set(
          {
            voiceprintId,

            voiceprintIds:
              admin.firestore
                .FieldValue
                .arrayUnion(
                  voiceprintId
                ),

            hasVoiceprint: true,

            voiceprintCreatedAt:
              new Date(),

            updatedAt:
              new Date()
          },
          {
            merge: true
          }
        )

        // ------------------------------------------
        // Enrollment record
        // ------------------------------------------

        await db
          .collection('enrollments')
          .doc(enrollmentId)
          .set({
            userId,

            voiceprintId,

            name: savedName,

            originalFileName:
              fileName,

            processedFileName:
              finalProcessedFileName,

            encryptedFileName,

            storageType:
              audioStorageType,

            storageFilePath:
              audioStoragePath,

            metadata:
              processedAudio.metadata,

            featureNames,

            featureVectorDimension:
              featureVector.length,

            status:
              'completed',

            createdAt:
              new Date(),

            updatedAt:
              new Date()
          })

      } catch (dbError) {
        logger.error(
          'Failed to save voiceprint:',
          dbError
        )

        await cleanupFiles([
          processedAudio.outputPath
        ])

        throw new Error(
          'Failed to store voiceprint: ' +
            dbError.message
        )
      }

      // ==================================================
      // STEP 8: Remove temporary processed WAV
      // ==================================================

      await cleanupFiles([
        processedAudio.outputPath
      ])

      // ==================================================
      // STEP 9: Audit log
      // ==================================================

      await logEnrollment(
        userId,
        'success',
        {
          enrollmentId,
          voiceprintId,
          fileName,

          audioStorageType,
          audioStoragePath,

          audioUrl,

          metadata:
            processedAudio.metadata,

          name:
            name ||
            'My Voice Recording',

          embeddingDimension:
            voiceprint.dimension,

          featureVectorDimension:
            featureVector.length,

          featureNames,

          featureSummary,

          clientFeaturesSummary:
            clientFeatures
              ? {
                  duration:
                    clientFeatures.duration,

                  sampleRate:
                    clientFeatures.sampleRate,

                  timestamp:
                    clientFeatures.timestamp
                }
              : null
        }
      )

      // ==================================================
      // SUCCESS RESPONSE
      // ==================================================

      res.json({
        success: true,

        message:
          'Voiceprint created successfully',

        data: {
          enrollmentId,

          voiceprintId,

          userId,

          fileName,

          /*
           * Temporary WAV path.
           * File is removed after enrollment.
           */
          audioStorageType,

          audioStoragePath,

          audioUrl,

          metadata:
            processedAudio.metadata,

          name:
            name ||
            'My Voice Recording',

          status:
            'completed',

          embeddingDimension:
            voiceprint.dimension,

          featureVectorDimension:
            featureVector.length,

          featureNames,

          featureSummary,

          featureVector:
            featureVectorSanitized,

          timestamp:
            new Date().toISOString(),

          clientFeatures
        }
      })

    } catch (error) {
      logger.error(
        'Enrollment error:',
        error.message
      )

      if (
        error.message.includes(
          'Invalid file type'
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid file type',
          message:
            error.message
        })
      }

      if (
        error.code ===
        'LIMIT_FILE_SIZE'
      ) {
        return res.status(400).json({
          success: false,
          error:
            'File too large',
          message:
            `Maximum file size is ` +
            `${maxFileSize / 1024 / 1024}MB`
        })
      }

      res.status(500).json({
        success: false,
        error:
          'Enrollment failed',
        message:
          error.message
      })
    } finally {
      await temporaryFiles.cleanup()
    }
  }
)

/**
 * GET /api/enroll/status/:id
 * Check enrollment status
 */
router.get(
  '/status/:id',
  authenticate,

  async (req, res) => {
    try {
      const { id } = req.params
      const userId = req.user.uid

      if (!isSafeDocumentId(id)) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid enrollment ID'
        })
      }

      const enrollmentDoc =
        await getFirestore()
          .collection('enrollments')
          .doc(id)
          .get()

      if (
        !enrollmentDoc.exists ||
        enrollmentDoc.data()?.userId !==
          userId
      ) {
        return res.status(404).json({
          success: false,
          error:
            'Enrollment not found'
        })
      }

      const enrollment =
        enrollmentDoc.data()

      res.json({
        success: true,

        data: {
          enrollmentId: id,

          userId,

          voiceprintId:
            enrollment.voiceprintId,

          status:
            enrollment.status,

          createdAt:
            enrollment.createdAt
              ?.toDate?.()
              ?.toISOString?.() ||
            enrollment.createdAt,

          updatedAt:
            enrollment.updatedAt
              ?.toDate?.()
              ?.toISOString?.() ||
            enrollment.updatedAt
        }
      })

    } catch (error) {
      logger.error(
        'Enrollment status check error:',
        error.message
      )

      res.status(500).json({
        success: false,
        error:
          'Failed to check enrollment status',
        message:
          error.message
      })
    }
  }
)

export default router
