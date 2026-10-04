import { createContext, useContext, useState, useEffect } from 'react'
import * as authApi from '../services/authApi'
import { getIdToken, getUser as getStoredUser } from '../services/authApi'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Register new user
  const register = async (email, password, userData) => {
    try {
      const result = await authApi.register(email, password, userData)
      
      if (result.success) {
        setCurrentUser(result.user)
      }
      
      return result
    } catch (error) {
      return { success: false, error: error.message || 'Registration failed' }
    }
  }

  // Login user
  const login = async (email, password) => {
    try {
      const result = await authApi.login(email, password)
      
      if (result.success) {
        setCurrentUser(result.user)
      }
      
      return result
    } catch (error) {
      return { success: false, error: error.message || 'Login failed' }
    }
  }

  // Sign in with Google
  // Note: OAuth is handled via Google Identity Services and backend API
  const signInWithGoogle = async () => {
    try {
      // OAuth is handled through the OAuth service and backend API
      // This function is kept for compatibility but should use handleGoogleOAuth from authApi
      return { 
        success: false, 
        error: 'Please use the Google Sign-In button which handles OAuth through the backend API.' 
      }
    } catch (error) {
      return { success: false, error: error.message || 'Google sign-in failed' }
    }
  }

  // Sign in with Apple
  // Note: OAuth is handled via Apple Sign-In and backend API
  const signInWithApple = async () => {
    try {
      // Apple OAuth is handled through the backend API
      // Implementation pending - use email/password for now
      return { 
        success: false, 
        error: 'Apple Sign-In is not yet implemented. Please use email/password or Google Sign-In.' 
      }
    } catch (error) {
      return { success: false, error: error.message || 'Apple sign-in failed' }
    }
  }

  // Logout user
  const logout = async () => {
    try {
      const result = await authApi.logout()
      setCurrentUser(null)
      return result
    } catch (error) {
      setCurrentUser(null)
      return { success: false, error: error.message || 'Logout failed' }
    }
  }

  // Check authentication status
  const checkAuth = async () => {
    try {
      const token = getIdToken()
      if (!token) {
        setCurrentUser(null)
        setLoading(false)
        return
      }

      // Verify token and get user
      const result = await authApi.getCurrentUser()
      
      if (result.success) {
        setCurrentUser(result.user)
      } else {
        setCurrentUser(null)
      }
    } catch (error) {
      setCurrentUser(null)
    } finally {
      setLoading(false)
    }
  }

  // Monitor auth state changes
  useEffect(() => {
    // Check for stored user first
    const storedUser = getStoredUser()
    if (storedUser) {
      setCurrentUser(storedUser)
    }

    // Verify with backend
    checkAuth()

    // Set up interval to check token validity periodically
    const interval = setInterval(() => {
      checkAuth()
    }, 5 * 60 * 1000) // Check every 5 minutes

    return () => clearInterval(interval)
  }, [])

  const setAuthUser = (user) => {
    setCurrentUser(user)
  }

  const value = {
    currentUser,
    register,
    login,
    signInWithGoogle,
    signInWithApple,
    logout,
    loading,
    checkAuth,
    setAuthUser
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
