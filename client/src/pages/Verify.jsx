import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Navigate } from 'react-router-dom'
import Recorder from '../components/Recorder'
import ResultCard from '../components/ResultCard'
import { extractAudioFeatures, flattenFeatureVector } from '../utils/audioUtils'
import { calculateSimilarity } from '../utils/audioUtils'
import { decryptData } from '../services/encryption'
import { getVoiceprint as getVoiceprintLocal, addVerificationHistory, getEncryptionKey as getEncryptionKeyLocal } from '../services/storage'
import { getVoiceprint } from '../services/userApi'
import { verifyVoice } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

const isMissingVoiceprintResponse = (responseOrError) => {
  const status = responseOrError?.status
  const message = responseOrError?.data?.error
    || responseOrError?.error
    || responseOrError?.message
    || ''

  return (
    (status === undefined || status === 404) &&
    (message === 'No voiceprint found for this user' || message === 'Voiceprint document not found')
  )
}

const Verify = () => {
  const { currentUser } = useAuth()
  const { showToast } = useToast()
  const [audioBlob, setAudioBlob] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  // null means that the API check has not produced a definitive answer yet.
  const [hasVoiceprint, setHasVoiceprint] = useState(null)
  const [isCheckingVoiceprint, setIsCheckingVoiceprint] = useState(true)

  useEffect(() => {
    if (error) {
      showToast(error, { type: 'error' })
    }
  }, [error, showToast])

  useEffect(() => {
    if (result) {
      let type = 'info'
      if (result.verdict === 'Authentic') {
        type = 'success'
      } else if (result.verdict === 'Possible Deepfake' || result.status === 'failure') {
        type = 'error'
      } else if (result.verdict === 'Uncertain') {
        type = 'warning'
      }
      const verdictLabel = result.verdict || 'Verification complete'
      showToast(`Verification verdict: ${verdictLabel}`, { type })
    }
  }, [result, showToast])

  // Check if voiceprint exists on mount
  useEffect(() => {
    let isMounted = true

    const checkVoiceprint = async () => {
      if (!isMounted) {
        return
      }

      setIsCheckingVoiceprint(true)
      setHasVoiceprint(null)

      try {
        if (currentUser) {
          // The backend is authoritative. Only an explicit "not found" response
          // may send the user back to enrollment.
          const apiResult = await getVoiceprint()
          const apiVoiceprint = apiResult?.data?.voiceprint
            || apiResult?.voiceprint
            || apiResult?.data

          if (apiResult?.success === true && apiVoiceprint) {
            if (isMounted) {
              setHasVoiceprint(true)
            }
            return
          }

          if (apiResult?.success === false && isMissingVoiceprintResponse(apiResult)) {
            if (isMounted) {
              setHasVoiceprint(false)
            }
            return
          }
        }

        // A local voiceprint can keep verification available when the API response
        // is inconclusive, but its absence is not proof that enrollment is missing.
        const localVoiceprint = getVoiceprintLocal(currentUser?.uid)
        if (isMounted && localVoiceprint) {
          setHasVoiceprint(true)
        }
      } catch (error) {
        if (isMissingVoiceprintResponse(error)) {
          if (isMounted) {
            setHasVoiceprint(false)
          }
          return
        }

        console.warn('Unable to confirm voiceprint with API:', error)
        const localVoiceprint = getVoiceprintLocal(currentUser?.uid)
        if (isMounted && localVoiceprint) {
          setHasVoiceprint(true)
        }
      } finally {
        if (isMounted) {
          setIsCheckingVoiceprint(false)
        }
      }
    }

    checkVoiceprint()

    return () => {
      isMounted = false
    }
  }, [currentUser])

  const mapDecisionToVerdict = (decision, status) => {
    if (status && status !== 'success') {
      if (status === 'failure') return 'Failed'
      if (status === 'processing') return 'Processing'
    }

    switch (decision) {
      case 'ACCEPT':
        return 'Authentic'
      case 'CHALLENGE':
        return 'Uncertain'
      case 'REJECT':
        return 'Possible Deepfake'
      default:
        return decision || 'Uncertain'
    }
  }

  const handleRecordingComplete = (blob) => {
    setAudioBlob(blob)
    setError(null)
    setResult(null)
    setIsProcessing(false)
  }

  const handleRecorderReset = () => {
    setAudioBlob(null)
    setError(null)
    setResult(null)
    setIsProcessing(false)
  }

  const runVerification = async (blob) => {
    if (!blob) {
      setError('No recording found. Please record your voice first.')
      return
    }

    setIsProcessing(true)
    setError(null)
    setResult(null)

    const buildComparisonFromVectors = (probeVector, referenceVector) => {
      if (
        !Array.isArray(probeVector) ||
        !Array.isArray(referenceVector) ||
        probeVector.length === 0 ||
        probeVector.length !== referenceVector.length
      ) {
        return null
      }

      const dimension = probeVector.length
      const previewCount = Math.min(96, dimension)
      const probePreview = probeVector.slice(0, previewCount)
      const referencePreview = referenceVector.slice(0, previewCount)
      const differencePreview = probePreview.map((value, idx) => value - referencePreview[idx])

      let sumDiff = 0
      let sumAbsDiff = 0
      let sumSquares = 0
      let maxAbsDiff = Number.NEGATIVE_INFINITY
      let minAbsDiff = Number.POSITIVE_INFINITY

      for (let i = 0; i < dimension; i++) {
        const diff = probeVector[i] - referenceVector[i]
        const absDiff = Math.abs(diff)
        sumDiff += diff
        sumAbsDiff += absDiff
        sumSquares += diff * diff
        if (absDiff > maxAbsDiff) maxAbsDiff = absDiff
        if (absDiff < minAbsDiff) minAbsDiff = absDiff
      }

      return {
        dimension,
        previewCount,
        probePreview,
        referencePreview,
        differencePreview,
        stats: {
          meanDiff: sumDiff / dimension,
          meanAbsDiff: sumAbsDiff / dimension,
          maxAbsDiff,
          minAbsDiff: Number.isFinite(minAbsDiff) ? minAbsDiff : 0,
          l2Distance: Math.sqrt(sumSquares)
        },
        topDeltas: probePreview
          .map((value, idx) => ({
            index: idx,
            probe: value,
            reference: referencePreview[idx],
            delta: differencePreview[idx],
            magnitude: Math.abs(differencePreview[idx])
          }))
          .sort((a, b) => b.magnitude - a.magnitude)
          .slice(0, 6)
      }
    }

    try {
      // Try API verification first
      const apiResult = await verifyVoice(blob)

      if (apiResult.success && apiResult.data?.success && apiResult.data?.data) {
        // API verification successful - use backend result
        const apiData = apiResult.data.data

        const decision = apiData.verdict || apiData.decision
        const status = apiData.status || 'success'

        const matchScore = typeof apiData.matchScore === 'number'
          ? apiData.matchScore
          : typeof apiData.scoreDetails?.matchScore === 'number'
          ? apiData.scoreDetails.matchScore
          : null

        const finalScore = typeof apiData.finalScore === 'number'
          ? apiData.finalScore
          : typeof apiData.scoreDetails?.finalScore === 'number'
          ? apiData.scoreDetails.finalScore
          : matchScore

        const syntheticScore = typeof apiData.syntheticScore === 'number'
          ? apiData.syntheticScore
          : typeof apiData.scoreDetails?.syntheticScore === 'number'
          ? apiData.scoreDetails.syntheticScore
          : null

        const riskScore = typeof apiData.riskScore === 'number'
          ? apiData.riskScore
          : typeof apiData.scoreDetails?.riskScore === 'number'
          ? apiData.scoreDetails.riskScore
          : null

        const similarity = typeof matchScore === 'number'
          ? matchScore
          : typeof finalScore === 'number'
          ? finalScore
          : typeof apiData.similarity === 'number'
          ? apiData.similarity
          : 0

        const biometricComparison = apiData.biometricComparison || null
        const featureComparison = apiData.featureComparison || null
        const featureNames = apiData.features?.names || apiData.featureSummary?.names || []
        const featureVector = apiData.features?.vector || null
        const featureSummary = apiData.featureSummary?.probe || apiData.features?.summary || null
        const referenceFeatureSummary = apiData.featureSummary?.reference || apiData.storedFeatureSummary || null

        const featurePenalty = typeof apiData.featurePenalty === 'number' ? apiData.featurePenalty : null
        const featureDrift = apiData.featureDrift || null

        const verificationResult = {
          similarity,
          verdict: mapDecisionToVerdict(decision, status),
          decision: decision || null,
          status,
          timestamp: apiData.timestamp || new Date().toISOString(),
          syntheticScore,
          finalScore,
          matchScore,
          riskScore,
          verificationId: apiData.verificationId,
          metadata: apiData.metadata || {},
          biometricComparison,
          featureComparison,
          featurePenalty,
          featureDrift,
          features: {
            names: featureNames,
            vector: featureVector,
            summary: featureSummary,
            referenceSummary: referenceFeatureSummary
          },
          details: apiData
        }

        const historyEntry = {
          ...verificationResult,
          biometricComparison: biometricComparison
            ? {
                stats: biometricComparison.stats,
                previewCount: biometricComparison.previewCount,
                dimension: biometricComparison.dimension
              }
            : null,
          featureComparison: featureComparison
            ? {
                stats: featureComparison.stats,
                previewCount: featureComparison.previewCount,
                topDeltas: featureComparison.topDeltas
              }
            : null,
          featurePenalty,
          featureDrift
        }

        addVerificationHistory(historyEntry, currentUser?.uid)

        setResult(verificationResult)
        return
      }

      // Fallback to client-side verification if API fails
      console.warn('API verification failed, falling back to client-side:', apiResult.error)

      let storedVoiceprint = null
      let encryptionKey = null

      // Try to get voiceprint from API first
      if (currentUser) {
        try {
          const voiceprintApi = await getVoiceprint()
          if (voiceprintApi.success && voiceprintApi.data) {
            storedVoiceprint = voiceprintApi.data
            encryptionKey = voiceprintApi.encryptionKey
          }
        } catch (error) {
          console.warn('Failed to get voiceprint from API:', error)
        }
      }

      // Fallback to localStorage if API didn't work
      if (!storedVoiceprint) {
        storedVoiceprint = getVoiceprintLocal(currentUser?.uid)
        encryptionKey = getEncryptionKeyLocal(currentUser?.uid)
      }

      if (!storedVoiceprint) {
        setError('No voiceprint found. Please enroll your voice first.')
        return
      }

      if (!encryptionKey) {
        setError('Encryption key not found. Please enroll again.')
        return
      }

      // Extract features from new recording
      const newFeatures = await extractAudioFeatures(blob)

      // Decrypt stored features
      const storedFeatures = decryptData(storedVoiceprint.encryptedFeatures, encryptionKey)

      // Calculate similarity
      const similarity = calculateSimilarity(storedFeatures, newFeatures)

      const probeVector = flattenFeatureVector(newFeatures)
      const referenceVector = flattenFeatureVector(storedFeatures)
      const biometricComparison = buildComparisonFromVectors(probeVector, referenceVector)

      // Determine verdict
      let verdict = 'Uncertain'
      if (similarity >= 0.75) {
        verdict = 'Authentic'
      } else if (similarity < 0.5) {
        verdict = 'Possible Deepfake'
      }

      const verificationResult = {
        similarity,
        verdict,
        status: 'success',
        timestamp: new Date().toISOString(),
        features: null,
        biometricComparison
      }

      const historyEntry = {
        ...verificationResult,
        biometricComparison: biometricComparison
          ? {
              stats: biometricComparison.stats,
              previewCount: biometricComparison.previewCount,
              dimension: biometricComparison.dimension
            }
          : null
      }

      addVerificationHistory(historyEntry, currentUser?.uid)

      setResult(verificationResult)
    } catch (err) {
      console.error('Verification error:', err)
      setError('Failed to verify voice. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirmVerification = async () => {
    if (isProcessing) {
      return
    }

    if (!audioBlob) {
      showToast('Please record your voice before verifying.', { type: 'info' })
      return
    }

    await runVerification(audioBlob)
  }

  const handleReset = () => {
    setAudioBlob(null)
    setResult(null)
    setError(null)
  }

  const renderSkeleton = () => (
    <div className="min-h-screen py-8 px-3 md:px-6">
      <div className="mx-auto max-w-6xl w-full space-y-10">
        <div className="card-soft rounded-3xl p-8 shadow-soft-lg">
          <div className="space-y-4">
            <div className="h-8 w-2/5 bg-dark/40 rounded-xl animate-pulse" />
            <div className="h-4 w-3/4 bg-dark/40 rounded-xl animate-pulse" />
            <div className="h-4 w-1/2 bg-dark/40 rounded-xl animate-pulse" />
          </div>
        </div>
        <div className="card-soft rounded-3xl p-8 shadow-soft-lg">
          <div className="space-y-4">
            <div className="h-40 bg-dark/40 rounded-2xl animate-pulse" />
            <div className="h-4 w-2/3 bg-dark/40 rounded-xl animate-pulse" />
            <div className="h-11 w-48 bg-dark/40 rounded-2xl animate-pulse" />
          </div>
        </div>
        <div className="card-soft rounded-2xl p-6 shadow-soft">
          <div className="h-5 w-1/4 bg-dark/40 rounded-xl animate-pulse mb-4" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-dark/40 rounded-xl animate-pulse" />
            <div className="h-4 w-5/6 bg-dark/40 rounded-xl animate-pulse" />
            <div className="h-4 w-1/2 bg-dark/40 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )

  if (isCheckingVoiceprint) {
    return renderSkeleton()
  }

  if (hasVoiceprint === false) {
    return <Navigate to="/enroll" replace />
  }

  return (
    <div className="min-h-screen py-8 px-3 md:px-6">
      <div className="mx-auto max-w-6xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-4xl md:text-5xl font-heading font-bold text-text-primary mb-4">
            Verify Your Voice
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Record a new voice sample to compare against your enrolled voiceprint 
            and detect potential deepfake or impersonation attempts.
          </p>
        </motion.div>

        {!result && (
          <>
            <Recorder
              onRecordingComplete={handleRecordingComplete}
              onReset={handleRecorderReset}
              minDuration={10}
              maxDuration={60}
            />

            {audioBlob && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 text-center space-y-4"
              >
                <p className="text-text-secondary text-sm">
                  Playback your recording to make sure it sounds clear. When you&apos;re ready, confirm to start verification.
                </p>
                <button
                  onClick={handleConfirmVerification}
                  disabled={isProcessing}
                  className={`px-6 py-3 rounded-2xl font-semibold transition-all shadow-soft-lg ${
                    isProcessing
                      ? 'bg-gray-600/60 text-text-secondary cursor-not-allowed'
                      : 'gradient-primary text-dark glow-hover'
                  }`}
                >
                  {isProcessing ? 'Verifying...' : 'Confirm & Verify'}
                </button>
              </motion.div>
            )}

            {isProcessing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-8 text-center"
              >
                <div className="inline-flex items-center space-x-3 text-primary">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <span>Analyzing biometric signature and building comparison islands...</span>
                </div>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-4 bg-error/20 border border-error/50 rounded-2xl text-error text-center backdrop-blur-sm"
              >
                {error}
              </motion.div>
            )}
          </>
        )}

        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <ResultCard result={result} audioBlob={audioBlob} />
            <div className="mt-6 text-center">
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-card/80 border border-border rounded-2xl font-semibold text-text-primary hover:border-primary hover:bg-card transition-all backdrop-blur-sm"
              >
                Verify Another Recording
              </button>
            </div>
          </motion.div>
        )}

        {/* Info Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-12 card-soft rounded-2xl p-6 shadow-soft"
        >
          <h3 className="text-lg font-semibold text-text-primary mb-4">🔍 How Verification Works</h3>
          <ul className="space-y-3 text-text-secondary text-sm">
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>Your new recording is analyzed to extract biometric features</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>Features are compared against your enrolled voiceprint using cosine similarity</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>Similarity score ≥85% = Authentic | &lt;60% = Possible Deepfake</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>All verification results are logged in your dashboard</span>
            </li>
          </ul>
        </motion.div>
      </div>
    </div>
  )
}

export default Verify
