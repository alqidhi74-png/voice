# FFmpeg Installation Guide

## Why FFmpeg is Needed

The audio preprocessing service uses FFmpeg to:
- Resample audio to 16kHz
- Normalize audio levels
- Apply noise reduction
- Trim silence (VAD)
- Convert audio formats

## Installation

### Windows

**Option 1: Using Chocolatey (Recommended)**
```powershell
# Install Chocolatey if you don't have it
# Then run:
choco install ffmpeg
```

**Option 2: Manual Installation**
1. Download FFmpeg from: https://www.gyan.dev/ffmpeg/builds/
2. Extract the ZIP file
3. Add FFmpeg `bin` folder to your system PATH:
   - Open System Properties → Environment Variables
   - Add `C:\path\to\ffmpeg\bin` to PATH
4. Restart your terminal/PowerShell

**Option 3: Using Scoop**
```powershell
scoop install ffmpeg
```

### macOS

**Using Homebrew:**
```bash
brew install ffmpeg
```

### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

### Linux (CentOS/RHEL)

```bash
sudo yum install ffmpeg
```

## Verify Installation

After installation, verify FFmpeg is working:

```bash
ffmpeg -version
```

You should see output like:
```
ffmpeg version 6.x.x
...
```

## Troubleshooting

### "ffmpeg is not recognized"

**Windows**: Make sure FFmpeg is in your PATH:
```powershell
# Check if it's in PATH
$env:PATH -split ';' | Select-String ffmpeg

# If not found, add it manually
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\path\to\ffmpeg\bin", "User")
```

**macOS/Linux**: Make sure it's installed:
```bash
which ffmpeg
# Should show: /usr/local/bin/ffmpeg or similar
```

### Server Starts But Audio Processing Fails

If the server starts but audio processing fails:
1. Check FFmpeg is installed: `ffmpeg -version`
2. Check server logs for FFmpeg errors
3. Verify FFmpeg has permissions to read/write files

## Alternative: Skip FFmpeg (Development Only)

If you want to test the server without FFmpeg (audio processing will fail):
1. Comment out the preprocessing calls in `enroll.js` and `verify.js`
2. The server will start but audio processing won't work

**Note**: This is only for development. Production requires FFmpeg.

---

**Status**: FFmpeg installation required for audio processing ✅

