/**
 * API Service for Backend Communication
 * Handles all HTTP requests to the Voice Identity Shield backend server
 */

import { getIdToken } from './authApi'

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

/**
 * Get authentication token from localStorage
 */
const getAuthToken = () => {
  return getIdToken()
}

/**
 * Make authenticated API request
 * Export this for use in other services
 */
export const apiRequest = async (endpoint, options = {}) => {
  try {
    const token = getAuthToken()
    
    if (!token && !options.skipAuth) {
      throw new Error('User not authenticated')
    }
    
    const defaultHeaders = {
      ...options.headers
    }

    if (token && !options.skipAuth) {
      defaultHeaders['Authorization'] = `Bearer ${token}`
    }

    // Remove Content-Type for FormData (browser will set it with boundary)
    if (options.body instanceof FormData) {
      delete defaultHeaders['Content-Type']
    } else if (!defaultHeaders['Content-Type'] && options.body) {
      defaultHeaders['Content-Type'] = 'application/json'
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: defaultHeaders
    })

    // Handle non-JSON responses (like file downloads)
    const contentType = response.headers.get('content-type')
    let data
    if (contentType && contentType.includes('application/json')) {
      data = await response.json()
    } else {
      // For non-JSON responses, return the response itself
      return response
    }

    if (!response.ok) {
      const error = new Error(data.error || data.message || `HTTP ${response.status}`)
      error.status = response.status
      error.data = data
      throw error
    }

    return data
  } catch (error) {
    console.error('API request error:', error)
    throw error
  }
}

/**
 * Internal API request wrapper (for backward compatibility)
 */
const internalApiRequest = async (endpoint, options = {}) => {
  try {
    const data = await apiRequest(endpoint, options)
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'API request failed',
      data: null
    }
  }
}

/**
 * Enrollment API
 */

/**
 * Upload enrollment audio to backend
 * @param {Blob|File} audioBlob - Audio file to upload
 * @param {string} name - Optional name for the voiceprint
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const enrollVoice = async (audioBlob, name = 'My Voice Recording', features = null) => {
  try {
    const formData = new FormData()
    
    // Create a File object if it's a Blob
    const audioFile = audioBlob instanceof File 
      ? audioBlob 
      : new File([audioBlob], `enrollment-${Date.now()}.webm`, { type: audioBlob.type || 'audio/webm' })
    
    formData.append('audio', audioFile)
    formData.append('name', name)
    if (features) {
      try {
        formData.append('features', JSON.stringify(features))
      } catch (serializationError) {
        console.warn('Failed to serialize features for upload:', serializationError)
      }
    }

    const result = await internalApiRequest('/enroll', {
      method: 'POST',
      body: formData
    })

    return result
  } catch (error) {
    console.error('Enrollment error:', error)
    return {
      success: false,
      error: error.message || 'Failed to enroll voice'
    }
  }
}

/**
 * Check enrollment status
 * @param {string} enrollmentId - Enrollment job ID
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const getEnrollmentStatus = async (enrollmentId) => {
  return await internalApiRequest(`/enroll/status/${enrollmentId}`)
}

/**
 * Verification API
 */

/**
 * Verify audio against enrolled voiceprint
 * @param {Blob|File} audioBlob - Audio file to verify
 * @param {string} targetUserId - Optional target user ID (defaults to current user)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const verifyVoice = async (audioBlob, targetUserId = null) => {
  try {
    const formData = new FormData()
    
    // Create a File object if it's a Blob
    const audioFile = audioBlob instanceof File 
      ? audioBlob 
      : new File([audioBlob], `verification-${Date.now()}.webm`, { type: audioBlob.type || 'audio/webm' })
    
    formData.append('audio', audioFile)
    if (targetUserId) {
      formData.append('targetUserId', targetUserId)
    }

    const result = await internalApiRequest('/verify', {
      method: 'POST',
      body: formData
    })

    return result
  } catch (error) {
    console.error('Verification error:', error)
    return {
      success: false,
      error: error.message || 'Failed to verify voice'
    }
  }
}

/**
 * Health Check API
 */

/**
 * Check API server health
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const checkHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`)
    const data = await response.json()
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Health check failed' }
    }
    
    return { success: true, data }
  } catch (error) {
    console.error('Health check error:', error)
    return {
      success: false,
      error: error.message || 'Failed to check API health'
    }
  }
}

/**
 * Detailed health check
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const checkHealthDetailed = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health/detailed`)
    const data = await response.json()
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Health check failed' }
    }
    
    return { success: true, data }
  } catch (error) {
    console.error('Health check error:', error)
    return {
      success: false,
      error: error.message || 'Failed to check API health'
    }
  }
}

export default {
  enrollVoice,
  getEnrollmentStatus,
  verifyVoice,
  checkHealth,
  checkHealthDetailed
}
