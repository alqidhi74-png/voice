import dotenv from 'dotenv'
import { access, readFile, readdir, stat } from 'fs/promises'
import { basename, join, resolve } from 'path'
import { performance } from 'perf_hooks'
import { deleteOwnedLocalAudio } from '../src/services/localAudioStorage.js'

dotenv.config({ path: new URL('../.env', import.meta.url) })

const API = process.env.E2E_API || 'http://127.0.0.1:3001/api'
const DOWN_API = process.env.E2E_DOWN_API || 'http://127.0.0.1:3002/api'
const CLIENT = process.env.E2E_CLIENT || 'http://127.0.0.1:5174/'
const LOW_AUDIO = process.env.E2E_LOW_AUDIO
const HIGH_AUDIO = process.env.E2E_HIGH_AUDIO

if (!LOW_AUDIO || !HIGH_AUDIO) throw new Error('E2E_LOW_AUDIO and E2E_HIGH_AUDIO are required')

const results = []
const testUsers = []
const createdVoiceprints = []
let db
let auth

const record = (name, pass, durationMs, details = {}) => {
  results.push({ name, status: pass ? 'PASS' : 'FAIL', durationMs: Math.round(durationMs), ...details })
}

const timed = async (name, fn) => {
  const start = performance.now()
  try {
    const value = await fn()
    record(name, true, performance.now() - start, value?.details || {})
    return value
  } catch (error) {
    record(name, false, performance.now() - start, { error: error.message })
    throw error
  }
}

const timedContinue = async (name, fn) => {
  try {
    return await timed(name, fn)
  } catch {
    return null
  }
}

const request = async (url, options = {}) => {
  const response = await fetch(url, options)
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : Buffer.from(await response.arrayBuffer())
  return { response, body }
}

const jsonRequest = (url, method, body, token) => request(url, {
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  },
  body: body === undefined ? undefined : JSON.stringify(body)
})

const audioRequest = async (baseUrl, route, audioPath, token, fields = {}) => {
  const bytes = await readFile(audioPath)
  const form = new FormData()
  form.append('audio', new Blob([bytes], { type: 'audio/wav' }), basename(audioPath))
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return request(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  })
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const encodePath = value => value.split('/').map(encodeURIComponent).join('/')

const containsPhysicalPath = value => {
  const visit = current => {
    if (typeof current === 'string') {
      return /[A-Za-z]:[\\/]/.test(current) ||
        current.includes('server/uploads') ||
        current.includes('server\\uploads') ||
        current.includes('data/encrypted-audio/users')
    }
    if (Array.isArray(current)) return current.some(visit)
    if (current && typeof current === 'object') return Object.values(current).some(visit)
    return false
  }
  return visit(value)
}

const listFiles = async directory => {
  const found = []
  const walk = async current => {
    let entries = []
    try { entries = await readdir(current, { withFileTypes: true }) } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) await walk(fullPath)
      else if (entry.isFile()) found.push(fullPath)
    }
  }
  await walk(directory)
  return found
}

const register = async suffix => {
  const email = `vshield-e2e-${Date.now()}-${suffix}@example.com`
  const password = `E2E-Voice-${suffix}-7!Aa`
  const response = await jsonRequest(`${API}/auth/register`, 'POST', {
    email,
    password,
    displayName: `VShield E2E ${suffix}`,
    age: 25,
    country: 'AE'
  })
  assert(response.response.status === 201 && response.body.success, `Registration failed: ${JSON.stringify(response.body)}`)
  const uid = response.body.data.user.uid
  testUsers.push({ uid, email, password })
  return { uid, email, password, registrationToken: response.body.data.idToken }
}

const markVerified = async user => {
  await auth.updateUser(user.uid, { emailVerified: true })
  await db.collection('users').doc(user.uid).set({ emailVerified: true }, { merge: true })
}

const login = async user => {
  const response = await jsonRequest(`${API}/auth/login`, 'POST', {
    email: user.email,
    password: user.password
  })
  assert(response.response.ok && response.body.success, `Login failed: ${JSON.stringify(response.body)}`)
  assert(response.body.data.user.emailVerified === true, 'Login did not report a verified email')
  return response.body.data.idToken
}

const enroll = async (user, token, audioPath, label) => {
  const response = await audioRequest(API, '/enroll', audioPath, token, { name: label })
  assert(response.response.ok && response.body.success, `Enrollment failed: ${JSON.stringify(response.body)}`)
  const data = response.body.data
  assert(data.embeddingDimension === 192, `Expected ECAPA dimension 192, received ${data.embeddingDimension}`)
  assert(data.audioStoragePath === `local/voiceprints/${data.voiceprintId}/audio`, 'Enrollment returned a non-logical storage path')
  assert(!containsPhysicalPath(response.body), 'Enrollment response leaked a filesystem path')
  createdVoiceprints.push({ user, voiceprintId: data.voiceprintId, storagePath: data.audioStoragePath })
  return data
}

const verify = async (baseUrl, token, audioPath) => audioRequest(baseUrl, '/verify', audioPath, token)

const deleteQuery = async (collection, uid) => {
  const snapshot = await db.collection(collection).where('userId', '==', uid).get()
  for (const document of snapshot.docs) await document.ref.delete()
}

const cleanup = async () => {
  for (const item of createdVoiceprints) {
    try {
      const document = await db.collection('voiceprints').doc(item.voiceprintId).get()
      if (document.exists) {
        const data = document.data()
        await deleteOwnedLocalAudio({
          storagePath: data.audioStoragePath,
          requestUserId: item.user.uid,
          voiceprintId: item.voiceprintId,
          voiceprintData: data
        })
      }
    } catch {}
  }

  for (const user of testUsers) {
    for (const collection of ['voiceprints', 'enrollments', 'audit_events']) {
      try { await deleteQuery(collection, user.uid) } catch {}
    }
    try { await db.collection('users').doc(user.uid).delete() } catch {}
    try { await auth.deleteUser(user.uid) } catch {}
  }
}

try {
  const firebase = await import('../src/config/firebase.js')
  firebase.initializeFirebase()
  db = firebase.getFirestore()
  auth = firebase.getAuth()

  await timed('Service health: client, backend, embedding, anti-spoof', async () => {
    const [client, backend, embed, anti] = await Promise.all([
      fetch(CLIENT),
      fetch(`${API}/health/ready`),
      fetch('http://127.0.0.1:8000/health'),
      fetch('http://127.0.0.1:8001/health')
    ])
    assert(client.ok && backend.ok && embed.ok && anti.ok, 'At least one service health check failed')
    const embedBody = await embed.json()
    const antiBody = await anti.json()
    assert(embedBody.modelVersion === 'speechbrain-ecapa-voxceleb', 'ECAPA service model mismatch')
    assert(antiBody.modelVersion === 'spectral-heuristic-placeholder-v1', 'Anti-spoof service is not clearly labelled as placeholder')
    return { details: { embeddingModel: embedBody.modelVersion, antiSpoofModel: antiBody.modelVersion } }
  })

  const userA = await timed('Register user A', () => register('A'))

  await timed('Unverified email gate', async () => {
    const response = await audioRequest(API, '/enroll', LOW_AUDIO, userA.registrationToken, { name: 'blocked' })
    assert(response.response.status === 403, `Expected 403, received ${response.response.status}`)
  })

  await timed('Mark email verified', () => markVerified(userA))
  const tokenA = await timed('Login verified user A', () => login(userA))

  const lowEnrollment = await timed('Enroll low-spoof voice with ECAPA and local encryption', () =>
    enroll(userA, tokenA, LOW_AUDIO, 'E2E low spoof'))

  await timed('Uploads empty after enrollment success', async () => {
    const files = await listFiles(resolve('uploads'))
    assert(files.length === 0, `Found plaintext uploads: ${files.join(', ')}`)
  })

  const lowVerification = await timed('High similarity + low spoof => ACCEPT', async () => {
    const response = await verify(API, tokenA, LOW_AUDIO)
    assert(response.response.ok && response.body.success, `Verification failed: ${JSON.stringify(response.body)}`)
    assert(response.body.data.decision === 'ACCEPT', `Expected ACCEPT, received ${response.body.data.decision}`)
    assert(response.body.data.matchScore >= 0.85, `Similarity was not high: ${response.body.data.matchScore}`)
    assert(response.body.data.syntheticScore < 0.5, `Spoof score was not low: ${response.body.data.syntheticScore}`)
    assert(response.body.data.embeddingModelVersion === 'speechbrain-ecapa-voxceleb', 'Verification did not use ECAPA')
    assert(!containsPhysicalPath(response.body), 'Verification response leaked a filesystem path')
    return { details: {
      decision: response.body.data.decision,
      matchScore: response.body.data.matchScore,
      spoofScore: response.body.data.syntheticScore,
      finalScore: response.body.data.finalScore
    } }
  })

  const highEnrollment = await timed('Enroll high-spoof probe for veto test', () =>
    enroll(userA, tokenA, HIGH_AUDIO, 'E2E high spoof'))

  await timed('High similarity + high spoof => REJECT', async () => {
    const response = await verify(API, tokenA, HIGH_AUDIO)
    assert(response.response.ok && response.body.success, `Verification failed: ${JSON.stringify(response.body)}`)
    assert(response.body.data.decision === 'REJECT', `Expected REJECT, received ${response.body.data.decision}`)
    assert(response.body.data.matchScore >= 0.85, `Similarity was not high: ${response.body.data.matchScore}`)
    assert(response.body.data.syntheticScore >= 0.5, `Spoof score was not high: ${response.body.data.syntheticScore}`)
    assert(response.body.data.decisionSource === 'anti_spoof_veto', 'Anti-spoof veto was not the decision source')
    return { details: {
      decision: response.body.data.decision,
      matchScore: response.body.data.matchScore,
      spoofScore: response.body.data.syntheticScore,
      finalScore: response.body.data.finalScore
    } }
  })

  await timed('Anti-spoof unavailable => 503 / CHALLENGE', async () => {
    const response = await verify(DOWN_API, tokenA, HIGH_AUDIO)
    assert(response.response.status === 503, `Expected 503, received ${response.response.status}`)
    assert(response.body.code === 'ANTI_SPOOF_UNAVAILABLE', `Unexpected code: ${response.body.code}`)
    assert(response.body.data?.decision === 'CHALLENGE', `Expected CHALLENGE, received ${response.body.data?.decision}`)
    assert(response.body.data?.decision !== 'ACCEPT', 'Unavailable anti-spoof produced ACCEPT')
  })

  await timed('Uploads empty after verification success and dependency failure', async () => {
    const files = await listFiles(resolve('uploads'))
    assert(files.length === 0, `Found plaintext uploads: ${files.join(', ')}`)
  })

  await timedContinue('Verification history endpoint', async () => {
    const response = await request(`${API}/verify/history?limit=20`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    })
    assert(response.response.ok && response.body.success, `History failed: ${JSON.stringify(response.body)}`)
    const decisions = response.body.data.events.map(event => event.decision)
    assert(decisions.includes('ACCEPT') && decisions.includes('REJECT') && decisions.includes('CHALLENGE'), `Missing decisions in history: ${decisions.join(',')}`)
    assert(!containsPhysicalPath(response.body), 'History response leaked a filesystem path')
    return { details: { eventCount: response.body.data.events.length, decisions } }
  })

  await timed('Audit events written to Firestore', async () => {
    const snapshot = await db.collection('audit_events').where('userId', '==', userA.uid).get()
    const events = snapshot.docs.map(document => document.data())
    const decisions = events.map(event => event.decision).filter(Boolean)
    assert(decisions.includes('ACCEPT') && decisions.includes('REJECT') && decisions.includes('CHALLENGE'), `Missing audit decisions: ${decisions.join(',')}`)
    return { details: { eventCount: events.length, decisions } }
  })

  const userB = await timed('Register, verify, and login user B', async () => {
    const user = await register('B')
    await markVerified(user)
    return { ...user, token: await login(user) }
  })
  const enrollmentB = await timed('Enroll user B voice', () =>
    enroll(userB, userB.token, LOW_AUDIO, 'E2E user B'))

  await timed('User A cannot read user B recording', async () => {
    const response = await request(`${API}/storage/download/${encodePath(enrollmentB.audioStoragePath)}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    })
    assert(response.response.status === 403, `Expected 403, received ${response.response.status}`)
  })

  await timed('User A cannot delete user B recording', async () => {
    const response = await request(`${API}/storage/delete/${encodePath(enrollmentB.audioStoragePath)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    })
    assert(response.response.status === 403, `Expected 403, received ${response.response.status}`)
  })

  await timed('Authenticated playback decrypts local recording', async () => {
    const response = await request(`${API}/storage/download/${encodePath(enrollmentB.audioStoragePath)}`, {
      headers: { Authorization: `Bearer ${userB.token}` }
    })
    assert(response.response.ok, `Playback download failed with ${response.response.status}`)
    assert(response.response.headers.get('content-type')?.startsWith('audio/'), 'Playback response is not audio')
    assert(Buffer.isBuffer(response.body) && response.body.subarray(0, 4).toString('ascii') === 'RIFF', 'Playback did not return a decrypted WAV')
    return { details: { bytes: response.body.length, contentType: response.response.headers.get('content-type') } }
  })

  await timed('Firestore contains encrypted biometric data only', async () => {
    for (const item of createdVoiceprints) {
      const document = await db.collection('voiceprints').doc(item.voiceprintId).get()
      assert(document.exists, `Voiceprint ${item.voiceprintId} was not created`)
      const data = document.data()
      assert(data.userId === item.user.uid, 'Voiceprint owner mismatch')
      assert(data.encryptedEmbedding?.iv && data.encryptedEmbedding?.tag && data.encryptedEmbedding?.data, 'Embedding is not encrypted')
      assert(data.encryptedFeatureVector?.iv && data.encryptedFeatureVector?.tag && data.encryptedFeatureVector?.data, 'Feature vector is not encrypted')
      assert(!('voice' in data) && !('audio' in data) && !('waveform' in data), 'Plaintext voice/audio field found')
      assert(!data.enrollmentMeta?.processedFilePath, 'Temporary filesystem path stored in Firestore')
      assert(data.audioStoragePath.startsWith('local/voiceprints/'), 'Firestore exposes a physical audio path')
    }
  })

  await timed('Encrypted storage contains ciphertext files only', async () => {
    const files = await listFiles(resolve('data', 'encrypted-audio'))
    assert(files.length > 0, 'No encrypted audio files found')
    for (const file of files) {
      assert(file.endsWith('.encrypted'), `Unexpected file in encrypted storage: ${file}`)
      const payload = JSON.parse(await readFile(file, 'utf8'))
      assert(payload.algorithm === 'aes-256-gcm' && payload.iv && payload.tag && payload.data, `Invalid encrypted payload: ${file}`)
      const prefix = Buffer.from(payload.data, 'base64').subarray(0, 4).toString('ascii')
      assert(prefix !== 'RIFF', `Plain WAV payload found in ${file}`)
    }
    return { details: { encryptedFileCount: files.length } }
  })

  await timed('Delete removes local encrypted recording and Firestore record', async () => {
    const before = await db.collection('voiceprints').doc(enrollmentB.voiceprintId).get()
    const encryptedFileName = before.data().enrollmentMeta.encryptedFileName
    const physicalFile = resolve('data', 'encrypted-audio', 'users', userB.uid, 'voiceprints', enrollmentB.voiceprintId, encryptedFileName)
    await access(physicalFile)
    const response = await jsonRequest(`${API}/user/voiceprint`, 'DELETE', { voiceprintId: enrollmentB.voiceprintId }, userB.token)
    assert(response.response.ok && response.body.success, `Delete failed: ${JSON.stringify(response.body)}`)
    await assertMissing(physicalFile)
    const after = await db.collection('voiceprints').doc(enrollmentB.voiceprintId).get()
    assert(!after.exists, 'Voiceprint Firestore record still exists after delete')
  })

  for (const enrollment of [lowEnrollment, highEnrollment]) {
    await jsonRequest(`${API}/user/voiceprint`, 'DELETE', { voiceprintId: enrollment.voiceprintId }, tokenA)
  }

  await timed('Final uploads directory is empty', async () => {
    const files = await listFiles(resolve('uploads'))
    assert(files.length === 0, `Found leftover plaintext files: ${files.join(', ')}`)
  })
} catch (error) {
  // Failure is represented in the per-step report; cleanup still runs.
} finally {
  const cleanupStart = performance.now()
  try {
    if (db && auth) await cleanup()
    record('Cleanup isolated E2E users and Firestore fixtures', true, performance.now() - cleanupStart)
  } catch (error) {
    record('Cleanup isolated E2E users and Firestore fixtures', false, performance.now() - cleanupStart, { error: error.message })
  }
  process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`)
  if (results.some(result => result.status === 'FAIL')) process.exitCode = 1
}

async function assertMissing(path) {
  try {
    await access(path)
    throw new Error(`File still exists: ${path}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
