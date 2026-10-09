const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/
const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\p{M}]*(?: \p{L}[\p{L}\p{M}]*)*$/u
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export const normalizeEmail = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

export const isValidEmail = (value) => {
  const email = normalizeEmail(value)
  return email.length <= 254 && EMAIL_PATTERN.test(email)
}

export const normalizeUsername = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

export const isValidUsername = (value) => {
  const username = normalizeUsername(value)
  return username.length >= 3 && username.length <= 30 && USERNAME_PATTERN.test(username)
}

export const isSafeDocumentId = (value) => (
  typeof value === 'string' && SAFE_ID_PATTERN.test(value)
)

export const cleanText = (value, { maxLength = 120, allowEmpty = true } = {}) => {
  if (value == null && allowEmpty) return ''
  if (typeof value !== 'string') throw new TypeError('Expected text value')
  const cleaned = value.trim().replace(/[\u0000-\u001F\u007F]/g, '')
  if (!allowEmpty && !cleaned) throw new Error('Value cannot be empty')
  if (cleaned.length > maxLength) throw new Error(`Value must be at most ${maxLength} characters`)
  return cleaned
}

export const normalizePersonName = (value) => {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
}

export const isValidPersonName = (value) => {
  const name = normalizePersonName(value)
  return name.length >= 2 && name.length <= 80 && PERSON_NAME_PATTERN.test(name)
}

export const containsDangerousKeys = (value, depth = 0) => {
  if (depth > 12) return true
  if (!value || typeof value !== 'object') return false

  return Object.keys(value).some((key) => (
    DANGEROUS_KEYS.has(key) || key.startsWith('$') || key.includes('.') ||
    containsDangerousKeys(value[key], depth + 1)
  ))
}

export const rejectDangerousInput = (req, res, next) => {
  const sources = [req.body, req.query, req.params]
  if (sources.some((source) => containsDangerousKeys(source))) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request data',
      message: 'The request contains unsupported field names.',
    })
  }
  next()
}

export default {
  normalizeEmail,
  isValidEmail,
  normalizeUsername,
  isValidUsername,
  isSafeDocumentId,
  cleanText,
  normalizePersonName,
  isValidPersonName,
  containsDangerousKeys,
  rejectDangerousInput,
}
