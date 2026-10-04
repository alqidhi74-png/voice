const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 128

export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters` },
  { key: 'lowercase', label: 'One lowercase letter' },
  { key: 'uppercase', label: 'One uppercase letter' },
  { key: 'number', label: 'One number' },
  { key: 'symbol', label: 'One special character' },
  { key: 'noWhitespace', label: 'No spaces' },
]

const COMMON_PASSWORDS = new Set([
  'password', 'password123', '12345678', '123456789', 'qwerty123',
  'admin123', 'letmein', 'welcome', 'iloveyou', 'changeme',
])

export const evaluatePassword = (password = '') => {
  const value = typeof password === 'string' ? password : ''
  const checks = {
    length: value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
    lowercase: /[a-z]/.test(value),
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9\s]/.test(value),
    noWhitespace: !/\s/.test(value),
    uncommon: !COMMON_PASSWORDS.has(value.toLowerCase()),
  }

  const failed = PASSWORD_REQUIREMENTS
    .filter(({ key }) => !checks[key])
    .map(({ label }) => label)

  if (!checks.uncommon) {
    failed.push('Must not be a commonly used password')
  }

  const passedCount = Object.values(checks).filter(Boolean).length

  return {
    valid: failed.length === 0,
    checks,
    failed,
    score: Math.round((passedCount / Object.keys(checks).length) * 100),
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  }
}

export const assertStrongPassword = (password) => {
  const result = evaluatePassword(password)
  if (!result.valid) {
    const error = new Error(`Password requirements: ${result.failed.join(', ')}`)
    error.code = 'WEAK_PASSWORD'
    error.details = result
    throw error
  }
  return result
}

export default { PASSWORD_REQUIREMENTS, evaluatePassword, assertStrongPassword }
