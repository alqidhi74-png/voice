/**
 * Score Fusion & Policy Decision Engine
 * Combines match score and anti-spoof score to make final decision
 */

import { logger } from '../utils/logger.js'

// Default weights for score fusion
const DEFAULT_WEIGHTS = {
  match: 0.7,      // Weight for voice match score
  auth: 0.3        // Weight for authenticity (1 - synthetic_score)
}

// Decision thresholds (as per Technical Plan)
const configuredSpoofRejectThreshold = Number.parseFloat(
  process.env.ANTISPOOF_REJECT_THRESHOLD || '0.5'
)
const spoofRejectThreshold = Number.isFinite(configuredSpoofRejectThreshold) &&
  configuredSpoofRejectThreshold >= 0 &&
  configuredSpoofRejectThreshold <= 1
  ? configuredSpoofRejectThreshold
  : 0.5

const THRESHOLDS = {
  ACCEPT: 0.85,    // final_score >= 0.85 → ACCEPT
  CHALLENGE: 0.7,  // 0.7 <= final_score < 0.85 → CHALLENGE
  REJECT: 0.7,     // final_score < 0.7 → REJECT
  SPOOF_REJECT: spoofRejectThreshold // mandatory anti-spoof veto threshold
}

const MATCH_ACCEPT_THRESHOLD = 0.85
const MATCH_REJECT_THRESHOLD = 0.6

/**
 * Fuse match score and anti-spoof score
 * @param {number} matchScore - Voice match score (0-1)
 * @param {number} syntheticScore - Synthetic/deepfake score (0-1, higher = more synthetic)
 * @param {Object} weights - Optional custom weights
 * @returns {number} - Final fused score (0-1)
 */
export const fuseScores = (matchScore, syntheticScore, weights = DEFAULT_WEIGHTS) => {
  // Validate inputs
  if (matchScore < 0 || matchScore > 1) {
    throw new Error('matchScore must be between 0 and 1')
  }
  if (syntheticScore < 0 || syntheticScore > 1) {
    throw new Error('syntheticScore must be between 0 and 1')
  }

  // Calculate authenticity score (inverse of synthetic score)
  const authenticityScore = 1 - syntheticScore

  // Fuse scores: final_score = w_match * match_score + w_auth * (1 - synthetic_score)
  const finalScore = (weights.match * matchScore) + (weights.auth * authenticityScore)

  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, finalScore))
}

/**
 * Make decision based on final score
 * @param {number} finalScore - Fused final score (0-1)
 * @param {Object} customThresholds - Optional custom thresholds
 * @returns {Object} - Decision object with verdict and risk level
 */
export const makeDecision = (finalScore, customThresholds = THRESHOLDS) => {
  const thresholds = { ...THRESHOLDS, ...customThresholds }

  let verdict
  let riskLevel
  let confidence

  if (finalScore >= thresholds.ACCEPT) {
    verdict = 'ACCEPT'
    riskLevel = 'low'
    confidence = 'high'
  } else if (finalScore >= thresholds.CHALLENGE) {
    verdict = 'CHALLENGE'
    riskLevel = 'medium'
    confidence = 'medium'
  } else {
    verdict = 'REJECT'
    riskLevel = 'high'
    confidence = 'high'
  }

  return {
    verdict,
    riskLevel,
    confidence,
    finalScore,
    thresholds: {
      accept: thresholds.ACCEPT,
      challenge: thresholds.CHALLENGE,
      reject: thresholds.REJECT
    }
  }
}

/**
 * Calculate risk score (0-100)
 * @param {number} finalScore - Final fused score
 * @returns {number} - Risk score (0 = no risk, 100 = high risk)
 */
export const calculateRiskScore = (finalScore) => {
  // Risk is inverse of final score
  return Math.round((1 - finalScore) * 100)
}

/**
 * Process verification scores and make decision
 * @param {Object} scores - Score object
 * @param {number} scores.matchScore - Voice match score
 * @param {number} scores.syntheticScore - Synthetic/deepfake score
 * @param {Object} options - Optional configuration
 * @returns {Object} - Complete verification result
 */
export const processVerification = (scores, options = {}) => {
  const {
    matchScore,
    syntheticScore,
    antiSpoofAvailable = Number.isFinite(syntheticScore)
  } = scores

  const {
    weights = DEFAULT_WEIGHTS,
    thresholds: customThresholds = THRESHOLDS
  } = options
  const thresholds = { ...THRESHOLDS, ...customThresholds }

  try {
    if (!antiSpoofAvailable || !Number.isFinite(syntheticScore)) {
      return {
        matchScore,
        syntheticScore: null,
        authenticityScore: null,
        finalScore: null,
        verdict: 'CHALLENGE',
        decisionCode: 'ANTI_SPOOF_UNAVAILABLE',
        decisionSource: 'anti_spoof_unavailable',
        riskLevel: 'unknown',
        riskScore: null,
        confidence: 'low',
        thresholds: {
          accept: thresholds.ACCEPT,
          challenge: thresholds.CHALLENGE,
          reject: thresholds.REJECT,
          spoofReject: thresholds.SPOOF_REJECT
        },
        timestamp: new Date().toISOString()
      }
    }

    // Fuse scores
    const finalScore = fuseScores(matchScore, syntheticScore, weights)

    // Mandatory anti-spoof gate: speaker similarity can never override it.
    if (syntheticScore >= thresholds.SPOOF_REJECT) {
      const riskScore = Math.max(
        calculateRiskScore(finalScore),
        Math.round(syntheticScore * 100)
      )
      const result = {
        matchScore,
        syntheticScore,
        authenticityScore: 1 - syntheticScore,
        finalScore,
        verdict: 'REJECT',
        decisionCode: 'SPOOF_RISK_TOO_HIGH',
        decisionSource: 'anti_spoof_veto',
        riskLevel: 'high',
        riskScore,
        confidence: 'high',
        thresholds: {
          accept: thresholds.ACCEPT,
          challenge: thresholds.CHALLENGE,
          reject: thresholds.REJECT,
          spoofReject: thresholds.SPOOF_REJECT
        },
        timestamp: new Date().toISOString()
      }

      logger.info('Verification rejected by anti-spoof veto:', {
        matchScore: matchScore.toFixed(3),
        syntheticScore: syntheticScore.toFixed(3),
        spoofRejectThreshold: thresholds.SPOOF_REJECT
      })

      return result
    }

    // Make decision
    const decision = makeDecision(finalScore, thresholds)

    // Calculate risk score
    const riskScore = calculateRiskScore(finalScore)

    // Build result
    let result = {
      matchScore,
      syntheticScore,
      authenticityScore: 1 - syntheticScore,
      finalScore,
      verdict: decision.verdict,
      riskLevel: decision.riskLevel,
      riskScore,
      confidence: decision.confidence,
      thresholds: decision.thresholds,
      timestamp: new Date().toISOString()
    }

    if (typeof matchScore === 'number') {
      if (matchScore < MATCH_REJECT_THRESHOLD) {
        const overriddenScore = Math.min(finalScore, matchScore)
        result = {
          ...result,
          finalScore: overriddenScore,
          verdict: 'REJECT',
          riskLevel: 'high',
          riskScore: calculateRiskScore(overriddenScore),
          confidence: 'medium',
          thresholds: {
            ...result.thresholds,
            matchAccept: MATCH_ACCEPT_THRESHOLD,
            matchReject: MATCH_REJECT_THRESHOLD
          },
          decisionSource: 'match_override_reject'
        }
      } else {
        result.thresholds = {
          ...result.thresholds,
          spoofReject: thresholds.SPOOF_REJECT,
          matchAccept: MATCH_ACCEPT_THRESHOLD,
          matchReject: MATCH_REJECT_THRESHOLD
        }
      }
    }

    logger.info('Verification processed:', {
      verdict: result.verdict,
      finalScore: result.finalScore.toFixed(3),
      matchScore: result.matchScore.toFixed(3),
      syntheticScore: result.syntheticScore.toFixed(3)
    })

    return result
  } catch (error) {
    logger.error('Score fusion error:', error.message)
    throw error
  }
}

/**
 * Get recommended action based on decision
 * @param {string} verdict - Decision verdict (ACCEPT, CHALLENGE, REJECT)
 * @returns {Object} - Recommended action
 */
export const getRecommendedAction = (verdict) => {
  const actions = {
    ACCEPT: {
      action: 'allow',
      requireMFA: false,
      requireChallenge: false,
      notify: false
    },
    CHALLENGE: {
      action: 'challenge',
      requireMFA: true,
      requireChallenge: true,
      challengeType: 'voice_callback', // or 'otp', 'challenge_phrase'
      notify: true
    },
    REJECT: {
      action: 'deny',
      requireMFA: false,
      requireChallenge: false,
      notify: true,
      flagForReview: true
    }
  }

  return actions[verdict] || actions.REJECT
}

export default {
  fuseScores,
  makeDecision,
  calculateRiskScore,
  processVerification,
  getRecommendedAction,
  DEFAULT_WEIGHTS,
  THRESHOLDS,
  MATCH_ACCEPT_THRESHOLD,
  MATCH_REJECT_THRESHOLD
}
