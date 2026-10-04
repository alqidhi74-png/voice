import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluatePassword } from '../src/utils/passwordPolicy.js'
import { containsDangerousKeys, isSafeDocumentId, isValidEmail } from '../src/utils/validation.js'
import { generateTotp, verifyTotp } from '../src/services/totp.js'
import { needsRewrap, unwrapDataKey, wrapDataKey } from '../src/services/keyManagement.js'
import { signAuditEvent, verifyAuditEventIntegrity } from '../src/services/auditLogger.js'
import { sanitizeResponsePayload } from '../src/middleware/responseSecurity.js'
import { validateSecurityConfiguration } from '../src/config/security.js'
import { evaluatePassword as evaluateClientPassword } from '../../client/src/utils/passwordPolicy.js'
import { access, mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { processVerification } from '../src/services/scoreFusion.js'
import { createTemporaryFileTracker } from '../src/services/temporaryFiles.js'
import { detectSynthetic } from '../src/services/antiSpoof.js'
import {
  createLocalAudioReference,
  getLocalEncryptedAudioPath,
  readOwnedLocalAudio,
  writeEncryptedAudioFile
} from '../src/services/localAudioStorage.js'

test('password policy accepts a strong password and rejects common weak values', () => {
  assert.equal(evaluatePassword('Correct-Horse7!').valid, true)
  assert.equal(evaluatePassword('password123').valid, false)
  assert.equal(evaluatePassword('NoSymbols123').valid, false)
})

test('client and server enforce the same password outcomes', () => {
  for (const candidate of ['Correct-Horse7!', 'password123', 'NoSymbols123', 'Has Space7! Aa']) {
    assert.equal(evaluateClientPassword(candidate).valid, evaluatePassword(candidate).valid)
  }
})

test('request validation rejects NoSQL/operator and prototype-pollution keys', () => {
  assert.equal(containsDangerousKeys({ email: { $ne: null } }), true)
  assert.equal(containsDangerousKeys({ profile: { 'role.admin': true } }), true)
  assert.equal(containsDangerousKeys(JSON.parse('{"__proto__":{"admin":true}}')), true)
  assert.equal(containsDangerousKeys({ displayName: 'Safe User' }), false)
})

test('email and Firestore document IDs are strictly validated', () => {
  assert.equal(isValidEmail('user@example.com'), true)
  assert.equal(isValidEmail('not-an-email'), false)
  assert.equal(isSafeDocumentId('firebase_UID-123'), true)
  assert.equal(isSafeDocumentId('../other-user'), false)
})

test('TOTP implements deterministic RFC-style time windows', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  const timestamp = 1_700_000_000_000
  const token = generateTotp(secret, timestamp)
  assert.match(token, /^\d{6}$/)
  assert.equal(verifyTotp(secret, token, { timestamp, window: 0 }), true)
  assert.equal(verifyTotp(secret, '000000', { timestamp, window: 0 }), token === '000000')
})

test('data keys are wrapped and tampering is detected by AES-GCM', () => {
  process.env.VOICEPRINT_MASTER_KEY = 'test-only-master-key-with-at-least-32-characters'
  const key = Buffer.alloc(32, 7)
  const wrapped = wrapDataKey(key)
  assert.deepEqual(unwrapDataKey(wrapped), key)
  assert.throws(() => unwrapDataKey({ ...wrapped, data: `${wrapped.data.slice(0, -2)}AA` }))
})

test('versioned master keys decrypt old data and mark it for re-wrapping', () => {
  const previousKeyring = process.env.VOICEPRINT_MASTER_KEYS
  const previousActive = process.env.VOICEPRINT_ACTIVE_KEY_VERSION
  try {
    process.env.VOICEPRINT_MASTER_KEYS = JSON.stringify({
      1: 'old-test-master-key-with-at-least-32-characters',
      2: 'new-test-master-key-with-at-least-32-characters'
    })
    process.env.VOICEPRINT_ACTIVE_KEY_VERSION = '1'
    const key = Buffer.alloc(32, 9)
    const wrapped = wrapDataKey(key)
    process.env.VOICEPRINT_ACTIVE_KEY_VERSION = '2'
    assert.deepEqual(unwrapDataKey(wrapped), key)
    assert.equal(needsRewrap(wrapped), true)
    assert.equal(wrapDataKey(key).keyVersion, 2)
  } finally {
    if (previousKeyring === undefined) delete process.env.VOICEPRINT_MASTER_KEYS
    else process.env.VOICEPRINT_MASTER_KEYS = previousKeyring
    if (previousActive === undefined) delete process.env.VOICEPRINT_ACTIVE_KEY_VERSION
    else process.env.VOICEPRINT_ACTIVE_KEY_VERSION = previousActive
  }
})

test('audit events use keyed integrity and reject tampering', () => {
  process.env.AUDIT_HMAC_KEY = 'separate-test-audit-key-with-at-least-32-characters'
  const event = {
    id: 'event-1',
    userId: 'user-1',
    operation: 'verify',
    status: 'success',
    decision: 'ACCEPT',
    scoreDetails: { matchScore: 0.95 },
    metadata: { requestId: 'request-1' },
    error: null,
    timestamp: new Date('2026-01-01T00:00:00.000Z')
  }
  event.integrity = signAuditEvent(event)
  assert.equal(verifyAuditEventIntegrity(event), true)
  assert.equal(verifyAuditEventIntegrity({ ...event, decision: 'REJECT' }), false)
})

test('response sanitizer removes infrastructure details and server errors', () => {
  const sanitized = sanitizeResponsePayload({
    message: 'failed at C:\\private\\audio.wav',
    indexUrl: 'https://console.firebase.google.com/project/private',
    localAudioPath: 'C:\\private\\audio.wav',
    data: { audioStoragePath: 'local/voiceprints/id/audio' }
  }, 500)
  assert.equal(sanitized.message, 'The request could not be completed')
  assert.equal('indexUrl' in sanitized, false)
  assert.equal('localAudioPath' in sanitized, false)
  assert.equal(sanitized.data.audioStoragePath, 'local/voiceprints/id/audio')
})

test('production configuration fails closed unless a real anti-spoof model is required', () => {
  const names = [
    'NODE_ENV', 'VOICEPRINT_MASTER_KEY', 'VOICEPRINT_MASTER_KEYS', 'AUDIT_HMAC_KEY',
    'AUDIT_HMAC_KEYS', 'ALLOWED_ORIGINS', 'EMBED_SERVICE_URL', 'ANTISPOOF_SERVICE_URL',
    'ANTISPOOF_REJECT_THRESHOLD', 'VERIFICATION_ACCEPT_THRESHOLD',
    'REQUIRE_PRODUCTION_ANTISPOOF', 'TRUST_PROXY'
  ]
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
  try {
    process.env.NODE_ENV = 'production'
    process.env.VOICEPRINT_MASTER_KEY = 'production-encryption-key-with-at-least-32-characters'
    delete process.env.VOICEPRINT_MASTER_KEYS
    process.env.AUDIT_HMAC_KEY = 'production-audit-hmac-key-with-at-least-32-characters'
    delete process.env.AUDIT_HMAC_KEYS
    process.env.ALLOWED_ORIGINS = 'https://voice.example.com'
    process.env.EMBED_SERVICE_URL = 'http://127.0.0.1:8000/embed'
    process.env.ANTISPOOF_SERVICE_URL = 'http://127.0.0.1:8001/antispoof'
    process.env.ANTISPOOF_REJECT_THRESHOLD = '0.5'
    process.env.VERIFICATION_ACCEPT_THRESHOLD = '0.75'
    process.env.TRUST_PROXY = 'true'
    process.env.REQUIRE_PRODUCTION_ANTISPOOF = 'false'
    assert.throws(() => validateSecurityConfiguration(), /REQUIRE_PRODUCTION_ANTISPOOF=true/)
    process.env.REQUIRE_PRODUCTION_ANTISPOOF = 'true'
    assert.equal(validateSecurityConfiguration().valid, true)
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
})

test('high spoof risk vetoes a high speaker similarity', () => {
  const result = processVerification({ matchScore: 0.9, syntheticScore: 1 })
  assert.equal(result.verdict, 'REJECT')
  assert.equal(result.decisionSource, 'anti_spoof_veto')
  assert.equal(result.decisionCode, 'SPOOF_RISK_TOO_HIGH')
})

test('anti-spoof unavailability can never produce ACCEPT', () => {
  const result = processVerification({
    matchScore: 0.99,
    syntheticScore: null,
    antiSpoofAvailable: false
  })
  assert.equal(result.verdict, 'CHALLENGE')
  assert.equal(result.decisionCode, 'ANTI_SPOOF_UNAVAILABLE')
  assert.notEqual(result.verdict, 'ACCEPT')
})

test('anti-spoof service failure returns no fabricated probability', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vshield-antispoof-'))
  const wavPath = join(directory, 'probe.wav')
  await writeFile(wavPath, 'test audio')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('service offline')
  }

  try {
    const result = await detectSynthetic(wavPath)
    assert.equal(result.success, false)
    assert.equal(result.code, 'ANTI_SPOOF_UNAVAILABLE')
    assert.equal(result.syntheticScore, null)
    assert.equal(result.authenticityScore, null)
  } finally {
    globalThis.fetch = originalFetch
    await rm(directory, { recursive: true, force: true })
  }
})

test('production anti-spoof policy rejects a heuristic placeholder response', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vshield-placeholder-policy-'))
  const wavPath = join(directory, 'probe.wav')
  await writeFile(wavPath, 'test audio')
  const originalFetch = globalThis.fetch
  const previousPolicy = process.env.REQUIRE_PRODUCTION_ANTISPOOF
  process.env.REQUIRE_PRODUCTION_ANTISPOOF = 'true'
  globalThis.fetch = async () => new Response(JSON.stringify({
    spoofScore: 0.01,
    decision: 'bona_fide',
    modelVersion: 'spectral-heuristic-placeholder-v1'
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  try {
    const result = await detectSynthetic(wavPath)
    assert.equal(result.success, false)
    assert.equal(result.code, 'ANTI_SPOOF_UNAVAILABLE')
    assert.equal(result.syntheticScore, null)
  } finally {
    globalThis.fetch = originalFetch
    if (previousPolicy === undefined) delete process.env.REQUIRE_PRODUCTION_ANTISPOOF
    else process.env.REQUIRE_PRODUCTION_ANTISPOOF = previousPolicy
    await rm(directory, { recursive: true, force: true })
  }
})

test('high similarity with low spoof risk is accepted', () => {
  const result = processVerification({ matchScore: 0.95, syntheticScore: 0.05 })
  assert.equal(result.verdict, 'ACCEPT')
})

test('low speaker similarity is rejected', () => {
  const result = processVerification({ matchScore: 0.4, syntheticScore: 0.05 })
  assert.equal(result.verdict, 'REJECT')
  assert.equal(result.decisionSource, 'match_override_reject')
})

const runTrackedTemporaryFile = async ({ shouldFail }) => {
  const directory = await mkdtemp(join(tmpdir(), 'vshield-cleanup-'))
  const wavPath = join(directory, 'temporary.wav')
  const tracker = createTemporaryFileTracker()
  tracker.add(wavPath)
  await writeFile(wavPath, 'plaintext audio')

  try {
    if (shouldFail) {
      throw new Error('simulated processing failure')
    }
  } catch (error) {
    assert.equal(error.message, 'simulated processing failure')
  } finally {
    await tracker.cleanup()
  }

  await assert.rejects(access(wavPath), error => error.code === 'ENOENT')
  await rm(directory, { recursive: true, force: true })
}

test('temporary WAV files are deleted after successful processing', async () => {
  await runTrackedTemporaryFile({ shouldFail: false })
})

test('temporary WAV files are deleted after failed processing', async () => {
  await runTrackedTemporaryFile({ shouldFail: true })
})

test('a user cannot resolve or read another user encrypted recording', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vshield-storage-'))
  const ownerId = 'owner-user'
  const attackerId = 'attacker-user'
  const voiceprintId = 'voiceprint-123'
  const encryptedFileName = 'recording.encrypted'
  const filePath = getLocalEncryptedAudioPath({
    userId: ownerId,
    voiceprintId,
    fileName: encryptedFileName,
    root
  })
  await mkdir(join(root, 'users', ownerId, 'voiceprints', voiceprintId), { recursive: true })
  await writeFile(filePath, '{"encrypted":true}')

  const options = {
    storagePath: createLocalAudioReference(voiceprintId),
    requestUserId: attackerId,
    voiceprintId,
    voiceprintData: {
      userId: ownerId,
      enrollmentMeta: { encryptedFileName }
    },
    root
  }

  await assert.rejects(
    readOwnedLocalAudio(options),
    error => error.code === 'LOCAL_AUDIO_ACCESS_DENIED'
  )
  await rm(root, { recursive: true, force: true })
})

test('encrypted audio writes are atomic and leave no plaintext temporary file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vshield-atomic-storage-'))
  const filePath = getLocalEncryptedAudioPath({
    userId: 'owner-user',
    voiceprintId: 'voiceprint-atomic',
    fileName: 'recording.encrypted',
    root
  })
  await writeEncryptedAudioFile(filePath, '{"data":"ciphertext"}')
  const stored = await readOwnedLocalAudio({
    storagePath: createLocalAudioReference('voiceprint-atomic'),
    requestUserId: 'owner-user',
    voiceprintId: 'voiceprint-atomic',
    voiceprintData: {
      userId: 'owner-user',
      enrollmentMeta: { encryptedFileName: 'recording.encrypted' }
    },
    root
  })
  assert.equal(stored.buffer.toString('utf8'), '{"data":"ciphertext"}')
  await rm(root, { recursive: true, force: true })
})
