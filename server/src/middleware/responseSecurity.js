import crypto from 'crypto'
import { isAbsolute } from 'path'

const SENSITIVE_KEYS = new Set(['stack', 'indexUrl', 'physicalPath', 'localAudioPath'])

export const sanitizeResponsePayload = (payload, statusCode = 200) => {
  if (Array.isArray(payload)) return payload.map(value => sanitizeResponsePayload(value, statusCode))
  if (!payload || typeof payload !== 'object') return payload

  const sanitized = {}
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key)) continue

    if (typeof value === 'string' && isAbsolute(value)) {
      sanitized[key] = '[redacted]'
      continue
    }

    sanitized[key] = sanitizeResponsePayload(value, statusCode)
  }

  if (statusCode >= 500 && 'message' in sanitized) {
    sanitized.message = 'The request could not be completed'
  }
  return sanitized
}

export const responseSecurity = (req, res, next) => {
  const requestId = String(req.get('x-request-id') || crypto.randomUUID()).slice(0, 128)
  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)

  const sendJson = res.json.bind(res)
  res.json = payload => sendJson(sanitizeResponsePayload(payload, res.statusCode))
  next()
}

export default { responseSecurity, sanitizeResponsePayload }
