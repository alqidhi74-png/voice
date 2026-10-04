import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import crypto from 'crypto'

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/
const SAFE_FILE_NAME = /^[A-Za-z0-9._-]{1,255}$/

export const LOCAL_ENCRYPTED_AUDIO_ROOT = resolve(
  process.env.LOCAL_ENCRYPTED_AUDIO_ROOT || join(process.cwd(), 'data', 'encrypted-audio')
)

const createStorageError = (message, code) => {
  const error = new Error(message)
  error.code = code
  return error
}

const assertSafeSegment = (value, label, pattern = SAFE_ID) => {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw createStorageError(`Invalid ${label}`, 'INVALID_LOCAL_AUDIO_REFERENCE')
  }
}

/** Return a client-safe logical reference. It is not a filesystem path. */
export const createLocalAudioReference = (voiceprintId) => {
  assertSafeSegment(voiceprintId, 'voiceprint ID')
  return `local/voiceprints/${voiceprintId}/audio`
}

/**
 * Parse current logical references and legacy paths already stored in Firestore.
 * Legacy paths are accepted only for migration/backward compatibility.
 */
export const parseLocalAudioReference = (storagePath) => {
  if (typeof storagePath !== 'string' || storagePath.includes('..') || /[\\\u0000-\u001f]/.test(storagePath)) {
    return null
  }

  const logicalMatch = storagePath.match(/^local\/voiceprints\/([A-Za-z0-9_-]{1,128})\/audio$/)
  if (logicalMatch) {
    return { voiceprintId: logicalMatch[1], legacyUserId: null, legacyFileName: null }
  }

  const legacyMatch = storagePath.match(
    /^data\/encrypted-audio\/users\/([A-Za-z0-9_-]{1,128})\/voiceprints\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9._-]{1,255})$/
  )
  if (legacyMatch) {
    return {
      voiceprintId: legacyMatch[2],
      legacyUserId: legacyMatch[1],
      legacyFileName: legacyMatch[3]
    }
  }

  return null
}

export const getLocalEncryptedAudioPath = ({
  userId,
  voiceprintId,
  fileName,
  root = LOCAL_ENCRYPTED_AUDIO_ROOT
}) => {
  assertSafeSegment(userId, 'user ID')
  assertSafeSegment(voiceprintId, 'voiceprint ID')
  assertSafeSegment(fileName, 'encrypted file name', SAFE_FILE_NAME)

  const rootPath = resolve(root)
  const expectedDirectory = resolve(rootPath, 'users', userId, 'voiceprints', voiceprintId)
  const filePath = resolve(expectedDirectory, fileName)

  if (dirname(filePath) !== expectedDirectory) {
    throw createStorageError('Local audio path escaped its voiceprint directory', 'INVALID_LOCAL_AUDIO_REFERENCE')
  }

  return filePath
}

/** Resolve a local file only after binding the request user to the Firestore owner. */
export const resolveOwnedLocalAudio = ({
  storagePath,
  requestUserId,
  voiceprintId,
  voiceprintData,
  root = LOCAL_ENCRYPTED_AUDIO_ROOT
}) => {
  const reference = parseLocalAudioReference(storagePath)
  if (!reference || reference.voiceprintId !== voiceprintId) {
    throw createStorageError('Invalid local audio reference', 'INVALID_LOCAL_AUDIO_REFERENCE')
  }

  if (
    !voiceprintData ||
    voiceprintData.userId !== requestUserId ||
    (reference.legacyUserId && reference.legacyUserId !== requestUserId)
  ) {
    throw createStorageError('Access denied', 'LOCAL_AUDIO_ACCESS_DENIED')
  }

  const fileName = voiceprintData.enrollmentMeta?.encryptedFileName || reference.legacyFileName
  return {
    reference,
    fileName,
    filePath: getLocalEncryptedAudioPath({
      userId: requestUserId,
      voiceprintId,
      fileName,
      root
    })
  }
}

export const readOwnedLocalAudio = async (options) => {
  const resolved = resolveOwnedLocalAudio(options)
  return { ...resolved, buffer: await readFile(resolved.filePath) }
}

/** Write ciphertext atomically so crashes never leave a partially written recording. */
export const writeEncryptedAudioFile = async (filePath, payload) => {
  const directory = dirname(filePath)
  const temporaryPath = join(directory, `.${crypto.randomUUID()}.tmp`)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  try {
    await writeFile(temporaryPath, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await unlink(temporaryPath).catch(cleanupError => {
      if (cleanupError.code !== 'ENOENT') throw cleanupError
    })
    throw error
  }
  return filePath
}

export const deleteOwnedLocalAudio = async (options) => {
  const resolved = resolveOwnedLocalAudio(options)
  try {
    await unlink(resolved.filePath)
    return { ...resolved, deleted: true }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { ...resolved, deleted: false, missing: true }
    }
    throw error
  }
}

export default {
  LOCAL_ENCRYPTED_AUDIO_ROOT,
  createLocalAudioReference,
  parseLocalAudioReference,
  getLocalEncryptedAudioPath,
  resolveOwnedLocalAudio,
  readOwnedLocalAudio,
  writeEncryptedAudioFile,
  deleteOwnedLocalAudio
}
