import rateLimit from 'express-rate-limit'
import { logger } from '../utils/logger.js'

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded:', {
      ip: req.ip,
      path: req.path,
      method: req.method
    })
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.'
    })
  }
})

/**
 * Strict rate limiter for enrollment/verification
 */
export const strictLimiter = rateLimit({
  windowMs: parseInt(process.env.BIOMETRIC_RATE_LIMIT_WINDOW_MS || '', 10) || 60 * 60 * 1000,
  max: parseInt(process.env.BIOMETRIC_RATE_LIMIT_MAX || '', 10) || 10,
  keyGenerator: req => req.user?.uid || req.ip,
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Enrollment/verification rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Strict rate limit exceeded:', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.uid
    })
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'You have exceeded the maximum number of enrollments/verifications per hour.'
    })
  }
})

/** Tighter protection for password, MFA, reset, and OAuth endpoints. */
export const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '', 10) || 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '', 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    logger.warn('Authentication rate limit exceeded:', { ip: req.ip, path: req.path })
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts',
      code: 'AUTH_RATE_LIMITED'
    })
  }
})
