/**
 * Authentication API Service
 * Handles all authentication requests to the backend
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

/**
 * Store tokens in localStorage
 */
const setTokens = (idToken, refreshToken) => {
  if (idToken) localStorage.setItem('idToken', idToken)
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
}

/**
 * Get stored ID token
 */
export const getIdToken = () => {
  return localStorage.getItem('idToken')
}

/**
 * Get stored refresh token
 */
export const getRefreshToken = () => {
  return localStorage.getItem('refreshToken')
}

/**
 * Clear tokens
 */
export const clearTokens = () => {
  localStorage.removeItem('idToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
}

/**
 * Store user data
 */
const setUser = (user) => {
  localStorage.setItem('user', JSON.stringify(user))
}

/**
 * Get stored user data
 */
export const getUser = () => {
  const userStr = localStorage.getItem('user')
  return userStr ? JSON.parse(userStr) : null
}

/**
 * Make API request
 */
const apiRequest = async (endpoint, options = {}) => {
  const token = getIdToken()
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...options.headers
  }

  if (token && !options.skipAuth) {
    defaultHeaders['Authorization'] = `Bearer ${token}`
  }

  // Remove skipAuth from options before fetch
  const { skipAuth, ...fetchOptions } = options

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers: defaultHeaders
  })

  const contentType = response.headers.get('content-type')
  let data
  if (contentType && contentType.includes('application/json')) {
    data = await response.json()
  } else {
    data = { message: await response.text() }
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || `HTTP ${response.status}`)
  }

  return data
}

/**
 * Register new user
 */
export const register = async (email, password, userData) => {
  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({
        email,
        password,
        displayName: userData.displayName,
        age: userData.age,
        phoneNumber: userData.phoneNumber,
        gender: userData.gender,
        country: userData.country
      })
    })

    if (data.success && data.data) {
      setTokens(data.data.idToken, data.data.refreshToken)
      setUser(data.data.user)
      return {
        success: true,
        user: data.data.user,
        requiresEmailVerification: Boolean(data.data.requiresEmailVerification),
        verificationEmailSent: Boolean(data.data.verificationEmailSent),
      }
    }

    return { success: false, error: data.error || 'Registration failed' }
  } catch (error) {
    return { success: false, error: error.message || 'Registration failed' }
  }
}

/**
 * Login user
 */
export const login = async (email, password) => {
  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ email, password })
    })

    if (data.success && data.data) {
      if (data.data.mfaRequired) {
        return {
          success: false,
          mfaRequired: true,
          challengeToken: data.data.challengeToken,
          expiresIn: data.data.expiresIn,
        }
      }
      setTokens(data.data.idToken, data.data.refreshToken)
      setUser(data.data.user)
      return { success: true, user: data.data.user }
    }

    return { success: false, error: data.error || 'Login failed' }
  } catch (error) {
    return { success: false, error: error.message || 'Login failed' }
  }
}

export const completeMfaLogin = async (challengeToken, code) => {
  try {
    const data = await apiRequest('/auth/mfa/verify-login', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ challengeToken, code }),
    })
    if (data.success && data.data) {
      setTokens(data.data.idToken, data.data.refreshToken)
      setUser(data.data.user)
      return { success: true, user: data.data.user }
    }
    return { success: false, error: data.error || 'MFA verification failed' }
  } catch (error) {
    return { success: false, error: error.message || 'MFA verification failed' }
  }
}

export const forgotPassword = async (email) => apiRequest('/auth/forgot-password', {
  method: 'POST',
  skipAuth: true,
  body: JSON.stringify({ email }),
})

export const resendVerificationEmail = async () => apiRequest('/auth/resend-verification', { method: 'POST' })

export const refreshSession = async () => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('No refresh token is available')
  const data = await apiRequest('/auth/refresh', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ refreshToken }),
  })
  setTokens(data.data.idToken, data.data.refreshToken)
  return data
}

export const changePassword = async (currentPassword, newPassword) => apiRequest('/auth/change-password', {
  method: 'POST',
  body: JSON.stringify({ currentPassword, newPassword }),
})

export const beginMfaSetup = async () => apiRequest('/auth/mfa/setup', { method: 'POST' })

export const enableMfa = async (code) => apiRequest('/auth/mfa/enable', {
  method: 'POST',
  body: JSON.stringify({ code }),
})

export const disableMfa = async (code) => apiRequest('/auth/mfa/disable', {
  method: 'POST',
  body: JSON.stringify({ code }),
})

/**
 * Logout user
 */
export const logout = async () => {
  try {
    await apiRequest('/auth/logout', {
      method: 'POST'
    })
  } catch (error) {
    console.error('Logout error:', error)
  } finally {
    clearTokens()
  }
  return { success: true }
}

/**
 * Get current user
 */
export const getCurrentUser = async () => {
  try {
    const data = await apiRequest('/auth/me')
    
    if (data.success && data.data) {
      setUser(data.data.user)
      return { success: true, user: data.data.user }
    }

    return { success: false, error: data.error || 'Failed to get user' }
  } catch (error) {
    clearTokens()
    return { success: false, error: error.message || 'Failed to get user' }
  }
}

/**
 * Verify token
 */
export const verifyToken = async (token) => {
  try {
    const data = await apiRequest('/auth/verify-token', {
      method: 'POST',
      body: JSON.stringify({ token })
    })

    return data.success && data.data.valid
  } catch (error) {
    return false
  }
}

/**
 * Handle Google OAuth
 * Accepts Firebase ID token from Firebase Auth SDK
 */
export const handleGoogleOAuth = async (idToken, firebaseUser) => {
  try {
    // Send Firebase ID token to backend
    const data = await apiRequest('/auth/oauth/google', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ idToken })
    })

    if (data.success && data.data) {
      // Use the Firebase ID token directly (backend already verified it)
      setTokens(data.data.idToken || idToken, data.data.refreshToken)
      setUser(data.data.user || {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName
      })
      return { success: true, user: data.data.user || {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName
      } }
    }

    return { success: false, error: data.error || 'OAuth failed' }
  } catch (error) {
    return { success: false, error: error.message || 'OAuth failed' }
  }
}

/**
 * Handle Apple OAuth
 * Note: Client still needs to get Apple ID token, then sends to backend
 */
export const handleAppleOAuth = async (idToken) => {
  try {
    const data = await apiRequest('/auth/oauth/apple', {
      method: 'POST',
      body: JSON.stringify({ idToken })
    })

    if (data.success && data.data) {
      setTokens(data.data.idToken || data.data.token, null)
      setUser(data.data.user)
      return { success: true, user: data.data.user }
    }

    return { success: false, error: data.error || 'OAuth failed' }
  } catch (error) {
    return { success: false, error: error.message || 'OAuth failed' }
  }
}
