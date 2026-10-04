/**
 * Audit Logging Service
 * Logs all enrollment and verification events for compliance and security
 */

import { getFirestore } from '../config/firebase.js'
import { logger } from '../utils/logger.js'
import crypto from 'crypto'

const AUDIT_COLLECTION = 'audit_events'
const FALLBACK_SCAN_LIMIT = 1000

const serializeEvents = snapshot => snapshot.docs.map(doc => {
  const data = doc.data()
  return {
    id: doc.id,
    ...data,
    timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp
  }
})

const timestampMillis = event => {
  const parsed = new Date(event.timestamp).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const fallbackIndexedQuery = async ({ field, value, limit }) => {
  const snapshot = await getFirestore().collection(AUDIT_COLLECTION)
    .where(field, '==', value)
    .limit(FALLBACK_SCAN_LIMIT)
    .get()
  return serializeEvents(snapshot)
    .sort((left, right) => timestampMillis(right) - timestampMillis(left))
    .slice(0, limit)
}

const canonicalize = value => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key])
      return result
    }, {})
  }
  return value
}

const auditKeyring = () => {
  if (process.env.AUDIT_HMAC_KEYS) {
    const parsed = JSON.parse(process.env.AUDIT_HMAC_KEYS)
    return new Map(Object.entries(parsed).map(([version, secret]) => [Number(version), secret]))
  }
  const fallback = process.env.AUDIT_HMAC_KEY || process.env.VOICEPRINT_MASTER_KEY
  if (!fallback || fallback.length < 32) throw new Error('AUDIT_HMAC_KEY is not configured')
  return new Map([[1, fallback]])
}

const auditKey = version => {
  const keyring = auditKeyring()
  const selectedVersion = version ?? Number(process.env.AUDIT_ACTIVE_KEY_VERSION || Math.max(...keyring.keys()))
  const secret = keyring.get(Number(selectedVersion))
  if (!secret || secret.length < 32) throw new Error(`Audit HMAC key version ${selectedVersion} is unavailable`)
  return { secret, version: Number(selectedVersion) }
}

const integrityPayload = event => ({
  id: event.id,
  userId: event.userId,
  operation: event.operation,
  status: event.status,
  decision: event.decision,
  scoreDetails: event.scoreDetails,
  metadata: event.metadata,
  error: event.error,
  timestamp: event.timestamp instanceof Date
    ? event.timestamp.toISOString()
    : event.timestamp?.toDate?.()?.toISOString?.() || event.timestamp
})

export const signAuditEvent = (event, keyVersion) => {
  const { secret, version } = auditKey(keyVersion)
  const digest = crypto.createHmac('sha256', secret)
    .update(JSON.stringify(canonicalize(integrityPayload(event))))
    .digest('hex')
  return { algorithm: 'HMAC-SHA256', keyVersion: version, digest }
}

export const verifyAuditEventIntegrity = event => {
  const integrity = event?.integrity
  if (!integrity || integrity.algorithm !== 'HMAC-SHA256' || !integrity.digest) return false
  const expected = signAuditEvent(event, integrity.keyVersion).digest
  const actualBuffer = Buffer.from(integrity.digest, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

/**
 * Log an audit event
 * @param {Object} eventData - Event data to log
 * @returns {Promise<{success: boolean, eventId?: string, error?: string}>}
 */
export const logAuditEvent = async (eventData) => {
  try {
    const db = getFirestore()
    
    const {
      userId,
      operation, // 'enroll' | 'verify' | 'delete' | 'update'
      status, // 'success' | 'failure' | 'processing'
      scoreDetails = null, // Match score, synthetic score, etc.
      decision = null, // 'ACCEPT' | 'CHALLENGE' | 'REJECT'
      metadata = {},
      error = null
    } = eventData

    // Validate required fields
    if (!userId || !operation || !status) {
      throw new Error('Missing required audit fields: userId, operation, status')
    }

    const eventRef = db.collection(AUDIT_COLLECTION).doc()
    const auditEvent = {
      id: eventRef.id,
      userId,
      operation,
      status,
      decision,
      scoreDetails,
      metadata,
      error: error ? error.message || error : null,
      timestamp: new Date(),
      ipAddress: metadata.ipAddress || null,
      userAgent: metadata.userAgent || null,
      integrityHash: null,
      integrity: null
    }

    auditEvent.integrity = signAuditEvent(auditEvent)
    auditEvent.integrityHash = auditEvent.integrity.digest

    // Store in Firestore
    await eventRef.set(auditEvent)

    logger.info('Audit event logged:', {
      eventId: eventRef.id,
      userId,
      operation,
      status
    })

    return {
      success: true,
      eventId: eventRef.id
    }
  } catch (error) {
    logger.error('Failed to log audit event:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Log enrollment event
 * @param {string} userId - User ID
 * @param {string} status - Event status
 * @param {Object} metadata - Additional metadata
 * @param {Error} error - Error if any
 */
export const logEnrollment = async (userId, status, metadata = {}, error = null) => {
  return await logAuditEvent({
    userId,
    operation: 'enroll',
    status,
    metadata,
    error
  })
}

/**
 * Log verification event
 * @param {string} userId - User ID
 * @param {string} status - Event status
 * @param {Object} scoreDetails - Score details (similarity, syntheticScore, finalScore)
 * @param {string} decision - Decision (ACCEPT, CHALLENGE, REJECT)
 * @param {Object} metadata - Additional metadata
 * @param {Error} error - Error if any
 */
export const logVerification = async (userId, status, scoreDetails = null, decision = null, metadata = {}, error = null) => {
  return await logAuditEvent({
    userId,
    operation: 'verify',
    status,
    scoreDetails,
    decision,
    metadata,
    error
  })
}

/**
 * Get audit events for a user
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of events to return
 * @returns {Promise<{success: boolean, events?: Array, error?: string}>}
 */
export const getUserAuditEvents = async (userId, limit = 50) => {
  try {
    const db = getFirestore()
    
    const eventsSnapshot = await db.collection(AUDIT_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get()

    const events = serializeEvents(eventsSnapshot)

    return {
      success: true,
      events
    }
  } catch (error) {
    logger.error('Failed to get audit events:', error.message)
    const normalizedCode = typeof error.code === 'number'
      ? error.code
      : typeof error.code === 'string'
      ? error.code.toLowerCase()
      : null
    const needsIndex = (normalizedCode === 9 || normalizedCode === '9' || normalizedCode === 'failed-precondition') &&
      error.message?.toLowerCase?.().includes('requires an index')
    let indexUrl = null

    if (needsIndex) {
      const match = error.message.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/)
      if (match) {
        indexUrl = match[0]
      }
      logger.warn('Firestore composite index required for audit events query')
      try {
        const events = await fallbackIndexedQuery({ field: 'userId', value: userId, limit })
        logger.warn('Using bounded in-memory audit history fallback until the composite index is deployed', {
          userId,
          scannedAtMost: FALLBACK_SCAN_LIMIT
        })
        return { success: true, events, degraded: true }
      } catch (fallbackError) {
        logger.error('Audit history fallback query failed:', fallbackError.message)
      }
    }

    return {
      success: false,
      error: error.message,
      events: [],
      needsIndex,
      indexUrl
    }
  }
}

/**
 * Get audit events by operation type
 * @param {string} operation - Operation type (enroll, verify, etc.)
 * @param {number} limit - Maximum number of events
 * @returns {Promise<{success: boolean, events?: Array, error?: string}>}
 */
export const getAuditEventsByOperation = async (operation, limit = 100) => {
  try {
    const db = getFirestore()
    
    const eventsSnapshot = await db.collection(AUDIT_COLLECTION)
      .where('operation', '==', operation)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get()

    const events = serializeEvents(eventsSnapshot)

    return {
      success: true,
      events
    }
  } catch (error) {
    logger.error('Failed to get audit events by operation:', error.message)
    const normalizedCode = typeof error.code === 'number'
      ? error.code
      : typeof error.code === 'string'
      ? error.code.toLowerCase()
      : null
    const needsIndex = (normalizedCode === 9 || normalizedCode === '9' || normalizedCode === 'failed-precondition') &&
      error.message?.toLowerCase?.().includes('requires an index')
    let indexUrl = null

    if (needsIndex) {
      const match = error.message.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/)
      if (match) {
        indexUrl = match[0]
      }
      logger.warn('Firestore composite index required for audit operation query')
      try {
        const events = await fallbackIndexedQuery({ field: 'operation', value: operation, limit })
        logger.warn('Using bounded in-memory operation history fallback until the composite index is deployed', {
          operation,
          scannedAtMost: FALLBACK_SCAN_LIMIT
        })
        return { success: true, events, degraded: true }
      } catch (fallbackError) {
        logger.error('Audit operation fallback query failed:', fallbackError.message)
      }
    }

    return {
      success: false,
      error: error.message,
      events: [],
      needsIndex,
      indexUrl
    }
  }
}

export default {
  logAuditEvent,
  logEnrollment,
  logVerification,
  getUserAuditEvents,
  getAuditEventsByOperation
}
