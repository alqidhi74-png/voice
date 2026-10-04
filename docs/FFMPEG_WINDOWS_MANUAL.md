# FFmpeg Manual Installation for Windows

## Quick Manual Installation (No Admin Required)

### Step 1: Download FFmpeg

1. Go to: https://www.gyan.dev/ffmpeg/builds/
2. Download **ffmpeg-release-essentials.zip** (or latest version)
3. Extract the ZIP file to a location like:
   - `C:\ffmpeg`
   - `D:\Tools\ffmpeg`
   - Or any folder you have write access to

### Step 2: Add to PATH (User-level, no admin needed)

**Option A: Using PowerShell (Current Session Only)**
```powershell
# Replace with your actual FFmpeg path
$env:Path += ";C:\ffmpeg\bin"
```

**Option B: Add to User PATH Permanently**
```powershell
# Replace with your actual FFmpeg path
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\ffmpeg\bin", "User")
```

**Option C: Manual PATH Setup**
1. Press `Win + R`, type `sysdm.cpl`, press Enter
2. Go to "Advanced" tab → "Environment Variables"
3. Under "User variables", find "Path" and click "Edit"
4. Click "New" and add: `C:\ffmpeg\bin` (or your FFmpeg bin path)
5. Click OK on all dialogs
6. **Restart PowerShell** for changes to take effect

### Step 3: Verify Installation

Close and reopen PowerShell, then:
```powershell
ffmpeg -version
```

You should see FFmpeg version information.

## Alternative: Use FFmpeg Without PATH

If you can't add to PATH, you can modify the code to use a specific FFmpeg path. But adding to PATH is recommended.

---

**Note**: After adding to PATH, you must restart your terminal/PowerShell for it to work.

