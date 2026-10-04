/**
 * OAuth Service - Google and Apple Sign-In using Firebase Auth SDK
 * Much simpler and more reliable than direct Google Identity Services
 */

import { signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from '../config/firebase'

/**
 * Sign in with Google using Firebase Auth SDK
 * Returns a promise with the Firebase user and ID token
 */
export const signInWithGoogle = async () => {
  try {
    // Use popup for better UX (works on all browsers)
    const result = await signInWithPopup(auth, googleProvider)
    
    // Get the ID token
    const idToken = await result.user.getIdToken()
    
    return {
      success: true,
      user: result.user,
      idToken: idToken,
      credential: idToken // For backward compatibility with backend
    }
  } catch (error) {
    // Handle errors
    if (error.code === 'auth/popup-closed-by-user') {
      return {
        success: false,
        error: 'Sign-in popup was closed. Please try again.'
      }
    } else if (error.code === 'auth/popup-blocked') {
      return {
        success: false,
        error: 'Popup was blocked. Please allow popups for this site and try again.'
      }
    } else if (error.code === 'auth/cancelled-popup-request') {
      return {
        success: false,
        error: 'Only one popup request is allowed at a time. Please try again.'
      }
    } else {
      return {
        success: false,
        error: error.message || 'Google sign-in failed. Please try again.'
      }
    }
  }
}

/**
 * Handle Apple Sign-In
 * Note: Apple Sign-In requires server-side setup
 */
export const signInWithApple = () => {
  return new Promise((resolve) => {
    // Apple Sign-In implementation
    // This requires Apple Developer account setup
    resolve({
      success: false,
      error: 'Apple Sign-In requires server-side OAuth implementation. Please use email/password for now.'
    })
  })
}

