import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useToast } from '../contexts/ToastContext'

const Recorder = ({ onRecordingComplete, minDuration = 10, maxDuration = 60, hidePlayback = false, onReset }) => {
  const { showToast } = useToast()
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      // Clean up stream and recorder on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop()
        } catch (e) {
          console.error('Error stopping recorder on unmount:', e)
        }
      }
    }
  }, [audioUrl])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setIsRecording(false)
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        if (onRecordingComplete) {
          onRecordingComplete(blob)
        }
      }

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error)
        setIsRecording(false)
        showToast(event?.error?.message || 'An error occurred while recording audio.', { type: 'error' })
        if (timerRef.current) {
          clearInterval(timerRef.current)
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1
          // Only auto-stop when max duration is reached
          if (newTime >= maxDuration) {
            // Clear interval first to prevent multiple calls
            if (timerRef.current) {
              clearInterval(timerRef.current)
              timerRef.current = null
            }
            // Stop recording automatically at max duration
            stopRecording()
            return maxDuration
          }
          return newTime
        })
      }, 1000)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      showToast('Microphone access denied. Please enable microphone permissions.', { type: 'error' })
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    // Prevent stopping before minimum duration
    if (recordingTime < minDuration) {
      return
    }

    // Clear timer first
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Stop MediaRecorder if it exists and is recording
    if (mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current
      // Check MediaRecorder state directly instead of relying on React state
      if (recorder.state === 'recording' || recorder.state === 'paused') {
        try {
          recorder.stop()
        } catch (error) {
          console.error('Error stopping MediaRecorder:', error)
        }
      }
      setIsRecording(false)
    }

    // Stop stream tracks if still active
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.stop()
        }
      })
    }
  }

  const resetRecording = () => {
    setAudioBlob(null)
    setAudioUrl(null)
    setRecordingTime(0)
    setIsRecording(false)
    if (typeof onReset === 'function') {
      onReset()
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="card-soft rounded-3xl p-8 shadow-soft-lg">
        <div className="flex flex-col items-center space-y-8">
          {/* Recording Button */}
          <motion.button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={(!isRecording && recordingTime >= maxDuration) || (isRecording && recordingTime < minDuration)}
            className={`w-28 h-28 rounded-full flex items-center justify-center text-white font-semibold text-lg transition-all shadow-soft-lg ${
              isRecording
                ? recordingTime < minDuration
                  ? 'bg-gradient-to-br from-error to-red-600 animate-pulse cursor-not-allowed opacity-75'
                  : 'bg-gradient-to-br from-error to-red-600 animate-pulse cursor-pointer'
                : recordingTime >= maxDuration
                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                : 'gradient-primary glow-hover'
            }`}
            whileHover={isRecording && recordingTime >= minDuration ? { scale: 1.08 } : recordingTime >= maxDuration ? {} : { scale: 1.08, rotate: 5 }}
            whileTap={isRecording && recordingTime >= minDuration ? { scale: 0.92 } : {}}
            style={{
              boxShadow: isRecording 
                ? '0 8px 32px rgba(255, 77, 77, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.2)'
                : undefined
            }}
          >
            {isRecording ? (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="3" />
              </svg>
            ) : (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
              </svg>
            )}
          </motion.button>

          {/* Timer */}
          <div className="text-center">
            <div className="text-4xl font-heading font-bold text-primary mb-3 tracking-tight">
              {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
            </div>
            <p className="text-text-secondary text-base font-medium">
              {isRecording 
                ? recordingTime < minDuration 
                  ? `Recording... (minimum ${minDuration}s)` 
                  : 'Recording... (you can stop now)'
                : recordingTime > 0 
                ? 'Recording Complete' 
                : 'Click to start recording'}
            </p>
            <p className="text-text-secondary text-sm mt-2 opacity-75">
              {isRecording 
                ? `Min: ${minDuration}s | Max: ${maxDuration}s` 
                : `Minimum: ${minDuration}s | Maximum: ${maxDuration}s`}
            </p>
          </div>

          {/* Audio Playback - Only show if hidePlayback is false */}
          {!hidePlayback && audioUrl && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <div className="bg-dark/50 rounded-2xl p-4 border border-border/50">
                <audio controls src={audioUrl} className="w-full rounded-xl" />
              </div>
              <button
                onClick={resetRecording}
                className="mt-4 px-6 py-3 bg-card/80 border border-border rounded-2xl text-text-secondary hover:text-primary hover:border-primary hover:bg-card transition-all duration-300 text-sm font-medium"
              >
                Record Again
              </button>
            </motion.div>
          )}

          {/* Waveform Visualization Placeholder */}
          {isRecording && (
            <div className="w-full h-24 flex items-center justify-center space-x-2 px-4">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-2.5 bg-gradient-to-t from-primary to-accent rounded-full"
                  animate={{
                    height: [20, Math.random() * 50 + 30, 20],
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.04,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Recorder

