import express from 'express'
import { getAuth, getFirestore } from '../config/firebase.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import crypto from 'crypto'
import { assertStrongPassword } from '../utils/passwordPolicy.js'
import { cleanText, isValidEmail, normalizeEmail } from '../utils/validation.js'
import { createOtpAuthUri, generateTotpSecret, verifyTotp } from '../services/totp.js'
import { unwrapSecret, wrapSecret } from '../services/keyManagement.js'

const router = express.Router()

// Lazy initialization - get auth and db when needed, not at module load
const getAuthInstance = () => getAuth()
const getDbInstance = () => getFirestore()

const firebaseRequest = async (endpoint, payload) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${process.env.FIREBASE_WEB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  return { response, data }
}

const sendEmailAction = async (requestType, payload) => {
  const { response, data } = await firebaseRequest('accounts:sendOobCode', {
    requestType,
    ...payload,
  })
  if (!response.ok) throw new Error(data.error?.message || 'Unable to send email')
}

const publicUser = (record, profile = {}) => ({
  uid: record.uid,
  email: record.email,
  displayName: record.displayName,
  emailVerified: Boolean(record.emailVerified),
  role: record.customClaims?.role === 'admin' || (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).includes(String(record.email || '').toLowerCase()) ? 'admin' : 'user',
  mfaEnabled: Boolean(profile.mfaEnabled),
})

/**
 * POST /api/auth/register
 * Register new user with email/password
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { password, age, phoneNumber, gender, country } = req.body
    const email = normalizeEmail(req.body.email)
    const displayName = cleanText(req.body.displayName || '', { maxLength: 80 })

    // Validation
    if (!isValidEmail(email) || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      })
    }

    assertStrongPassword(password)

    // Create user in Firebase Auth
    const auth = getAuthInstance()
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: displayName || null,
      emailVerified: false
    })

    // Create user profile in Firestore
    const userProfile = {
      email,
      displayName: displayName || '',
      age: age || null,
      phoneNumber: phoneNumber || null,
      gender: gender || null,
      country: country || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: null,
      memberSince: new Date(),
      registrationDate: new Date(),
      role: 'user',
      emailVerified: false,
      mfaEnabled: false
    }

    const db = getDbInstance()
    await db.collection('users').doc(userRecord.uid).set(userProfile)

    // Sign in to get ID token (using Firebase Auth REST API)
    const { response: signInResponse, data: signInData } = await firebaseRequest('accounts:signInWithPassword', {
      email, password, returnSecureToken: true,
    })

    if (!signInResponse.ok) {
      // If sign-in fails, still return success but user will need to login
      logger.warn('User created but sign-in failed:', signInData.error?.message)
      return res.status(201).json({
        success: true,
        data: {
          user: {
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName
          },
          message: 'Account created. Please log in.'
        }
      })
    }

    logger.info('User registered:', { uid: userRecord.uid, email })

    let verificationEmailSent = true
    try {
      await sendEmailAction('VERIFY_EMAIL', { idToken: signInData.idToken })
    } catch (emailError) {
      verificationEmailSent = false
      logger.error('Verification email could not be sent:', emailError.message)
    }

    res.status(201).json({
      success: true,
      data: {
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          emailVerified: false,
          role: 'user',
          mfaEnabled: false,
        },
        idToken: signInData.idToken,
        refreshToken: signInData.refreshToken,
        expiresIn: signInData.expiresIn,
        requiresEmailVerification: true,
        verificationEmailSent,
      }
    })
  } catch (error) {
    logger.error('Registration error:', error)

    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({
        success: false,
        error: 'Email already registered'
      })
    }

    if (error.code === 'auth/invalid-email') {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address'
      })
    }

    if (error.code === 'auth/weak-password' || error.code === 'WEAK_PASSWORD') {
      return res.status(400).json({
        success: false,
        error: error.message,
        details: error.details || null,
      })
    }

    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error.message
    })
  }
})

/**
 * POST /api/auth/login
 * Login with email/password
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    const { password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      })
    }

    // Verify password using Firebase Auth REST API
    // Note: Firebase Admin SDK doesn't verify passwords directly
    const { response, data } = await firebaseRequest('accounts:signInWithPassword', {
      email, password, returnSecureToken: true,
    })

    if (!response.ok) {
      if (data.error?.message?.includes('INVALID_PASSWORD') || data.error?.message?.includes('EMAIL_NOT_FOUND') || data.error?.message?.includes('INVALID_EMAIL')) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        })
      }
      return res.status(401).json({
        success: false,
        error: data.error?.message || 'Login failed'
      })
    }

    // Verify the ID token to get user info
    const auth = getAuthInstance()
    const decodedToken = await auth.verifyIdToken(data.idToken)
    const userId = decodedToken.uid

    // Get user record
    const userRecord = await auth.getUser(userId)

    let profileData = {}
    // Update last login in Firestore
    try {
      const db = getDbInstance()
      const profileDoc = await db.collection('users').doc(userId).get()
      profileData = profileDoc.exists ? profileDoc.data() : {}
      await db.collection('users').doc(userId).update({
        lastLogin: new Date(),
        updatedAt: new Date(),
        emailVerified: Boolean(userRecord.emailVerified),
      })
    } catch (error) {
      // If user profile doesn't exist, create it
      if (error.code === 5) { // NOT_FOUND
        const userProfile = {
          email: userRecord.email || email,
          displayName: userRecord.displayName || '',
          age: null,
          phoneNumber: null,
          gender: null,
          country: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: new Date(),
          memberSince: new Date(),
          registrationDate: new Date(),
          role: 'user',
          emailVerified: Boolean(userRecord.emailVerified),
          mfaEnabled: false
        }
        const db = getDbInstance()
        await db.collection('users').doc(userId).set(userProfile)
      }
    }

    logger.info('User logged in:', { uid: userId, email })

    if (profileData.mfaEnabled) {
      const challengeToken = crypto.randomBytes(32).toString('base64url')
      const challengeId = crypto.createHash('sha256').update(challengeToken).digest('hex')
      const encryptedSession = wrapSecret(JSON.stringify({
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
      }))
      await getDbInstance().collection('mfaChallenges').doc(challengeId).set({
        uid: userId,
        encryptedSession,
        attempts: 0,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        createdAt: new Date(),
      })
      return res.json({
        success: true,
        data: { mfaRequired: true, challengeToken, expiresIn: 300 },
      })
    }

    res.json({
      success: true,
      data: {
        user: publicUser(userRecord, profileData),
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn
      }
    })
  } catch (error) {
    logger.error('Login error:', error)

    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error.message
    })
  }
})

/** Complete a login that is protected by an authenticator-app code. */
router.post('/mfa/verify-login', authLimiter, async (req, res) => {
  try {
    const challengeToken = String(req.body?.challengeToken || '')
    const code = String(req.body?.code || '')
    if (challengeToken.length < 32 || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, error: 'A valid challenge and 6-digit code are required' })
    }

    const challengeId = crypto.createHash('sha256').update(challengeToken).digest('hex')
    const db = getDbInstance()
    const challengeRef = db.collection('mfaChallenges').doc(challengeId)
    const challengeDoc = await challengeRef.get()
    if (!challengeDoc.exists) {
      return res.status(401).json({ success: false, error: 'MFA challenge is invalid or expired' })
    }

    const challenge = challengeDoc.data()
    const expiresAt = challenge.expiresAt?.toDate?.() || new Date(challenge.expiresAt)
    if (expiresAt.getTime() <= Date.now() || Number(challenge.attempts || 0) >= 5) {
      await challengeRef.delete()
      return res.status(401).json({ success: false, error: 'MFA challenge is invalid or expired' })
    }

    const profileDoc = await db.collection('users').doc(challenge.uid).get()
    const profile = profileDoc.data() || {}
    const secret = unwrapSecret(profile.mfaSecret).toString('utf8')
    if (!verifyTotp(secret, code)) {
      await challengeRef.update({ attempts: Number(challenge.attempts || 0) + 1 })
      return res.status(401).json({ success: false, error: 'Invalid authenticator code' })
    }

    const session = JSON.parse(unwrapSecret(challenge.encryptedSession).toString('utf8'))
    const userRecord = await getAuthInstance().getUser(challenge.uid)
    await challengeRef.delete()
    res.json({
      success: true,
      data: { user: publicUser(userRecord, profile), ...session },
    })
  } catch (error) {
    logger.error('MFA login verification error:', error)
    res.status(500).json({ success: false, error: 'Unable to verify authenticator code' })
  }
})

/** Send a password-reset email without revealing whether an account exists. */
router.post('/forgot-password', authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Enter a valid email address' })
  }
  try {
    await sendEmailAction('PASSWORD_RESET', { email })
  } catch (error) {
    logger.warn('Password reset request was not delivered', { reason: error.message })
  }
  res.json({
    success: true,
    message: 'If an account exists for that email, a password-reset link has been sent.',
  })
})

/** Exchange a Firebase refresh token for a fresh ID token (also refreshes email_verified). */
router.post('/refresh', authLimiter, async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '')
    if (refreshToken.length < 20) {
      return res.status(400).json({ success: false, error: 'Refresh token is required' })
    }
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${process.env.FIREBASE_WEB_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
    const data = await response.json()
    if (!response.ok) return res.status(401).json({ success: false, error: 'Session refresh failed' })
    res.json({
      success: true,
      data: {
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      },
    })
  } catch (error) {
    logger.error('Session refresh error:', error)
    res.status(500).json({ success: false, error: 'Session refresh failed' })
  }
})

router.post('/resend-verification', authenticate, authLimiter, async (req, res) => {
  try {
    const token = req.headers.authorization.slice('Bearer '.length)
    await sendEmailAction('VERIFY_EMAIL', { idToken: token })
    res.json({ success: true, message: 'Verification email sent.' })
  } catch (error) {
    logger.error('Resend verification error:', error)
    res.status(400).json({ success: false, error: 'Unable to send verification email' })
  }
})

router.post('/change-password', authenticate, authLimiter, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = String(req.body?.newPassword || '')
    assertStrongPassword(newPassword)
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, error: 'New password must be different' })
    }
    const { response } = await firebaseRequest('accounts:signInWithPassword', {
      email: req.user.email,
      password: currentPassword,
      returnSecureToken: true,
    })
    if (!response.ok) return res.status(401).json({ success: false, error: 'Current password is incorrect' })

    const auth = getAuthInstance()
    await auth.updateUser(req.user.uid, { password: newPassword })
    await auth.revokeRefreshTokens(req.user.uid)
    logger.info('Password changed and sessions revoked', { uid: req.user.uid })
    res.json({ success: true, message: 'Password changed. Please sign in again.' })
  } catch (error) {
    if (error.code === 'WEAK_PASSWORD') {
      return res.status(400).json({ success: false, error: error.message, details: error.details })
    }
    logger.error('Change password error:', error)
    res.status(500).json({ success: false, error: 'Unable to change password' })
  }
})

router.post('/mfa/setup', authenticate, authLimiter, async (req, res) => {
  try {
    if (!req.user.emailVerified) {
      return res.status(403).json({ success: false, error: 'Verify your email before enabling MFA' })
    }
    const secret = generateTotpSecret()
    await getDbInstance().collection('users').doc(req.user.uid).set({
      pendingMfaSecret: wrapSecret(secret),
      pendingMfaCreatedAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true })
    res.json({
      success: true,
      data: {
        secret,
        otpAuthUri: createOtpAuthUri({ secret, email: req.user.email }),
      },
    })
  } catch (error) {
    logger.error('MFA setup error:', error)
    res.status(500).json({ success: false, error: 'Unable to start MFA setup. Check server encryption configuration.' })
  }
})

router.post('/mfa/enable', authenticate, authLimiter, async (req, res) => {
  try {
    const ref = getDbInstance().collection('users').doc(req.user.uid)
    const doc = await ref.get()
    const pending = doc.data()?.pendingMfaSecret
    const createdAt = doc.data()?.pendingMfaCreatedAt?.toDate?.()
    if (!pending || !createdAt || Date.now() - createdAt.getTime() > 10 * 60 * 1000) {
      return res.status(400).json({ success: false, error: 'MFA setup expired. Start again.' })
    }
    const secret = unwrapSecret(pending).toString('utf8')
    if (!verifyTotp(secret, req.body?.code)) {
      return res.status(400).json({ success: false, error: 'Invalid authenticator code' })
    }
    await ref.set({
      mfaSecret: wrapSecret(secret),
      mfaEnabled: true,
      pendingMfaSecret: null,
      pendingMfaCreatedAt: null,
      updatedAt: new Date(),
    }, { merge: true })
    res.json({ success: true, message: 'Multi-factor authentication enabled.' })
  } catch (error) {
    logger.error('MFA enable error:', error)
    res.status(500).json({ success: false, error: 'Unable to enable MFA' })
  }
})

router.post('/mfa/disable', authenticate, authLimiter, async (req, res) => {
  try {
    const ref = getDbInstance().collection('users').doc(req.user.uid)
    const doc = await ref.get()
    const profile = doc.data() || {}
    if (!profile.mfaEnabled || !profile.mfaSecret) {
      return res.status(400).json({ success: false, error: 'MFA is not enabled' })
    }
    const secret = unwrapSecret(profile.mfaSecret).toString('utf8')
    if (!verifyTotp(secret, req.body?.code)) {
      return res.status(401).json({ success: false, error: 'Invalid authenticator code' })
    }
    await ref.set({ mfaEnabled: false, mfaSecret: null, updatedAt: new Date() }, { merge: true })
    res.json({ success: true, message: 'Multi-factor authentication disabled.' })
  } catch (error) {
    logger.error('MFA disable error:', error)
    res.status(500).json({ success: false, error: 'Unable to disable MFA' })
  }
})

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    await getAuthInstance().revokeRefreshTokens(req.user.uid)
    
    logger.info('User logged out:', { uid: req.user.uid })

    res.json({
      success: true,
      message: 'Logged out successfully'
    })
  } catch (error) {
    logger.error('Logout error:', error)
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      message: error.message
    })
  }
})

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid

    // Get user from Auth
    const auth = getAuthInstance()
    const userRecord = await auth.getUser(userId)

    // Get profile from Firestore
    const db = getDbInstance()
    const userDoc = await db.collection('users').doc(userId).get()
    const profileData = userDoc.exists ? userDoc.data() : null

    res.json({
      success: true,
      data: {
        user: {
          ...publicUser(userRecord, profileData || {}),
          age: profileData?.age ?? null,
          phoneNumber: profileData?.phoneNumber ?? null,
          gender: profileData?.gender ?? null,
          country: profileData?.country ?? null,
          hasVoiceprint: Boolean(profileData?.hasVoiceprint),
          createdAt: profileData?.createdAt || null,
          lastLogin: profileData?.lastLogin || null,
          memberSince: profileData?.memberSince || null,
          registrationDate: profileData?.registrationDate || null,
        }
      }
    })
  } catch (error) {
    logger.error('Get user error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get user data',
      message: error.message
    })
  }
})

/**
 * POST /api/auth/oauth/google
 * Handle Google OAuth (ID token from client)
 */
router.post('/oauth/google', authLimiter, async (req, res) => {
  try {
    const { idToken, credential } = req.body

    // Support both Firebase ID token and Google credential
    let googleIdToken = idToken || credential

    if (!googleIdToken) {
      return res.status(400).json({
        success: false,
        error: 'ID token or credential is required'
      })
    }

    // Verify Firebase ID token (from Firebase Auth SDK)
    const auth = getAuthInstance()
    const db = getDbInstance()
    let decodedToken
    try {
      // Verify as Firebase ID token (Firebase Auth SDK provides this)
      decodedToken = await auth.verifyIdToken(googleIdToken)
    } catch (error) {
      // If not Firebase token, verify as Google ID token
      // Note: You may need to verify Google JWT manually or use a library
      // For now, we'll use Firebase Auth REST API to verify Google token
      const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${process.env.FIREBASE_WEB_API_KEY}`
      
      const verifyResponse = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postBody: `id_token=${googleIdToken}&providerId=google.com`,
          requestUri: process.env.FRONTEND_URL || 'http://localhost:5173',
          returnIdpCredential: true,
          returnSecureToken: true
        })
      })

      const verifyData = await verifyResponse.json()
      
      if (!verifyResponse.ok) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Google token',
          message: verifyData.error?.message
        })
      }

      // Verify the Firebase ID token from the response
      decodedToken = await auth.verifyIdToken(verifyData.idToken)
      googleIdToken = verifyData.idToken // Use Firebase ID token for consistency
    }

    const { uid, email, name } = decodedToken

    // Ensure user exists in Firebase Auth
    let userRecord
    try {
      userRecord = await auth.getUser(uid)
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        userRecord = await auth.createUser({
          uid,
          email,
          displayName: name || null,
          emailVerified: true
        })
      } else {
        throw error
      }
    }

    // Ensure Firestore profile exists and update login metadata
    const userDocRef = db.collection('users').doc(uid)
    const userDoc = await userDocRef.get()
    const timestamp = new Date()

    if (userDoc.exists) {
      await userDocRef.update({
        lastLogin: timestamp,
        updatedAt: timestamp
      })
    } else {
      const userProfile = {
        email: (userRecord && userRecord.email) || email || '',
        displayName: (userRecord && userRecord.displayName) || name || '',
        age: null,
        phoneNumber: null,
        gender: null,
        country: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLogin: timestamp,
        memberSince: timestamp,
        registrationDate: timestamp,
        role: 'user',
        emailVerified: true,
        mfaEnabled: false
      }

      await userDocRef.set(userProfile)
    }

    logger.info('Google OAuth login:', { uid, email })

    res.json({
      success: true,
      data: {
        user: publicUser(userRecord, userDoc.data() || {}),
        idToken: googleIdToken,
        refreshToken: null // OAuth tokens don't have refresh tokens in this flow
      }
    })
  } catch (error) {
    logger.error('Google OAuth error:', error)
    res.status(500).json({
      success: false,
      error: 'OAuth authentication failed',
      message: error.message
    })
  }
})

/**
 * POST /api/auth/oauth/apple
 * Handle Apple OAuth (redirect from client)
 */
router.post('/oauth/apple', authLimiter, async (req, res) => {
  try {
    const { idToken } = req.body

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'ID token is required'
      })
    }

    // Verify Apple ID token
    const auth = getAuthInstance()
    const db = getDbInstance()
    const decodedToken = await auth.verifyIdToken(idToken)
    const { uid, email, name } = decodedToken

    // Check if user exists, if not create
    let userRecord
    try {
      userRecord = await auth.getUser(uid)
      
      // Update last login
      await db.collection('users').doc(uid).update({
        lastLogin: new Date(),
        updatedAt: new Date()
      })
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Create new user
        userRecord = await auth.createUser({
          uid,
          email: email || null,
          displayName: name || null,
          emailVerified: true
        })

        // Create profile in Firestore
        const userProfile = {
          email: email || '',
          displayName: name || '',
          age: null,
          phoneNumber: null,
          gender: null,
          country: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: new Date(),
          memberSince: new Date(),
          registrationDate: new Date(),
          role: 'user',
          emailVerified: true,
          mfaEnabled: false
        }

        await db.collection('users').doc(uid).set(userProfile)
      } else {
        throw error
      }
    }

    // Generate custom token
    const customToken = await auth.createCustomToken(uid)

    logger.info('Apple OAuth login:', { uid, email })

    res.json({
      success: true,
      data: {
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName
        },
        token: customToken,
        idToken: idToken
      }
    })
  } catch (error) {
    logger.error('Apple OAuth error:', error)
    res.status(500).json({
      success: false,
      error: 'OAuth authentication failed',
      message: error.message
    })
  }
})

/**
 * POST /api/auth/verify-token
 * Verify authentication token
 */
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      })
    }

    // Verify token
    const auth = getAuthInstance()
    const decodedToken = await auth.verifyIdToken(token)
    
    res.json({
      success: true,
      data: {
        user: {
          uid: decodedToken.uid,
          email: decodedToken.email
        },
        valid: true
      }
    })
  } catch (error) {
    logger.error('Token verification error:', error)
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      valid: false
    })
  }
})

export default router
