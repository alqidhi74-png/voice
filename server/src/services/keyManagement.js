import crypto from 'crypto'
import { encryptData, decryptData } from './encryption.js'

const parseKeyring = () => {
  if (process.env.VOICEPRINT_MASTER_KEYS) {
    let configured
    try {
      configured = JSON.parse(process.env.VOICEPRINT_MASTER_KEYS)
    } catch {
      const error = new Error('VOICEPRINT_MASTER_KEYS must be a valid JSON object')
      error.code = 'MASTER_KEY_NOT_CONFIGURED'
      throw error
    }

    const entries = Object.entries(configured)
    if (!entries.length || entries.some(([version, secret]) => !/^\d+$/.test(version) || typeof secret !== 'string' || secret.length < 32)) {
      const error = new Error('VOICEPRINT_MASTER_KEYS must map numeric versions to secrets of at least 32 characters')
      error.code = 'MASTER_KEY_NOT_CONFIGURED'
      throw error
    }
    return new Map(entries.map(([version, secret]) => [Number(version), secret]))
  }

  const legacy = process.env.VOICEPRINT_MASTER_KEY || process.env.MFA_ENCRYPTION_KEY
  if (!legacy || legacy.length < 32) {
    const error = new Error('VOICEPRINT_MASTER_KEY must be configured with at least 32 random characters')
    error.code = 'MASTER_KEY_NOT_CONFIGURED'
    throw error
  }
  return new Map([[1, legacy]])
}

const activeKeyVersion = (keyring) => {
  const configured = Number(process.env.VOICEPRINT_ACTIVE_KEY_VERSION)
  if (Number.isInteger(configured) && keyring.has(configured)) return configured
  return Math.max(...keyring.keys())
}

const resolveMasterKey = (version) => {
  const keyring = parseKeyring()
  const selectedVersion = version ?? activeKeyVersion(keyring)
  const configured = keyring.get(Number(selectedVersion))
  if (!configured) {
    const error = new Error(`Master key version ${selectedVersion} is unavailable`)
    error.code = 'MASTER_KEY_VERSION_UNAVAILABLE'
    throw error
  }
  return {
    key: crypto.createHash('sha256').update(configured, 'utf8').digest(),
    version: Number(selectedVersion)
  }
}

export const wrapSecret = (secret) => {
  const buffer = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret), 'utf8')
  const { key, version } = resolveMasterKey()
  return {
    ...encryptData(buffer, key),
    keyVersion: version,
  }
}

export const unwrapSecret = (wrapped) => {
  if (!wrapped?.iv || !wrapped?.tag || !wrapped?.data) throw new Error('Invalid wrapped secret')
  const { key } = resolveMasterKey(wrapped.keyVersion ?? 1)
  const decrypted = decryptData(wrapped, key)
  return Buffer.isBuffer(decrypted) ? decrypted : Buffer.from(String(decrypted), 'utf8')
}

export const needsRewrap = (wrapped) => {
  const keyring = parseKeyring()
  return Number(wrapped?.keyVersion ?? 1) !== activeKeyVersion(keyring)
}

export const wrapDataKey = (key) => wrapSecret(key)
export const unwrapDataKey = (wrapped) => unwrapSecret(wrapped)

export default { wrapSecret, unwrapSecret, wrapDataKey, unwrapDataKey, needsRewrap }
