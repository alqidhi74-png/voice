import { getAuth } from '../config/firebase.js'
import { logger } from '../utils/logger.js'

const verifyAndAttachUser = async (req, res, token, options = { required: true }) => {
  try {
    const auth = getAuth()

    // Always check revocation so logout/password changes terminate old sessions immediately.
    const decodedToken = await auth.verifyIdToken(token, true)

    const bootstrapAdmins = (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
    const role = decodedToken.role === 'admin' || bootstrapAdmins.includes(String(decodedToken.email || '').toLowerCase())
      ? 'admin'
      : 'user'

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: Boolean(decodedToken.email_verified),
      role: role === 'admin' ? 'admin' : 'user',
      authTime: Number(decodedToken.auth_time || 0),
    }

    logger.debug('User authenticated:', { uid: req.user.uid, email: req.user.email })

    return true
  } catch (error) {
    if (options.required) {
      logger.error('Authentication error:', error.message)

      if (error.code === 'auth/id-token-expired') {
        res.status(401).json({
          success: false,
          error: 'Token expired',
          message: 'Please log in again'
        })
        return false
      }

      if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-revoked') {
        res.status(401).json({
          success: false,
          error: 'Invalid token',
          message: 'Authentication failed'
        })
        return false
      }

      res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: error.message
      })
      return false
    }

    return true
  }
}

/** Require a token issued recently for destructive account-level operations. */
export const requireRecentAuthentication = (maxAgeSeconds = 300) => (req, res, next) => {
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(req.user?.authTime || 0)
  if (!req.user || ageSeconds < 0 || ageSeconds > maxAgeSeconds) {
    return res.status(401).json({
      success: false,
      error: 'Recent authentication required',
      code: 'RECENT_AUTH_REQUIRED'
    })
  }
  next()
}

/**
 * JWT Authentication Middleware
 * Verifies Firebase ID tokens from client
 */
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'No token provided'
    })
  }

  const token = authHeader.split('Bearer ')[1]

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Invalid token format'
    })
  }

  const verified = await verifyAndAttachUser(req, res, token, { required: true })

  if (verified) {
    next()
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1]

      if (token) {
        const verified = await verifyAndAttachUser(req, res, token, { required: false })
        if (!verified) {
          return next()
        }
      }
    }

    next()
  } catch (error) {
    // Continue without authentication if token is invalid
    next()
  }
}

/** Block sensitive API operations until Firebase confirms the email address. */
export const requireVerifiedEmail = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' })
  }
  if (!req.user.emailVerified) {
    return res.status(403).json({
      success: false,
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
    })
  }
  next()
}

/** Role-based authorization. Roles are assigned only by trusted Admin SDK claims/profile data. */
export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' })
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
      code: 'ROLE_FORBIDDEN',
    })
  }
  next()
}
