import admin from 'firebase-admin'
import { logger } from '../utils/logger.js'

let firebaseInitialized = false

/**
 * Initialize Firebase Admin SDK
 * Uses environment variables from .env file for secure credential management
 */
export const initializeFirebase = () => {
  if (firebaseInitialized) {
    return admin.app()
  }

  try {
    // Check if Firebase Admin is already initialized
    if (admin.apps.length === 0) {
      // Load service account credentials from environment variables
      const serviceAccount = {
        type: process.env.FIREBASE_TYPE || 'service_account',
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        clientId: process.env.FIREBASE_CLIENT_ID,
        authUri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        tokenUri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
        authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
        clientX509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL,
        universeDomain: process.env.FIREBASE_UNIVERSE_DOMAIN || 'googleapis.com'
      }

      // Validate required credentials
      if (!serviceAccount.projectId) {
        throw new Error('FIREBASE_PROJECT_ID is required in .env file')
      }
      if (!serviceAccount.privateKey) {
        throw new Error('FIREBASE_PRIVATE_KEY is required in .env file')
      }
      if (!serviceAccount.clientEmail) {
        throw new Error('FIREBASE_CLIENT_EMAIL is required in .env file')
      }

      const storageBucket =
        process.env.FIREBASE_STORAGE_BUCKET ||
        (serviceAccount.projectId ? `${serviceAccount.projectId}.appspot.com` : undefined)

      if (!storageBucket) {
        logger.warn('⚠️  FIREBASE_STORAGE_BUCKET not set; using default appspot bucket from project ID')
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket
      })

      firebaseInitialized = true
      logger.info('✅ Firebase Admin SDK initialized from environment variables')
      
      return admin.app()
    }

    return admin.app()
  } catch (error) {
    logger.error('❌ Failed to initialize Firebase Admin:', error.message)
    throw error
  }
}

/**
 * Get Firestore instance
 */
export const getFirestore = () => {
  initializeFirebase()
  return admin.firestore()
}

/**
 * Get Firebase Auth instance
 */
export const getAuth = () => {
  initializeFirebase()
  return admin.auth()
}

/**
 * Get Firebase Storage instance
 */
export const getStorage = () => {
  initializeFirebase()
  return admin.storage()
}

export default { initializeFirebase, getFirestore, getAuth, getStorage }

