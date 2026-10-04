/**
 * Encryption Service
 * Handles AES-256-GCM encryption for voiceprints and audio data
 * 
 * Note: Currently using CryptoJS for compatibility, but should migrate to Node.js crypto
 * for AES-256-GCM support (CryptoJS uses CBC mode by default)
 */

import crypto from 'crypto'
import { logger } from '../utils/logger.js'

// AES-256-GCM configuration
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits for GCM
const SALT_LENGTH = 64
const TAG_LENGTH = 16 // 128 bits for authentication tag
const KEY_LENGTH = 32 // 256 bits

/**
 * Generate a random encryption key (256 bits)
 * @returns {Buffer} - 32-byte key
 */
export const generateEncryptionKey = () => {
  return crypto.randomBytes(KEY_LENGTH)
}

/**
 * Derive key from password using PBKDF2
 * @param {string} password - Password or master key
 * @param {Buffer} salt - Salt for key derivation
 * @returns {Buffer} - Derived key
 */
export const deriveKey = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256')
}

/**
 * Encrypt data using AES-256-GCM
 * @param {string|Object|Buffer} data - Data to encrypt
 * @param {Buffer|string} key - Encryption key (Buffer or hex string)
 * @returns {Object} - Encrypted data with IV, tag, and ciphertext
 */
export const encryptData = (data, key) => {
  try {
    // Convert key to Buffer if it's a string
    const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex')
    
    if (keyBuffer.length !== KEY_LENGTH) {
      throw new Error(`Key must be ${KEY_LENGTH} bytes (256 bits)`)
    }

    // Convert data to Buffer
    let dataBuffer
    if (Buffer.isBuffer(data)) {
      dataBuffer = data
    } else if (typeof data === 'string') {
      dataBuffer = Buffer.from(data, 'utf8')
    } else {
      dataBuffer = Buffer.from(JSON.stringify(data), 'utf8')
    }

    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH)

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv)

    // Encrypt
    let encrypted = cipher.update(dataBuffer)
    encrypted = Buffer.concat([encrypted, cipher.final()])

    // Get authentication tag
    const tag = cipher.getAuthTag()

    // Return as base64 strings for storage
    return {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
      algorithm: ALGORITHM
    }
  } catch (error) {
    logger.error('Encryption error:', error.message)
    throw new Error(`Encryption failed: ${error.message}`)
  }
}

/**
 * Decrypt data using AES-256-GCM
 * @param {Object} encryptedData - Encrypted data object with iv, tag, data
 * @param {Buffer|string} key - Decryption key (Buffer or hex string)
 * @returns {Buffer|Object|string} - Decrypted data
 */
export const decryptData = (encryptedData, key) => {
  try {
    // Convert key to Buffer if it's a string
    const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex')
    
    if (keyBuffer.length !== KEY_LENGTH) {
      throw new Error(`Key must be ${KEY_LENGTH} bytes (256 bits)`)
    }

    // Extract components
    const iv = Buffer.from(encryptedData.iv, 'base64')
    const tag = Buffer.from(encryptedData.tag, 'base64')
    const encrypted = Buffer.from(encryptedData.data, 'base64')

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv)
    decipher.setAuthTag(tag)

    // Decrypt
    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    let utf8String
    try {
      utf8String = decrypted.toString('utf8')
    } catch (stringError) {
      logger.debug('Decrypted payload is not UTF-8; returning binary buffer')
      return decrypted
    }

    const roundTrip = Buffer.from(utf8String, 'utf8')
    const isBinaryPayload = roundTrip.length !== decrypted.length || roundTrip.compare(decrypted) !== 0
      || /[\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u000b\u000c\u000e-\u001f]/.test(utf8String)

    if (isBinaryPayload) {
      logger.debug('Decrypted payload contains non-text bytes; returning binary buffer')
      return decrypted
    }

    if (!utf8String.length) {
      return ''
    }

    try {
      return JSON.parse(utf8String)
    } catch {
      return utf8String
    }
  } catch (error) {
    logger.error('Decryption error:', error.message)
    throw new Error(`Decryption failed: ${error.message}`)
  }
}

/**
 * Encrypt audio file
 * @param {string} filePath - Path to audio file
 * @param {Buffer|string} key - Encryption key
 * @returns {Promise<Object>} - Encrypted data
 */
export const encryptAudioFile = async (filePath, key) => {
  const fs = await import('fs/promises')
  const audioData = await fs.readFile(filePath)
  return encryptData(audioData, key)
}

/**
 * Decrypt audio file
 * @param {Object} encryptedData - Encrypted data object
 * @param {Buffer|string} key - Decryption key
 * @param {string} outputPath - Path to save decrypted file
 * @returns {Promise<string>} - Path to decrypted file
 */
export const decryptAudioFile = async (encryptedData, key, outputPath) => {
  const fs = await import('fs/promises')
  const decrypted = decryptData(encryptedData, key)
  await fs.writeFile(outputPath, decrypted)
  return outputPath
}

/**
 * Hash data using SHA-256
 * @param {string|Object|Buffer} data - Data to hash
 * @returns {string} - Hex hash
 */
export const hashData = (data) => {
  let dataBuffer
  if (Buffer.isBuffer(data)) {
    dataBuffer = data
  } else if (typeof data === 'string') {
    dataBuffer = Buffer.from(data, 'utf8')
  } else {
    dataBuffer = Buffer.from(JSON.stringify(data), 'utf8')
  }

  return crypto.createHash('sha256').update(dataBuffer).digest('hex')
}

/**
 * Generate voiceprint ID
 * @param {Buffer|Array} embedding - Voice embedding vector
 * @param {string} userId - User ID
 * @param {Date|string} timestamp - Enrollment timestamp
 * @returns {string} - SHA-256 hash of voiceprint ID
 */
export const generateVoiceprintId = (embedding, userId, timestamp) => {
  const timestampStr = timestamp instanceof Date ? timestamp.toISOString() : timestamp
  const data = JSON.stringify({
    embedding: Array.isArray(embedding) ? embedding : Array.from(embedding),
    userId,
    timestamp: timestampStr
  })
  return hashData(data)
}

export default {
  generateEncryptionKey,
  deriveKey,
  encryptData,
  decryptData,
  encryptAudioFile,
  decryptAudioFile,
  hashData,
  generateVoiceprintId,
  ALGORITHM,
  KEY_LENGTH
}

