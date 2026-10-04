export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 12 characters', test: (value) => value.length >= 12 && value.length <= 128 },
  { key: 'lowercase', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { key: 'uppercase', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { key: 'number', label: 'One number', test: (value) => /\d/.test(value) },
  { key: 'symbol', label: 'One special character', test: (value) => /[^A-Za-z0-9\s]/.test(value) },
  { key: 'noWhitespace', label: 'No spaces', test: (value) => !/\s/.test(value) },
]

const COMMON_PASSWORDS = new Set([
  'password', 'password123', '12345678', '123456789', 'qwerty123',
  'admin123', 'letmein', 'welcome', 'iloveyou', 'changeme',
])

export const evaluatePassword = (password = '') => {
  const checks = Object.fromEntries(PASSWORD_REQUIREMENTS.map(({ key, test }) => [key, test(password)]))
  checks.uncommon = !COMMON_PASSWORDS.has(password.toLowerCase())
  const valid = Object.values(checks).every(Boolean)
  const score = Math.round(Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100)
  return { valid, score, checks }
}
