/**
 * Audit API Service
 * Retrieve verification history for the authenticated user
 */

import { apiRequest } from './api.js'

/**
 * Get verification history for the current user
 * @param {number} limit - Maximum number of events to retrieve
 * @returns {Promise<{success: boolean, events: Array, count: number, error?: string}>}
 */
export const getUserVerificationHistory = async (limit = 50) => {
  try {
    const params = new URLSearchParams({
      limit: String(limit)
    })

    const response = await apiRequest(`/verify/history?${params.toString()}`)

    return {
      success: response?.success ?? true,
      events: response?.data?.events || [],
      count: response?.data?.count ?? (response?.data?.events?.length || 0)
    }
  } catch (error) {
    console.error('Failed to load verification history:', error)
    return {
      success: false,
      events: [],
      count: 0,
      error: error.message || 'Failed to load verification history'
    }
  }
}

export default {
  getUserVerificationHistory
}

