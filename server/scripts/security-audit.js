import dotenv from 'dotenv'
import { readFile, readdir } from 'fs/promises'
import { join, resolve } from 'path'

dotenv.config()

const serverRoot = resolve(process.cwd())
const uploadRoot = resolve(process.env.UPLOAD_DIR || join(serverRoot, 'uploads'))
const encryptedRoot = resolve(process.env.LOCAL_ENCRYPTED_AUDIO_ROOT || join(serverRoot, 'data', 'encrypted-audio'))

const walk = async directory => {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const nested = await Promise.all(entries.map(entry => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    }))
    return nested.flat()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

const issues = []
const uploads = await walk(uploadRoot)
if (uploads.length) issues.push({ code: 'PLAINTEXT_UPLOADS_PRESENT', count: uploads.length })

const encryptedFiles = await walk(encryptedRoot)
for (const filePath of encryptedFiles) {
  if (!filePath.endsWith('.encrypted')) {
    issues.push({ code: 'UNEXPECTED_ENCRYPTED_STORAGE_FILE', file: filePath.slice(encryptedRoot.length + 1) })
    continue
  }
  const buffer = await readFile(filePath)
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
    issues.push({ code: 'PLAINTEXT_WAV_IN_ENCRYPTED_STORAGE', file: filePath.slice(encryptedRoot.length + 1) })
    continue
  }
  try {
    const payload = JSON.parse(buffer.toString('utf8'))
    if (payload.algorithm !== 'aes-256-gcm' || !payload.iv || !payload.tag || !payload.data) {
      issues.push({ code: 'INVALID_ENCRYPTED_AUDIO_ENVELOPE', file: filePath.slice(encryptedRoot.length + 1) })
    }
  } catch {
    issues.push({ code: 'INVALID_ENCRYPTED_AUDIO_JSON', file: filePath.slice(encryptedRoot.length + 1) })
  }
}

const report = {
  success: issues.length === 0,
  checkedAt: new Date().toISOString(),
  uploads: uploads.length,
  encryptedFiles: encryptedFiles.length,
  issues
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (issues.length) process.exitCode = 1
