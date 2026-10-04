/**
 * Anti-Spoof / Deepfake Detection Service
 * 
 * This module is only an adapter for an external anti-spoof service. It does
 * not contain or claim to implement a production anti-spoof model.
 * 
 * TODO: Integrate actual anti-spoof model (ASVspoof baseline or custom trained model)
 */

import { logger } from '../utils/logger.js'
import { readFile } from 'fs/promises'

const ANTISPOOF_SERVICE_URL = process.env.ANTISPOOF_SERVICE_URL || 'http://localhost:8001/antispoof'
const ANTISPOOF_SERVICE_TIMEOUT_MS = parseInt(process.env.ANTISPOOF_SERVICE_TIMEOUT_MS || '15000', 10)

/**
 * Detect if audio is synthetic/deepfake
 * @param {string} audioFilePath - Path to processed audio file
 * @returns {Promise<Object>} - Anti-spoof detection result
 */
export const detectSynthetic = async (audioFilePath) => {
  try {
    logger.info('Running anti-spoof detection on:', audioFilePath)

    const audioBuffer = await readFile(audioFilePath)
    const audioBase64 = audioBuffer.toString('base64')

    const controller = new AbortController()
    const requestStarted = Date.now()
    const timeout = setTimeout(() => controller.abort(), ANTISPOOF_SERVICE_TIMEOUT_MS)

    let response
    try {
      response = await fetch(ANTISPOOF_SERVICE_URL, {
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
      throw new Error(`Anti-spoof service error: ${response.status} ${message}`)
    }

    const data = await response.json()

    if (
      typeof data.spoofScore !== 'number' ||
      !Number.isFinite(data.spoofScore) ||
      data.spoofScore < 0 ||
      data.spoofScore > 1
    ) {
      throw new Error('Anti-spoof service returned invalid payload.')
    }

    const syntheticScore = data.spoofScore
    const authenticityScore = 1 - syntheticScore
    const latencyMs = data.latencyMs ?? null
    const modelVersion = data.modelVersion || 'unknown'
    const decision = data.decision || (syntheticScore < 0.5 ? 'bona_fide' : 'spoof')

    const placeholderModel = /placeholder|heuristic/i.test(modelVersion)
    if (process.env.REQUIRE_PRODUCTION_ANTISPOOF === 'true' && placeholderModel) {
      throw new Error('Configured anti-spoof service is a placeholder model')
    }

    return {
      success: true,
      syntheticScore,
      authenticityScore,
      confidence: data.confidence ?? null,
      model: modelVersion,
      verdict: decision === 'spoof' ? 'synthetic' : 'authentic',
      metadata: {
        detectedAt: new Date().toISOString(),
        modelVersion,
        productionReady: !placeholderModel,
        decision,
        serviceLatencyMs: latencyMs,
        transportLatencyMs
      }
    }
  } catch (error) {
    const isAbort = error.name === 'AbortError'
    logger.error('Anti-spoof detection error:', error.message)
    return {
      success: false,
      code: 'ANTI_SPOOF_UNAVAILABLE',
      error: 'Anti-spoof service unavailable',
      syntheticScore: null,
      authenticityScore: null,
      metadata: {
        detectedAt: new Date().toISOString(),
        aborted: isAbort
      }
    }
  }
}

/**
 * Get anti-spoof model information
 * @returns {Object} - Model metadata
 */
export const getModelInfo = () => {
  return {
    model: 'external-service',
    version: 'not-bundled',
    type: 'adapter',
    description: 'External anti-spoof service adapter; no production model is bundled.',
    features: [
      'spectral_features',
      'phase_features',
      'high_frequency_artifacts'
    ],
    trainingData: 'not applicable (external service adapter)'
  }
}

export default {
  detectSynthetic,
  getModelInfo
}
