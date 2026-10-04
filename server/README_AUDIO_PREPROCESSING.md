# Audio Preprocessing Service

## Overview

The audio preprocessing service handles server-side audio processing as per the Technical Plan requirements:
- **Noise Reduction**: High-pass filter to remove low-frequency noise
- **VAD (Voice Activity Detection)**: Trims silence from start and end
- **Normalization**: Peak normalization to -16 LUFS
- **Resampling**: Converts to 16kHz mono (as per Technical Plan)

## Dependencies

The service uses **FFmpeg** for audio processing. You need to install FFmpeg on your system:

### Windows
```bash
# Using Chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
```

### macOS
```bash
brew install ffmpeg
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

### Verify Installation
```bash
ffmpeg -version
```

## Usage

### In Enrollment Endpoint

```javascript
import { preprocessAudio, validateAudioFile } from '../services/audioPreprocessor.js'

// Validate audio
const validation = await validateAudioFile(filePath)
if (!validation.valid) {
  // Handle error
}

// Preprocess
const result = await preprocessAudio(inputPath, outputPath, {
  enableDenoise: true,
  enableVAD: true,
  enableNormalize: true,
  targetSampleRate: 16000
})
```

### Processing Options

- `enableDenoise` (default: true) - Apply noise reduction
- `enableVAD` (default: true) - Trim silence
- `enableNormalize` (default: true) - Normalize audio levels
- `targetSampleRate` (default: 16000) - Target sample rate in Hz

## Output Format

Processed audio is saved as:
- **Format**: WAV
- **Sample Rate**: 16kHz (configurable)
- **Channels**: Mono (1 channel)
- **Bit Depth**: 16-bit PCM
- **Codec**: PCM S16LE

## Validation

Audio files are validated for:
- **Minimum Duration**: 10 seconds
- **Maximum Duration**: 60 seconds
- **Format**: Must be readable by FFmpeg

## File Management

Temporary files are automatically cleaned up after processing. The service:
1. Processes original file
2. Saves processed version
3. Deletes original file
4. Returns processed file path

## Error Handling

The service handles errors gracefully:
- Invalid audio files → Returns validation error
- Processing failures → Returns detailed error message
- VAD failures → Falls back to original file (logs warning)

## Next Steps

After preprocessing, the audio is ready for:
1. Feature extraction (X-Vector/ECAPA-TDNN)
2. Voiceprint creation
3. Verification matching

---

**Status**: Audio preprocessing implemented ✅

