// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Import routes
import healthRoutes from './routes/health.js'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/user.js'
import storageRoutes from './routes/storage.js'
import enrollRoutes from './routes/enroll.js'
import verifyRoutes from './routes/verify.js'
import auditRoutes from './routes/audit.js'
import adminRoutes from './routes/admin.js'

// Import middleware
import { errorHandler } from './middleware/errorHandler.js'
import { logger } from './utils/logger.js'
import { initializeFirebase } from './config/firebase.js'
import { authenticate, requireRole, requireVerifiedEmail } from './middleware/auth.js'
import { rejectDangerousInput, noStore } from './middleware/security.js'
import { apiLimiter } from './middleware/rateLimiter.js'
import { responseSecurity } from './middleware/responseSecurity.js'
import { validateSecurityConfiguration } from './config/security.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

validateSecurityConfiguration()

if (process.env.TRUST_PROXY !== undefined) {
  const trustProxy = process.env.TRUST_PROXY === 'true'
    ? 1
    : process.env.TRUST_PROXY === 'false'
      ? false
      : Number(process.env.TRUST_PROXY)
  app.set('trust proxy', trustProxy)
}

// Security middleware
app.use(helmet())
app.use(responseSecurity)

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173']
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true)
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200,
  preflightContinue: false
}))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
app.use(rejectDangerousInput)
app.use(noStore)
app.use('/api', apiLimiter)

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }))
}

// Health check route (no auth required)
app.use('/api/health', healthRoutes)

// Authentication routes (no auth required for login/register)
app.use('/api/auth', authRoutes)

// User routes (require authentication)
app.use('/api/user', authenticate, requireVerifiedEmail, userRoutes)

// Storage routes (require authentication)
app.use('/api/storage', authenticate, requireVerifiedEmail, storageRoutes)

// API routes (require authentication)
app.use('/api/enroll', authenticate, requireVerifiedEmail, enrollRoutes)
app.use('/api/verify', authenticate, requireVerifiedEmail, verifyRoutes)
app.use('/api/audit', authenticate, requireVerifiedEmail, auditRoutes)
app.use('/api/admin', authenticate, requireVerifiedEmail, requireRole('admin'), adminRoutes)

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Voice Identity Shield API Server',
    version: '1.0.0',
    status: 'running',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth',
        user: '/api/user',
        storage: '/api/storage',
        enroll: '/api/enroll',
        verify: '/api/verify',
        audit: '/api/audit',
        admin: '/api/admin'
      }
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  })
})

// Error handling middleware (must be last)
app.use(errorHandler)

// Initialize Firebase Admin SDK
try {
  initializeFirebase()
} catch (error) {
  logger.error('Failed to initialize Firebase Admin SDK:', error)
  process.exit(1)
}

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`)
  logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`)
  logger.info(`🌐 CORS enabled for: ${allowedOrigins.join(', ')}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...')
  process.exit(0)
})

export default app
