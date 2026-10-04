import Meyda from 'meyda'

/**
 * Extract audio features from an audio blob using Meyda
 * @param {Blob} audioBlob - The audio blob to analyze
 * @returns {Promise<Object>} - Extracted features object
 */
export const extractAudioFeatures = async (audioBlob) => {
  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const fileReader = new FileReader()

    fileReader.onload = async (e) => {
      try {
        const audioBuffer = await audioContext.decodeAudioData(e.target.result)
        const channelData = audioBuffer.getChannelData(0)
        const sampleRate = audioBuffer.sampleRate
        const bufferSize = 2048

        // Initialize Meyda
        const meydaFeatures = []
        let offset = 0

        // Use a safer set of features that don't require state
        // Removed spectralFlux as it requires previous frame comparison
        const featureList = [
          'rms',
          'energy',
          'spectralCentroid',
          'spectralRolloff',
          'mfcc',
          'chroma',
          'loudness',
        ]

        while (offset < channelData.length) {
          const buffer = channelData.slice(offset, offset + bufferSize)
          
          if (buffer.length === bufferSize) {
            try {
              const features = Meyda.extract(featureList, buffer)
              
              if (features) {
                // Filter out any null/undefined features
                const cleanedFeatures = {}
                Object.keys(features).forEach(key => {
                  if (features[key] != null) {
                    cleanedFeatures[key] = features[key]
                  }
                })
                
                if (Object.keys(cleanedFeatures).length > 0) {
                  meydaFeatures.push(cleanedFeatures)
                }
              }
            } catch (featureError) {
              // Log but continue processing - skip this frame if feature extraction fails
              console.warn('Error extracting features for frame:', featureError)
              // Try with a minimal feature set as fallback
              try {
                const minimalFeatures = Meyda.extract(['rms', 'energy', 'spectralCentroid'], buffer)
                if (minimalFeatures) {
                  meydaFeatures.push(minimalFeatures)
                }
              } catch (minimalError) {
                console.warn('Even minimal features failed, skipping frame')
              }
            }
          }
          
          offset += bufferSize
        }

        // Aggregate features
        const aggregatedFeatures = aggregateFeatures(meydaFeatures)
        
        // Ensure we have at least some basic features
        if (Object.keys(aggregatedFeatures).length === 0) {
          console.warn('No features extracted, using fallback')
          // Return minimal feature set
          resolve({
            rms: { mean: 0, std: 0, min: 0, max: 0 },
            energy: { mean: 0, std: 0, min: 0, max: 0 },
            duration: audioBuffer.duration,
            sampleRate,
            timestamp: new Date().toISOString(),
          })
        } else {
          resolve({
            ...aggregatedFeatures,
            duration: audioBuffer.duration,
            sampleRate,
            timestamp: new Date().toISOString(),
          })
        }
      } catch (error) {
        reject(error)
      }
    }

    fileReader.onerror = reject
    fileReader.readAsArrayBuffer(audioBlob)
  })
}

/**
 * Aggregate multiple feature frames into a single feature vector
 */
const aggregateFeatures = (featureFrames) => {
  if (featureFrames.length === 0) {
    return {}
  }

  const aggregated = {}
  const featureNames = Object.keys(featureFrames[0])

  featureNames.forEach((name) => {
    const values = featureFrames.map((frame) => frame[name]).filter((v) => v != null && v !== undefined)
    
    if (values.length > 0) {
      // Check if the first value is an array
      const isArrayFeature = Array.isArray(values[0])
      
      if (isArrayFeature) {
        // For array features like MFCC, chroma
        // First calculate the mean array
        const meanArray = values[0].map((_, i) => {
          const validValues = values
            .map(arr => arr && arr[i] != null ? arr[i] : null)
            .filter(v => v != null)
          if (validValues.length === 0) return 0
          return validValues.reduce((sum, val) => sum + val, 0) / validValues.length
        })
        
        // Then calculate std using the mean array
        const stdArray = values[0].map((_, i) => {
          const mean = meanArray[i]
          const validValues = values
            .map(arr => arr && arr[i] != null ? arr[i] : null)
            .filter(v => v != null)
          if (validValues.length === 0) return 0
          const variance = validValues.reduce((sum, val) => {
            return sum + Math.pow(val - mean, 2)
          }, 0) / validValues.length
          return Math.sqrt(variance)
        })
        
        aggregated[name] = {
          mean: meanArray,
          std: stdArray,
        }
      } else {
        // For scalar features (numbers)
        // Filter out any non-numeric values
        const numericValues = values.filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v))
        
        if (numericValues.length > 0) {
          const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length
          const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericValues.length
          const std = Math.sqrt(variance)
          
          aggregated[name] = { 
            mean, 
            std, 
            min: Math.min(...numericValues), 
            max: Math.max(...numericValues) 
          }
        }
      }
    }
  })

  return aggregated
}

/**
 * Calculate cosine similarity between two feature vectors
 * @param {Object} features1 - First feature set
 * @param {Object} features2 - Second feature set
 * @returns {number} - Similarity score (0-1)
 */
export const calculateSimilarity = (features1, features2) => {
  // Extract mean values for comparison
  const vector1 = extractFeatureVector(features1)
  const vector2 = extractFeatureVector(features2)

  if (vector1.length !== vector2.length || vector1.length === 0) {
    return 0
  }

  // Cosine similarity
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i]
    norm1 += vector1[i] * vector1[i]
    norm2 += vector2[i] * vector2[i]
  }

  const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  return Math.max(0, Math.min(1, (similarity + 1) / 2)) // Normalize to 0-1
}

export const flattenFeatureVector = (features) => extractFeatureVector(features)

/**
 * Extract a flat feature vector from aggregated features
 */
const extractFeatureVector = (features) => {
  const vector = []
  
  Object.keys(features).forEach((key) => {
    const value = features[key]
    if (typeof value === 'object' && value !== null) {
      if (value.mean !== undefined) {
        if (Array.isArray(value.mean)) {
          vector.push(...value.mean)
        } else {
          vector.push(value.mean)
        }
      }
    }
  })
  
  return vector
}

