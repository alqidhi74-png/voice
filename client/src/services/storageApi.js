/**
 * Storage API Service
 * Handles all file storage operations
 */

import { apiRequest } from './api.js'
import { getIdToken } from './authApi'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

/**
 * Upload file to storage
 */
export const uploadVoiceFile = async (file, fileName = null) => {
  try {
    const formData = new FormData()
    formData.append('file', file)
    if (fileName) {
      formData.append('fileName', fileName)
    }

    const token = getIdToken()
    
    const response = await fetch(`${API_BASE_URL}/storage/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed')
    }

    return {
      success: true,
      url: data.data.url,
      path: data.data.path
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to upload file'
    }
  }
}

/**
 * Download file as ArrayBuffer
 */
export const downloadFileAsArrayBuffer = async (storagePath) => {
  try {
    // Encode the path for URL - handle path segments properly
    const pathParts = storagePath.split('/')
    const encodedPath = pathParts.map(part => encodeURIComponent(part)).join('/')
    
    const token = getIdToken()
    const response = await fetch(`${API_BASE_URL}/storage/download/${encodedPath}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Download failed' }))
      throw new Error(errorData.error || 'Download failed')
    }

    const arrayBuffer = await response.arrayBuffer()

    return {
      success: true,
      data: arrayBuffer,
      contentType: response.headers.get('content-type') || 'application/octet-stream'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to download file'
    }
  }
}

/**
 * Get file download URL
 */
export const getFileDownloadURL = async (storagePath) => {
  try {
    const pathParts = storagePath.split('/')
    const encodedPath = pathParts.map(part => encodeURIComponent(part)).join('/')
    const data = await apiRequest(`/storage/url/${encodedPath}`)
    
    if (data.success && data.data) {
      return {
        success: true,
        url: data.data.url
      }
    }

    return {
      success: false,
      error: data.error || 'Failed to get file URL'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to get file URL'
    }
  }
}

/**
 * Delete file from storage
 */
export const deleteVoiceFile = async (storagePath) => {
  try {
    const pathParts = storagePath.split('/')
    const encodedPath = pathParts.map(part => encodeURIComponent(part)).join('/')
    const data = await apiRequest(`/storage/delete/${encodedPath}`, {
      method: 'DELETE'
    })
    
    return {
      success: data.success || false,
      error: data.error || null
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to delete file'
    }
  }
}
