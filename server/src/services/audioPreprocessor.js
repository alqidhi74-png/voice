/**
 * Audio Preprocessing Service
 * Handles: denoise, VAD, normalize, resample to 16kHz
 */

// Import fluent-ffmpeg (CommonJS module)
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const ffmpeg = require('fluent-ffmpeg')
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { logger } from '../utils/logger.js'

// Check if FFmpeg is available
let ffmpegAvailable = false
try {
  execSync('ffmpeg -version', { stdio: 'ignore' })
  ffmpegAvailable = true
  logger.info('✅ FFmpeg is available')
} catch (error) {
  ffmpegAvailable = false
  logger.warn('⚠️  FFmpeg is not installed or not in PATH. Audio processing will fail.')
  logger.warn('   Install FFmpeg: https://www.gyan.dev/ffmpeg/builds/')
  logger.warn('   Or see: docs/FFMPEG_WINDOWS_MANUAL.md')
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Target sample rate (16kHz as per Technical Plan)
const TARGET_SAMPLE_RATE = 16000
const TARGET_CHANNELS = 1 // Mono
const TARGET_BIT_DEPTH = 16

/**
 * Preprocess audio file
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path to save processed audio
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processing result with metadata
 */
export const preprocessAudio = async (inputPath, outputPath, options = {}) => {
  if (!ffmpegAvailable) {
    throw new Error('FFmpeg is not installed. Please install FFmpeg to enable audio processing. See docs/FFMPEG_WINDOWS_MANUAL.md')
  }

  const {
    enableDenoise = true,
    enableVAD = true,
    enableNormalize = true,
    targetSampleRate = TARGET_SAMPLE_RATE
  } = options

  return new Promise((resolve, reject) => {
    try {
      let command = ffmpeg(inputPath)
        .audioCodec('pcm_s16le') // 16-bit PCM
        .audioChannels(TARGET_CHANNELS) // Mono
        .audioFrequency(targetSampleRate) // Resample to target rate
        .format('wav') // Output as WAV

      // Normalize audio (peak normalization)
      if (enableNormalize) {
        command = command.audioFilters('loudnorm=I=-16:TP=-1.5:LRA=11')
      }

      // Basic noise reduction (simple high-pass filter to remove low-frequency noise)
      if (enableDenoise) {
        command = command.audioFilters('highpass=f=80') // High-pass filter at 80Hz
      }

      // VAD will be done after processing by analyzing the audio
      command
        .on('start', (commandLine) => {
          logger.debug('FFmpeg command:', commandLine)
        })
        .on('progress', (progress) => {
          logger.debug('Processing progress:', progress.percent)
        })
        .on('end', async () => {
          try {
            // After FFmpeg processing, apply VAD if enabled
            let finalOutputPath = outputPath
            if (enableVAD) {
              finalOutputPath = await applyVAD(outputPath, outputPath.replace('.wav', '_vad.wav'))
            }

            // Get audio metadata
            const metadata = await getAudioMetadata(finalOutputPath)

            resolve({
              success: true,
              outputPath: finalOutputPath,
              metadata
            })
          } catch (error) {
            reject(new Error(`Post-processing failed: ${error.message}`))
          }
        })
        .on('error', (error) => {
          logger.error('FFmpeg error:', error.message)
          reject(new Error(`Audio processing failed: ${error.message}`))
        })
        .save(outputPath)
    } catch (error) {
      reject(new Error(`Failed to start audio processing: ${error.message}`))
    }
  })
}

/**
 * Apply Voice Activity Detection (VAD) - trim silence
 * @param {string} inputPath - Input audio file
 * @param {string} outputPath - Output audio file
 * @returns {Promise<string>} - Path to processed file
 */
const applyVAD = async (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    // Use FFmpeg's silencedetect filter to find silence
    // Then trim silence from start and end
    ffmpeg(inputPath)
      .audioFilters([
        'silenceremove=start_periods=1:start_silence=0.3:start_threshold=-50dB',
        'areverse',
        'silenceremove=start_periods=1:start_silence=0.3:start_threshold=-50dB',
        'areverse'
      ])
      .on('end', () => {
        resolve(outputPath)
      })
      .on('error', (error) => {
        logger.warn('VAD processing failed, using original:', error.message)
        // If VAD fails, return original file
        resolve(inputPath)
      })
      .save(outputPath)
  })
}

/**
 * Get audio metadata
 * @param {string} filePath - Audio file path
 * @returns {Promise<Object>} - Audio metadata
 */
const getAudioMetadata = (filePath) => {
  if (!ffmpegAvailable) {
    return Promise.reject(new Error('FFmpeg is not installed. Please install FFmpeg to enable audio processing.'))
  }

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) {
        reject(new Error(`Failed to get metadata: ${error.message}`))
        return
      }

      const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio')
      
      if (!audioStream) {
        reject(new Error('No audio stream found'))
        return
      }

      resolve({
        duration: metadata.format.duration || 0,
        sampleRate: audioStream.sample_rate || TARGET_SAMPLE_RATE,
        channels: audioStream.channels || TARGET_CHANNELS,
        bitrate: metadata.format.bit_rate || 0,
        format: metadata.format.format_name || 'wav',
        size: metadata.format.size || 0,
        codec: audioStream.codec_name || 'pcm_s16le'
      })
    })
  })
}

/**
 * Validate audio file
 * @param {string} filePath - Audio file path
 * @returns {Promise<Object>} - Validation result
 */
export const validateAudioFile = async (filePath) => {
  try {
    const metadata = await getAudioMetadata(filePath)
    
    // Check minimum duration (10 seconds as per client requirement)
    const minDuration = 10
    const maxDuration = 60
    
    if (metadata.duration < minDuration) {
      return {
        valid: false,
        error: `Audio too short. Minimum duration is ${minDuration} seconds.`,
        metadata
      }
    }

    if (metadata.duration > maxDuration) {
      return {
        valid: false,
        error: `Audio too long. Maximum duration is ${maxDuration} seconds.`,
        metadata
      }
    }

    return {
      valid: true,
      metadata
    }
  } catch (error) {
    return {
      valid: false,
      error: `Invalid audio file: ${error.message}`,
      metadata: null
    }
  }
}

/**
 * Clean up temporary files
 * @param {string[]} filePaths - Array of file paths to delete
 */
export const cleanupFiles = async (filePaths) => {
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath)
      logger.debug('Cleaned up file:', filePath)
    } catch (error) {
      logger.warn('Failed to cleanup file:', filePath, error.message)
    }
  }
}

export default {
  preprocessAudio,
  validateAudioFile,
  cleanupFiles,
  TARGET_SAMPLE_RATE,
  TARGET_CHANNELS
}

