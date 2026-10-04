import { useState, useRef, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import Recorder from '../components/Recorder'
import { extractAudioFeatures } from '../utils/audioUtils'
import { enrollVoice } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

const CRITICAL_FEATURES = Object.freeze([
  { key: 'spectral_mfccs', label: 'MFCC (Abs Mean)' },
  { key: 'temporal_jitter', label: 'Jitter' },
  { key: 'temporal_hnr', label: 'Harmonics-to-Noise Ratio' },
  { key: 'temporal_voice_breaks', label: 'Voice Breaks' },
  { key: 'prosodic_fundamental_frequency', label: 'Fundamental Frequency (F0)' },
  { key: 'prosodic_pitch_range', label: 'Pitch Range' },
  { key: 'prosodic_pause_duration', label: 'Average Pause Duration' },
  { key: 'phase_coherence', label: 'Phase Coherence' },
  { key: 'artifact_speech_smoothness', label: 'Speech Smoothness' },
  { key: 'stat_entropy_pitch_energy', label: 'Pitch/Energy Entropy' }
])

const formatFeatureValue = (value) => {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }

  const abs = Math.abs(value)
  if (abs >= 1000) return value.toFixed(0)
  if (abs >= 100) return value.toFixed(1)
  if (abs >= 1) return value.toFixed(3)
  if (abs >= 0.01) return value.toFixed(4)
  return value.toExponential(2)
}

const getFeatureLookup = (names, vector) => {
  if (!Array.isArray(names) || !Array.isArray(vector) || names.length !== vector.length) {
    return null
  }
  return names.reduce((acc, name, idx) => {
    const numericValue = Number(vector[idx])
    acc[name] = Number.isFinite(numericValue) ? numericValue : null
    return acc
  }, {})
}

const EnrolledFeatureSummary = ({ bundle }) => {
  const summary = bundle?.summary || null
  const names = bundle?.names || []
  const vector = bundle?.vector || []
  const vectorLookup = useMemo(() => getFeatureLookup(names, vector), [names, vector])

  const rows = useMemo(() => {
    return CRITICAL_FEATURES.map(({ key, label }) => {
      let value = null
      if (summary && Number.isFinite(summary[key])) {
        value = summary[key]
      } else if (vectorLookup && Number.isFinite(vectorLookup[key])) {
        value = vectorLookup[key]
      }

      return { key, label, value }
    })
  }, [summary, vectorLookup])

  const hasData = rows.some(row => row.value != null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-10 card-soft rounded-3xl p-6 shadow-soft-lg border border-primary/30"
    >
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="text-xl font-heading font-semibold text-text-primary">
          Extracted Voice Features
        </h3>
        <span className="text-xs uppercase tracking-wide text-text-secondary/70">
          Highlighting core biometric indicators from the enrolled voiceprint
        </span>
      </div>

      {hasData ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(({ key, label, value }) => (
            <div
              key={key}
              className="bg-dark/60 rounded-2xl border border-border/40 px-4 py-3"
            >
              <div className="text-[11px] uppercase tracking-wide text-text-secondary/70 mb-1">
                {label}
              </div>
              <div className="text-lg font-semibold text-primary">
                {formatFeatureValue(value)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-text-secondary/80 bg-dark/50 border border-border/40 rounded-2xl px-4 py-3">
          Feature summary is not available yet. Try re-enrolling to capture the full biometric panorama.
        </div>
      )}
    </motion.div>
  )
}

const Enroll = () => {
  const { currentUser } = useAuth()
  const { showToast } = useToast()
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [features, setFeatures] = useState(null)
  const [enrolledFeatureBundle, setEnrolledFeatureBundle] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [error, setError] = useState(null)
  const [showConfirmButton, setShowConfirmButton] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [voiceName, setVoiceName] = useState('My Voice Recording')
  const audioRef = useRef(null)

  const handleRecordingComplete = async (blob) => {
    // Just store the blob, show playback, and analyze features for preview
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioBlob(blob)
    const url = URL.createObjectURL(blob)
    setAudioUrl(url)
    setError(null)
    setShowConfirmButton(true)

    setFeatures(null)
    setIsAnalyzing(true)

    try {
      const extractedFeatures = await extractAudioFeatures(blob)
      setFeatures(extractedFeatures)
    } catch (featureError) {
      console.error('Failed to analyze recording:', featureError)
      showToast('Could not extract preview features. You can still upload your recording.', { type: 'warning' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  useEffect(() => {
    if (error) {
      showToast(error, { type: 'error' })
    }
  }, [error, showToast])

  useEffect(() => {
    if (isEnrolled) {
      showToast('Voice enrolled successfully!', { type: 'success' })
    }
  }, [isEnrolled, showToast])

  // Audio player controls with smooth updates
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    let animationFrameId
    
    const smoothUpdate = () => {
      setCurrentTime(audio.currentTime)
      
      // Continue updating if audio is playing
      if (!audio.paused && !audio.ended) {
        animationFrameId = requestAnimationFrame(smoothUpdate)
      }
    }
    
    const updateDuration = () => setDuration(audio.duration)
    const handleEnded = () => {
      setIsPlaying(false)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
    const handlePlay = () => {
      setIsPlaying(true)
      animationFrameId = requestAnimationFrame(smoothUpdate)
    }
    const handlePause = () => {
      setIsPlaying(false)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }

    // Start smooth updates if already playing
    if (!audio.paused && !audio.ended) {
      animationFrameId = requestAnimationFrame(smoothUpdate)
    }
    
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [audioUrl])

  const togglePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleVolumeChange = (e) => {
    const audio = audioRef.current
    if (!audio) return

    const newVolume = parseFloat(e.target.value)
    audio.volume = newVolume
    setVolume(newVolume)
  }

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleConfirmAndUpload = async () => {
    if (!audioBlob) {
      setError('No recording found. Please record again.')
      return
    }

    setError(null)
    setIsProcessing(true)
    setShowConfirmButton(false)

    try {
      // Check if user is logged in
      if (!currentUser) {
        setError('Please log in to enroll your voice.')
        setIsProcessing(false)
        return
      }

      // Extract audio features for display (client-side preview) if not already available
      let extractedFeatures = features
      if (!extractedFeatures) {
        extractedFeatures = await extractAudioFeatures(audioBlob)
        setFeatures(extractedFeatures)
      }

      // Send audio to backend API for processing
      const result = await enrollVoice(
        audioBlob,
        voiceName.trim() || 'My Voice Recording',
        extractedFeatures
      )
      
      if (!result.success) {
        throw new Error(result.error || 'Secure enrollment failed')
      } else {
        // API enrollment successful
        const apiResponse = result.data || {}
        const apiData = apiResponse.data || {}
        const apiFeatureSummary = apiData.featureSummary && typeof apiData.featureSummary === 'object'
          ? apiData.featureSummary
          : null
        const apiFeatureNames = Array.isArray(apiData.featureNames) ? apiData.featureNames : []
        const apiFeatureVector = Array.isArray(apiData.featureVector) ? apiData.featureVector : []

        setEnrolledFeatureBundle({
          summary: apiFeatureSummary,
          names: apiFeatureNames,
          vector: apiFeatureVector
        })

        // Replace preview features with authoritative backend summary for display
        setFeatures(null)
      }

      setIsEnrolled(true)
      setIsProcessing(false)
    } catch (err) {
      console.error('Enrollment error:', err)
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      })
      // Show more specific error message
      let errorMessage = 'Failed to process voice recording. Please try again.'
      if (err.message) {
        errorMessage = err.message
      } else if (err instanceof Error) {
        errorMessage = err.toString()
      }
      setError(errorMessage)
      setIsProcessing(false)
      setShowConfirmButton(true) // Show confirm button again if error
    }
  }

  const handleReset = () => {
    // Stop audio if playing
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setAudioBlob(null)
    setAudioUrl(null)
    setFeatures(null)
    setEnrolledFeatureBundle(null)
    setIsEnrolled(false)
    setError(null)
    setShowConfirmButton(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setVoiceName('My Voice Recording')
    setIsAnalyzing(false)
    // Revoke the object URL to free memory
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-heading font-bold text-text-primary mb-4">
            Enroll Your Voice
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Record your voice (minimum 10 seconds, maximum 60 seconds) to create your unique encrypted voiceprint. 
            You can stop recording after 10 seconds, or it will auto-stop at 60 seconds. This will be used to verify your identity in future recordings.
          </p>
        </motion.div>

        {!isEnrolled ? (
          <>
            <Recorder onRecordingComplete={handleRecordingComplete} minDuration={10} maxDuration={60} hidePlayback={true} />

            {/* Audio Playback and Confirm Button */}
            {showConfirmButton && audioUrl && !isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 card-soft rounded-2xl p-6 shadow-soft"
              >
                <h3 className="text-lg font-heading font-semibold text-text-primary mb-4 text-center">
                  Review Your Recording
                </h3>
                <div className="bg-dark/50 rounded-2xl p-6 border border-border/50 mb-4">
                  <audio ref={audioRef} src={audioUrl} className="hidden" />
                  
                  {/* Custom Audio Player */}
                  <div className="space-y-4">
                    {/* Controls */}
                    <div className="flex items-center justify-between gap-4">
                      {/* Play/Pause Button */}
                      <button
                        onClick={togglePlayPause}
                        className="w-12 h-12 gradient-primary rounded-full flex items-center justify-center text-dark font-bold hover:scale-110 transition-transform shadow-soft-lg glow-hover"
                      >
                        {isPlaying ? (
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </button>

                      {/* Time Display */}
                      <div className="flex-1 flex flex-col items-center justify-center text-text-secondary text-sm font-medium">
                        <span>{formatTime(currentTime)}</span>
                        <span className="opacity-70">/ {formatTime(duration)}</span>
                      </div>

                      {/* Volume Control */}
                      <div className="flex items-center gap-2 w-32">
                        <svg className="w-5 h-5 text-text-secondary" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                        </svg>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={volume}
                          onChange={handleVolumeChange}
                          className="flex-1 h-1 bg-card/60 rounded-full appearance-none cursor-pointer accent-primary"
                          style={{
                            background: `linear-gradient(to right, #00C853 0%, #00C853 ${volume * 100}%, rgba(24, 32, 40, 0.6) ${volume * 100}%, rgba(24, 32, 40, 0.6) 100%)`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Voice Name Input */}
                <div className="mb-6">
                  <label htmlFor="voiceName" className="block text-sm font-medium text-text-primary mb-2">
                    Voice Recording Name
                  </label>
                  <input
                    id="voiceName"
                    type="text"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    placeholder="Enter a name for this recording"
                    maxLength={50}
                    className="w-full px-4 py-3 bg-dark/60 border border-border rounded-xl text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                  <p className="mt-1 text-xs text-text-secondary">
                    Give your voice recording a name to help you identify it later (e.g., "Work Voice", "Personal Voice")
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={handleConfirmAndUpload}
                    className="px-6 py-3 gradient-primary rounded-2xl font-semibold text-dark glow-hover transition-all shadow-soft-lg"
                  >
                    ✓ Confirm & Upload
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-6 py-3 bg-card/80 border border-border rounded-2xl font-semibold text-text-primary hover:border-primary hover:bg-card transition-all backdrop-blur-sm"
                  >
                    Record Again
                  </button>
                </div>
              </motion.div>
            )}

            {isAnalyzing && !isProcessing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-center text-text-secondary text-sm"
              >
                Analyzing your recording to extract preview metrics...
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
                  <span>Processing voice features and encrypting data...</span>
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

            {features && !isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 card-soft rounded-2xl p-6 shadow-soft"
              >
                <h3 className="text-xl font-heading font-semibold text-text-primary mb-4">
                  Extracted Voice Features
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {features.energy && (
                    <div className="bg-dark/60 p-4 rounded-xl border border-border/30">
                      <div className="text-text-secondary mb-1 text-xs">Energy</div>
                      <div className="text-primary font-semibold">
                        {features.energy.mean?.toFixed(4) || 'N/A'}
                      </div>
                    </div>
                  )}
                  {features.spectralCentroid && (
                    <div className="bg-dark/60 p-4 rounded-xl border border-border/30">
                      <div className="text-text-secondary mb-1 text-xs">Spectral Centroid</div>
                      <div className="text-primary font-semibold">
                        {features.spectralCentroid.mean?.toFixed(2) || 'N/A'}
                      </div>
                    </div>
                  )}
                  {features.rms && (
                    <div className="bg-dark/60 p-4 rounded-xl border border-border/30">
                      <div className="text-text-secondary mb-1 text-xs">RMS</div>
                      <div className="text-primary font-semibold">
                        {features.rms.mean?.toFixed(4) || 'N/A'}
                      </div>
                    </div>
                  )}
                  {features.duration && (
                    <div className="bg-dark/60 p-4 rounded-xl border border-border/30">
                      <div className="text-text-secondary mb-1 text-xs">Duration</div>
                      <div className="text-primary font-semibold">
                        {features.duration.toFixed(2)}s
                      </div>
                    </div>
                  )}
                  {features.sampleRate && (
                    <div className="bg-dark/60 p-4 rounded-xl border border-border/30">
                      <div className="text-text-secondary mb-1 text-xs">Sample Rate</div>
                      <div className="text-primary font-semibold">
                        {features.sampleRate} Hz
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="card-soft border border-success/50 rounded-3xl p-8 glow-effect shadow-soft-lg" style={{ boxShadow: '0 0 30px rgba(0, 255, 136, 0.3)' }}>
                <div className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-3xl font-heading font-semibold text-success mb-4">
                  Voice Enrolled Successfully!
                </h2>
                <p className="text-text-secondary mb-8 max-w-md mx-auto leading-relaxed">
                  Your voiceprint has been encrypted and stored securely. 
                  You can now use it to verify your voice identity.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    to="/verify"
                    className="px-6 py-3 gradient-primary rounded-2xl font-semibold text-dark glow-hover transition-all shadow-soft-lg"
                  >
                    Verify Voice Now
                  </Link>
                  <button
                    onClick={handleReset}
                    className="px-6 py-3 bg-card/80 border border-border rounded-2xl font-semibold text-text-primary hover:border-primary hover:bg-card transition-all backdrop-blur-sm"
                  >
                    Enroll Another Voice
                  </button>
                </div>
              </div>
            </motion.div>

            <EnrolledFeatureSummary bundle={enrolledFeatureBundle} />
          </>
        )}

        {/* Instructions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-12 card-soft rounded-2xl p-6 shadow-soft"
        >
          <h3 className="text-lg font-semibold text-text-primary mb-4">📋 Instructions</h3>
          <ul className="space-y-3 text-text-secondary text-sm">
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>Find a quiet environment to record your voice</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>Speak clearly and naturally (minimum 10 seconds, you can stop after 10s, max 60 seconds)</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>You can say anything - your name, a phrase, or read a sentence</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>Your voice data will be encrypted before storage</span>
            </li>
          </ul>
        </motion.div>
      </div>
    </div>
  )
}

export default Enroll
