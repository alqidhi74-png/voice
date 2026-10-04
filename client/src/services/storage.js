/**
 * LocalStorage service for MVP demo
 * Local storage service for fallback/client-side caching
 */

const STORAGE_KEYS = {
  VOICEPRINT: 'voice_identity_shield_voiceprint',
  VERIFICATION_HISTORY: 'voice_identity_shield_history',
  ENCRYPTION_KEY: 'voice_identity_shield_key',
}

const sanitizeUserId = (userId) => {
  if (typeof userId !== 'string') {
    return null
  }
  const trimmed = userId.trim()
  return trimmed ? encodeURIComponent(trimmed) : null
}

const buildStorageKey = (baseKey, userId) => {
  const scopedId = sanitizeUserId(userId)
  return scopedId ? `${baseKey}_${scopedId}` : baseKey
}

const removeLegacyKeyIfScoped = (baseKey, userId) => {
  if (sanitizeUserId(userId)) {
    try {
      localStorage.removeItem(baseKey)
    } catch (error) {
      console.warn(`Failed to remove legacy storage key ${baseKey}:`, error)
    }
  }
}

const setJsonItem = (baseKey, value, userId) => {
  try {
    localStorage.setItem(buildStorageKey(baseKey, userId), JSON.stringify(value))
    removeLegacyKeyIfScoped(baseKey, userId)
    return true
  } catch (error) {
    console.error(`Error storing data for key ${baseKey}:`, error)
    return false
  }
}

const getJsonItem = (baseKey, userId, fallbackValue = null) => {
  const scopedKey = buildStorageKey(baseKey, userId)
  const scopedId = sanitizeUserId(userId)
  const keysToTry = [scopedKey]

  if (!scopedId) {
    keysToTry.push(baseKey)
  } else {
    removeLegacyKeyIfScoped(baseKey, userId)
  }

  for (const key of keysToTry) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) {
        continue
      }
      return JSON.parse(raw)
    } catch (error) {
      console.error(`Error retrieving data for key ${key}:`, error)
    }
  }

  return fallbackValue
}

const setRawItem = (baseKey, value, userId) => {
  try {
    localStorage.setItem(buildStorageKey(baseKey, userId), value)
    removeLegacyKeyIfScoped(baseKey, userId)
    return true
  } catch (error) {
    console.error(`Error storing value for key ${baseKey}:`, error)
    return false
  }
}

const getRawItem = (baseKey, userId, fallbackValue = null) => {
  const scopedKey = buildStorageKey(baseKey, userId)
  const scopedId = sanitizeUserId(userId)
  const keysToTry = [scopedKey]

  if (!scopedId) {
    keysToTry.push(baseKey)
  } else {
    removeLegacyKeyIfScoped(baseKey, userId)
  }

  for (const key of keysToTry) {
    try {
      const value = localStorage.getItem(key)
      if (value !== null) {
        return value
      }
    } catch (error) {
      console.error(`Error retrieving value for key ${key}:`, error)
    }
  }

  return fallbackValue
}

/**
 * Store voiceprint data
 */
export const storeVoiceprint = (voiceprintData, userId = null) => {
  return setJsonItem(STORAGE_KEYS.VOICEPRINT, voiceprintData, userId)
}

/**
 * Retrieve voiceprint data
 */
export const getVoiceprint = (userId = null) => {
  return getJsonItem(STORAGE_KEYS.VOICEPRINT, userId, null)
}

/**
 * Store encryption key
 */
export const storeEncryptionKey = (key, userId = null) => {
  return setRawItem(STORAGE_KEYS.ENCRYPTION_KEY, key, userId)
}

/**
 * Retrieve encryption key
 */
export const getEncryptionKey = (userId = null) => {
  return getRawItem(STORAGE_KEYS.ENCRYPTION_KEY, userId, null)
}

/**
 * Add verification result to history
 */
export const addVerificationHistory = (verificationResult, userId = null) => {
  try {
    const history = getVerificationHistory(userId)
    const newHistory = [
      {
        ...verificationResult,
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
      },
      ...history,
    ].slice(0, 50) // Keep last 50 records

    return setJsonItem(STORAGE_KEYS.VERIFICATION_HISTORY, newHistory, userId)
  } catch (error) {
    console.error('Error storing verification history:', error)
    return false
  }
}

/**
 * Get verification history
 */
export const getVerificationHistory = (userId = null) => {
  const history = getJsonItem(STORAGE_KEYS.VERIFICATION_HISTORY, userId, [])
  return Array.isArray(history) ? history : []
}

/**
 * Clear all stored data
 */
export const clearAllData = (userId = null) => {
  try {
    const keys = Object.values(STORAGE_KEYS)
    const sanitizedId = sanitizeUserId(userId)

    keys.forEach((key) => {
      localStorage.removeItem(key)
      if (sanitizedId) {
        localStorage.removeItem(buildStorageKey(key, userId))
      }
    })
    return true
  } catch (error) {
    console.error('Error clearing data:', error)
    return false
  }
}

