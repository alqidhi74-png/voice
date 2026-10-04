/**
 * User API Service
 * Handles all user profile and voiceprint operations
 */

import { apiRequest } from './api.js'

/**
 * Get user profile
 */
export const getUserProfile = async () => {
  return await apiRequest('/user/profile')
}

/**
 * Update user profile
 */
export const updateUserProfile = async (updates) => {
  return await apiRequest('/user/profile', {
    method: 'PUT',
    body: JSON.stringify(updates)
  })
}

/**
 * Get voiceprint
 */
export const getVoiceprint = async () => {
  return await apiRequest('/user/voiceprint')
}

/**
 * Get all voiceprints
 */
export const getVoiceprints = async () => {
  return await apiRequest('/user/voiceprints')
}

/**
 * Store voiceprint
 */
export const storeVoiceprint = async (voiceprintData, encryptionKey, name) => {
  return await apiRequest('/user/voiceprint', {
    method: 'POST',
    body: JSON.stringify({
      voiceprintData,
      encryptionKey,
      name
    })
  })
}

/**
 * Update voiceprint name
 */
export const updateVoiceprintName = async (name, voiceprintId = null) => {
  return await apiRequest('/user/voiceprint/name', {
    method: 'PUT',
    body: JSON.stringify({ name, voiceprintId })
  })
}

/**
 * Delete voiceprint
 */
export const deleteVoiceprint = async (voiceprintId = null) => {
  return await apiRequest('/user/voiceprint', {
    method: 'DELETE',
    body: JSON.stringify({ voiceprintId })
  })
}

/**
 * Utility: Calculate member since (days since registration)
 */
export const calculateMemberSince = (registrationDate) => {
  if (!registrationDate) return 0
  
  const regDate = registrationDate instanceof Date 
    ? registrationDate 
    : new Date(registrationDate)
  
  const now = new Date()
  const diffTime = Math.abs(now - regDate)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  return diffDays
}

/**
 * Utility: Get formatted member since string
 */
export const getMemberSinceString = (registrationDate) => {
  if (!registrationDate) return 'New member'
  
  const days = calculateMemberSince(registrationDate)
  
  if (days < 30) {
    return `${days} ${days === 1 ? 'day' : 'days'}`
  } else if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} ${months === 1 ? 'month' : 'months'}`
  } else {
    const years = Math.floor(days / 365)
    const remainingMonths = Math.floor((days % 365) / 30)
    if (remainingMonths > 0) {
      return `${years} ${years === 1 ? 'year' : 'years'}, ${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`
    }
    return `${years} ${years === 1 ? 'year' : 'years'}`
  }
}

