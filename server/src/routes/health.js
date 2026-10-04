import express from 'express'
import { logger } from '../utils/logger.js'
import { getFirestore } from '../config/firebase.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = express.Router()
const HEALTH_TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS || 3000)

const withTimeout = (promise, fallback) => new Promise(resolve => {
  const timeout = setTimeout(() => resolve(fallback), HEALTH_TIMEOUT_MS)
  promise
    .then(value => resolve(value))
    .catch(() => resolve(fallback))
    .finally(() => clearTimeout(timeout))
})

const serviceHealthUrl = (configured, fallbackPort) => {
  const url = new URL(configured || `http://localhost:${fallbackPort}`)
  url.pathname = '/health'
  url.search = ''
  return url.toString()
}

const fetchHealth = async url => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`)
    const data = await response.json()
    return { operational: true, modelVersion: data.modelVersion || data.model || null }
  } catch (error) {
    return { operational: false, error: error.name === 'AbortError' ? 'timeout' : 'unavailable' }
  } finally {
    clearTimeout(timeout)
  }
}

const checkDependencies = async () => {
  const [firebase, embedding, antiSpoof] = await Promise.all([
    withTimeout(getFirestore().collection('_health_probe').limit(1).get()
      .then(() => ({ operational: true }))
      .catch(error => {
        logger.error('Firebase health check failed:', error.message)
        return { operational: false, error: 'unavailable' }
      }), { operational: false, error: 'timeout' }),
    fetchHealth(serviceHealthUrl(process.env.EMBED_SERVICE_URL, 8000)),
    fetchHealth(serviceHealthUrl(process.env.ANTISPOOF_SERVICE_URL, 8001))
  ])

  const placeholder = /placeholder|heuristic/i.test(antiSpoof.modelVersion || '')
  const productionModelRequired = process.env.REQUIRE_PRODUCTION_ANTISPOOF === 'true'
  antiSpoof.productionReady = antiSpoof.operational && !placeholder
  if (productionModelRequired && placeholder) antiSpoof.operational = false

  return { firebase, embedding, antiSpoof }
}

/** Liveness: the Node process can answer requests. */
router.get('/', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

/** Readiness: all dependencies required for authentication are available. */
router.get('/ready', async (_req, res) => {
  const services = await checkDependencies()
  const ready = Object.values(services).every(service => service.operational)
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ready' : 'not_ready',
    dependencies: Object.fromEntries(
      Object.entries(services).map(([name, service]) => [name, service.operational ? 'operational' : 'unavailable'])
    )
  })
})

/** Detailed dependency metadata is restricted to administrators. */
router.get('/detailed', authenticate, requireRole('admin'), async (_req, res) => {
  const services = await checkDependencies()
  const ready = Object.values(services).every(service => service.operational)
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services
  })
})

export default router
