/**
 * Audio Preprocessing Service Tests
 * Run with: node src/services/audioPreprocessor.test.js
 */

import { preprocessAudio, validateAudioFile, cleanupFiles } from './audioPreprocessor.js'
import { logger } from '../utils/logger.js'

// Test function (for manual testing)
const testPreprocessing = async () => {
  const testInput = './uploads/test-input.webm'
  const testOutput = './uploads/test-output.wav'

  try {
    logger.info('Testing audio preprocessing...')
    
    // Validate input
    const validation = await validateAudioFile(testInput)
    logger.info('Validation result:', validation)

    if (!validation.valid) {
      logger.error('Input file validation failed:', validation.error)
      return
    }

    // Preprocess
    const result = await preprocessAudio(testInput, testOutput, {
      enableDenoise: true,
      enableVAD: true,
      enableNormalize: true
    })

    logger.info('Preprocessing result:', result)

    // Cleanup
    await cleanupFiles([testOutput])
    logger.info('Test completed successfully')
  } catch (error) {
    logger.error('Test failed:', error.message)
  }
}

// Uncomment to run test
// testPreprocessing()

export { testPreprocessing }

