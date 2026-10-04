import crypto from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export const encodeBase32 = (buffer) => {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')
  let output = ''
  for (let index = 0; index < bits.length; index += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)]
  }
  return output
}

export const decodeBase32 = (value) => {
  const normalized = String(value || '').toUpperCase().replace(/=|\s|-/g, '')
  if (!normalized || [...normalized].some((char) => !BASE32_ALPHABET.includes(char))) {
    throw new Error('Invalid Base32 secret')
  }
  let bits = ''
  for (const char of normalized) bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, '0')
  const bytes = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2))
  }
  return Buffer.from(bytes)
}

export const generateTotpSecret = () => encodeBase32(crypto.randomBytes(20))

export const generateTotp = (secret, timestamp = Date.now(), { period = 30, digits = 6 } = {}) => {
  const counter = Math.floor(timestamp / 1000 / period)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(binary % (10 ** digits)).padStart(digits, '0')
}

export const verifyTotp = (secret, token, { timestamp = Date.now(), window = 1 } = {}) => {
  const supplied = String(token || '').trim()
  if (!/^\d{6}$/.test(supplied)) return false

  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotp(secret, timestamp + offset * 30_000)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return true
  }
  return false
}

export const createOtpAuthUri = ({ secret, email, issuer = 'Voice Identity Shield' }) => {
  const label = `${issuer}:${email}`
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

export default { encodeBase32, decodeBase32, generateTotpSecret, generateTotp, verifyTotp, createOtpAuthUri }
