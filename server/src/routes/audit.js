/**
 * Audit Routes
 * Get audit logs (admin/user access)
 */

import express from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import { getUserAuditEvents, getAuditEventsByOperation } from '../services/auditLogger.js'
import { logger } from '../utils/logger.js'

const router = express.Router()

/**
 * GET /api/audit/user
 * Get audit events for current user
 */
router.get('/user', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid
    const requestedLimit = parseInt(req.query.limit, 10)
    const limit = Number.isNaN(requestedLimit) ? 50 : Math.max(1, Math.min(requestedLimit, 200))

    const result = await getUserAuditEvents(userId, limit)

    if (!result.success) {
      if (result.needsIndex) {
        return res.status(503).json({
          success: false,
          error: 'Firestore index required',
          code: 'FIRESTORE_INDEX_REQUIRED',
          message: 'The audit history index is not deployed.'
        })
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to get audit events'
      })
    }

    res.json({
      success: true,
      data: {
        events: result.events,
        count: result.events.length
      }
    })
  } catch (error) {
    logger.error('Error getting user audit events:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to get audit events'
    })
  }
})

/**
 * GET /api/audit/operation/:operation
 * Get audit events by operation type (admin only - can be restricted later)
 */
router.get('/operation/:operation', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { operation } = req.params
    const requestedLimit = parseInt(req.query.limit, 10)
    const limit = Number.isNaN(requestedLimit) ? 100 : Math.max(1, Math.min(requestedLimit, 200))

    const validOperations = ['enroll', 'verify', 'delete', 'update']
    if (!validOperations.includes(operation)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid operation type',
        message: `Operation must be one of: ${validOperations.join(', ')}`
      })
    }

    const result = await getAuditEventsByOperation(operation, limit)

    if (!result.success) {
      if (result.needsIndex) {
        return res.status(503).json({
          success: false,
          error: 'Firestore index required',
          code: 'FIRESTORE_INDEX_REQUIRED',
          message: 'The audit history index is not deployed.'
        })
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to get audit events'
      })
    }

    res.json({
      success: true,
      data: {
        operation,
        events: result.events,
        count: result.events.length
      }
    })
  } catch (error) {
    logger.error('Error getting audit events by operation:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to get audit events'
    })
  }
})

export default router
