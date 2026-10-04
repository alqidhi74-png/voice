/**
 * Feature Extraction Service
 * 
 * This is a placeholder service that will be replaced with X-Vector/ECAPA-TDNN integration.
 * Currently returns placeholder embeddings for testing.
 * 
 * TODO: Integrate actual ML model (Python microservice or Node.js ML library)
 */

import { logger } from '../utils/logger.js'
import { readFile } from 'fs/promises'

const EMBED_SERVICE_URL = process.env.EMBED_SERVICE_URL || 'http://localhost:8000/embed'
const EMBED_SERVICE_TIMEOUT_MS = parseInt(process.env.EMBED_SERVICE_TIMEOUT_MS || '15000', 10)

// Placeholder embedding dimensions (ECAPA-TDNN typically produces 192-dim vectors)
const EMBEDDING_DIMENSION = 192

/**
 * Extract voice embedding from processed audio file
 * @param {string} audioFilePath - Path to processed audio file (16kHz WAV)
 * @returns {Promise<Object>} - Embedding vector and metadata
 */
export const extractEmbedding = async (audioFilePath) => {
  try {
    logger.info('Extracting features from audio:', audioFilePath)

    const audioBuffer = await readFile(audioFilePath)
    const audioBase64 = audioBuffer.toString('base64')

    const controller = new AbortController()
    const requestStarted = Date.now()
    const timeout = setTimeout(() => controller.abort(), EMBED_SERVICE_TIMEOUT_MS)

    let response
    try {
      response = await fetch(EMBED_SERVICE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_base64: audioBase64,
          sample_rate: 16000
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }

    const transportLatencyMs = Date.now() - requestStarted

    if (!response.ok) {
      const message = await response.text()
      throw new Error(`Embedding service error: ${response.status} ${message}`)
    }

    const data = await response.json()

    if (!Array.isArray(data.embedding)) {
      throw new Error('Embedding service returned invalid payload.')
    }

    const featureNames = Array.isArray(data.featureNames) ? data.featureNames : []
    const featureVector = Array.isArray(data.featureVector) ? data.featureVector : []
    const featureMap = (data.features && typeof data.features === 'object') ? data.features : null

    return {
      success: true,
      embedding: data.embedding,
      dimension: data.embedding.length,
      model: data.modelVersion || 'unknown',
      features: featureMap,
      featureNames,
      featureVector,
      metadata: {
        audioPath: audioFilePath,
        extractedAt: new Date().toISOString(),
        modelVersion: data.modelVersion || 'unknown',
        serviceLatencyMs: data.latencyMs ?? null,
        transportLatencyMs
      }
    }
  } catch (error) {
    const isAbort = error.name === 'AbortError'
    logger.error('Feature extraction error:', error.message)
    return {
      success: false,
      error: error.message,
      embedding: null,
      metadata: {
        audioPath: audioFilePath,
        extractedAt: new Date().toISOString(),
        aborted: isAbort
      }
    }
  }
}

/**
 * Create canonical voiceprint from multiple embeddings
 * @param {Array<Array<number>>} embeddings - Array of embedding vectors
 * @returns {Object} - Canonical voiceprint (averaged embedding)
 */
export const createCanonicalVoiceprint = (embeddings) => {
  if (!embeddings || embeddings.length === 0) {
    throw new Error('No embeddings provided')
  }

  const dimension = embeddings[0].length
  const canonicalEmbedding = new Array(dimension).fill(0)

  // Average all embeddings
  for (const embedding of embeddings) {
    if (embedding.length !== dimension) {
      throw new Error('Embeddings must have the same dimension')
    }
    for (let i = 0; i < dimension; i++) {
      canonicalEmbedding[i] += embedding[i]
    }
  }

  // Divide by count to get average
  for (let i = 0; i < dimension; i++) {
    canonicalEmbedding[i] /= embeddings.length
  }

  return {
    embedding: canonicalEmbedding,
    dimension,
    centroidsCount: embeddings.length,
    createdAt: new Date().toISOString()
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * @param {Array<number>} embedding1 - First embedding vector
 * @param {Array<number>} embedding2 - Second embedding vector
 * @returns {number} - Cosine similarity (0-1)
 */
export const calculateCosineSimilarity = (embedding1, embedding2) => {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimension')
  }

  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i]
    norm1 += embedding1[i] * embedding1[i]
    norm2 += embedding2[i] * embedding2[i]
  }

  const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  
  // Normalize to 0-1 range
  return Math.max(0, Math.min(1, (similarity + 1) / 2))
}

/**
 * Extract features from audio file (wrapper for future ML integration)
 * @param {string} audioFilePath - Path to audio file
 * @returns {Promise<Object>} - Feature extraction result
 */
export const extractFeatures = async (audioFilePath) => {
  return await extractEmbedding(audioFilePath)
}

export default {
  extractEmbedding,
  extractFeatures,
  createCanonicalVoiceprint,
  calculateCosineSimilarity,
  EMBEDDING_DIMENSION
}

