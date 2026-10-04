/**
 * Firebase Configuration for Client
 * Only used for Authentication (Google Sign-In)
 * All other Firebase operations go through the backend API
 */

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// Validate required config
const requiredConfig = ['apiKey', 'authDomain', 'projectId']
const missingConfig = requiredConfig.filter(key => !firebaseConfig[key])

if (missingConfig.length > 0) {
  console.warn(
    'Firebase config is incomplete. Missing:',
    missingConfig.map(key => `VITE_FIREBASE_${key.toUpperCase().replace(/([A-Z])/g, '_$1')}`).join(', ')
  )
}

// Initialize Firebase (only for Auth)
const app = initializeApp(firebaseConfig)

// Initialize Auth
export const auth = getAuth(app)

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({
  prompt: 'select_account' // Always show account picker
})

export default app

