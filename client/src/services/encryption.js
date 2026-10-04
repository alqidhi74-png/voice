import CryptoJS from 'crypto-js'

/**
 * Generate a random encryption key
 * @returns {string} - Base64 encoded key
 */
export const generateEncryptionKey = () => {
  return CryptoJS.lib.WordArray.random(32).toString()
}

/**
 * Encrypt data using AES-256
 * @param {string|Object} data - Data to encrypt
 * @param {string} key - Encryption key
 * @returns {string} - Encrypted data (base64)
 */
export const encryptData = (data, key) => {
  const dataString = typeof data === 'string' ? data : JSON.stringify(data)
  const encrypted = CryptoJS.AES.encrypt(dataString, key).toString()
  return encrypted
}

/**
 * Decrypt data using AES-256
 * @param {string} encryptedData - Encrypted data (base64)
 * @param {string} key - Decryption key
 * @returns {string|Object} - Decrypted data
 */
export const decryptData = (encryptedData, key) => {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, key)
    if (!decrypted || typeof decrypted.sigBytes === 'undefined') {
      throw new Error('Invalid decrypted payload')
    }

    let decryptedString = null
    try {
      decryptedString = decrypted.toString(CryptoJS.enc.Utf8)
    } catch (stringError) {
      console.warn('Decrypted payload is not valid UTF-8, falling back to binary interpretation.')
      decryptedString = null
    }

    if (decryptedString && decryptedString.length > 0) {
      try {
        return JSON.parse(decryptedString)
      } catch {
        return decryptedString
      }
    }

    const arrayBuffer = wordArrayToArrayBuffer(decrypted)
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return []
    }

    if (arrayBuffer.byteLength % 4 === 0) {
      try {
        const floatArray = new Float32Array(arrayBuffer)
        return Array.from(floatArray)
      } catch (floatError) {
        console.warn('Failed to interpret decrypted payload as Float32Array:', floatError)
      }
    }

    return Array.from(new Uint8Array(arrayBuffer))
  } catch (error) {
    console.error('Decryption error:', error)
    throw new Error('Failed to decrypt data')
  }
}

/**
 * Encrypt audio blob
 * @param {Blob} audioBlob - Audio blob to encrypt
 * @param {string} key - Encryption key
 * @returns {Promise<string>} - Encrypted data (base64)
 */
export const encryptAudioBlob = async (audioBlob, key) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const arrayBuffer = reader.result
      const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer)
      const encrypted = CryptoJS.AES.encrypt(wordArray, key).toString()
      resolve(encrypted)
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(audioBlob)
  })
}

/**
 * Decrypt audio blob (supports AES-GCM payloads and CryptoJS AES payloads)
 * @param {Object|string} encryptedAudio - Encrypted audio payload
 * @param {string} key - Encryption key (hex for AES-GCM, passphrase for CryptoJS)
 * @param {Object} options - Optional parameters
 * @param {string} options.mimeType - Desired MIME type of decrypted audio
 * @returns {Promise<Blob>} - Decrypted audio blob
 */
export const decryptAudioBlob = async (encryptedAudio, key, options = {}) => {
  if (!encryptedAudio) {
    throw new Error('No encrypted audio provided')
  }
  if (!key) {
    throw new Error('Encryption key not provided')
  }

  const { mimeType } = options

  if (typeof encryptedAudio === 'object' && encryptedAudio !== null && encryptedAudio.iv && encryptedAudio.tag && encryptedAudio.data) {
    return decryptAudioWithAesGcm(encryptedAudio, key, mimeType)
  }

  if (typeof encryptedAudio === 'string') {
    return decryptAudioWithCryptoJs(encryptedAudio, key, mimeType)
  }

  throw new Error('Unsupported encrypted audio format')
}

const decryptAudioWithCryptoJs = (encryptedAudioString, key, mimeType) => {
  return new Promise((resolve, reject) => {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedAudioString, key)
      const decryptedWordArray = decrypted
      const arrayBuffer = wordArrayToArrayBuffer(decryptedWordArray)
      const audioBlob = new Blob([arrayBuffer], { type: mimeType || 'audio/webm' })
      resolve(audioBlob)
    } catch (error) {
      console.error('Error decrypting audio with CryptoJS:', error)
      reject(error)
    }
  })
}

const decryptAudioWithAesGcm = async (payload, keyHex, mimeType) => {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Web Crypto API is not available in this environment')
  }

  const keyBytes = hexStringToUint8Array(keyHex)
  const iv = base64ToUint8Array(payload.iv)
  const tag = base64ToUint8Array(payload.tag)
  const ciphertext = base64ToUint8Array(payload.data)

  const combinedCiphertext = new Uint8Array(ciphertext.length + tag.length)
  combinedCiphertext.set(ciphertext, 0)
  combinedCiphertext.set(tag, ciphertext.length)

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: tag.length * 8 },
    cryptoKey,
    combinedCiphertext.buffer
  )

  return new Blob([decryptedBuffer], { type: mimeType || payload.originalMimeType || 'audio/wav' })
}

/**
 * Convert CryptoJS WordArray to ArrayBuffer
 * @param {WordArray} wordArray - CryptoJS WordArray
 * @returns {ArrayBuffer} - ArrayBuffer
 */
const wordArrayToArrayBuffer = (wordArray) => {
  const arrayOfWords = wordArray.hasOwnProperty('words') ? wordArray.words : []
  const length = wordArray.hasOwnProperty('sigBytes') ? wordArray.sigBytes : arrayOfWords.length * 4
  const uInt8Array = new Uint8Array(length)
  let index = 0, word, i
  
  for (i = 0; i < length; i++) {
    const wordIndex = i >>> 2
    const byteOffset = (3 - (i % 4)) * 8
    const word = arrayOfWords[wordIndex] || 0
    uInt8Array[index++] = (word >>> byteOffset) & 0xff
  }
  
  return uInt8Array.buffer.slice(0, length)
}

const hexStringToUint8Array = (hex) => {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string for encryption key')
  }
  const array = new Uint8Array(hex.length / 2)
  for (let i = 0; i < array.length; i++) {
    array[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return array
}

const base64ToUint8Array = (base64) => {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Hash data using SHA-256
 * @param {string|Object} data - Data to hash
 * @returns {string} - Hash string
 */
export const hashData = (data) => {
  const dataString = typeof data === 'string' ? data : JSON.stringify(data)
  return CryptoJS.SHA256(dataString).toString()
}

