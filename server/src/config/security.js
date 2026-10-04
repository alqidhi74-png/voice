import { logger } from '../utils/logger.js'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

const parseNumber = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`)
  }
  return value
}

const parseUrl = (name, fallback) => {
  try {
    return new URL(process.env[name] || fallback)
  } catch {
    throw new Error(`${name} must be a valid URL`)
  }
}

const hasStrongSecret = (value) => typeof value === 'string' && value.length >= 32

const hasVersionedSecrets = (name) => {
  if (!process.env[name]) return false
  try {
    const parsed = JSON.parse(process.env[name])
    return Object.values(parsed).length > 0 && Object.values(parsed).every(hasStrongSecret)
  } catch {
    throw new Error(`${name} must be a JSON object containing secrets of at least 32 characters`)
  }
}

/**
 * Fail closed on unsafe production configuration. Development remains usable,
 * but warnings make every production-only gap explicit.
 */
export const validateSecurityConfiguration = () => {
  const production = process.env.NODE_ENV === 'production'
  const errors = []
  const warnings = []

  const masterKeyConfigured = hasStrongSecret(process.env.VOICEPRINT_MASTER_KEY)
    || hasVersionedSecrets('VOICEPRINT_MASTER_KEYS')
  const auditKeyConfigured = hasStrongSecret(process.env.AUDIT_HMAC_KEY)
    || hasVersionedSecrets('AUDIT_HMAC_KEYS')

  if (!masterKeyConfigured) errors.push('VOICEPRINT_MASTER_KEY(S) must contain at least 32 random characters')
  if (!auditKeyConfigured) {
    const message = 'AUDIT_HMAC_KEY(S) must contain at least 32 random characters and be separate from the encryption key'
    if (production) errors.push(message)
    else warnings.push(`${message}; development will fall back to VOICEPRINT_MASTER_KEY`)
  }

  const origins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  if (origins.includes('*')) errors.push('ALLOWED_ORIGINS must never contain *')
  if (production && origins.length === 0) errors.push('ALLOWED_ORIGINS is required in production')

  for (const origin of origins) {
    try {
      const url = new URL(origin)
      if (production && url.protocol !== 'https:' && !LOOPBACK_HOSTS.has(url.hostname)) {
        errors.push(`Production origin must use HTTPS: ${origin}`)
      }
    } catch {
      errors.push(`Invalid ALLOWED_ORIGINS entry: ${origin}`)
    }
  }

  const allowInsecureMl = process.env.ALLOW_INSECURE_ML_SERVICES === 'true'
  for (const [name, fallback] of [
    ['EMBED_SERVICE_URL', 'http://localhost:8000/embed'],
    ['ANTISPOOF_SERVICE_URL', 'http://localhost:8001/antispoof']
  ]) {
    const url = parseUrl(name, fallback)
    if (production && url.protocol !== 'https:' && !LOOPBACK_HOSTS.has(url.hostname) && !allowInsecureMl) {
      errors.push(`${name} must use HTTPS in production`)
    }
  }

  const spoofThreshold = parseNumber('ANTISPOOF_REJECT_THRESHOLD', 0.5)
  const acceptThreshold = parseNumber('VERIFICATION_ACCEPT_THRESHOLD', 0.75)
  if (spoofThreshold <= 0 || spoofThreshold >= 1) errors.push('ANTISPOOF_REJECT_THRESHOLD must be between 0 and 1')
  if (acceptThreshold <= 0 || acceptThreshold > 1) errors.push('VERIFICATION_ACCEPT_THRESHOLD must be greater than 0 and at most 1')

  if (production && process.env.REQUIRE_PRODUCTION_ANTISPOOF !== 'true') {
    errors.push('REQUIRE_PRODUCTION_ANTISPOOF=true is mandatory in production')
  }

  if (production && process.env.TRUST_PROXY === undefined) {
    warnings.push('TRUST_PROXY is unset; configure it when deploying behind a trusted reverse proxy')
  }

  for (const warning of warnings) logger.warn(`Security configuration: ${warning}`)
  if (errors.length) {
    const error = new Error(`Unsafe security configuration:\n- ${errors.join('\n- ')}`)
    error.code = 'UNSAFE_SECURITY_CONFIGURATION'
    throw error
  }

  return { valid: true, warnings }
}

export default { validateSecurityConfiguration }
