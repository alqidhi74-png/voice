# 🔧 Firebase Storage CORS Configuration

## Why CORS Configuration is Needed

When downloading files from Firebase Storage in a web browser, you may encounter CORS (Cross-Origin Resource Sharing) errors. This happens because browsers enforce security policies that prevent cross-origin requests.

## Solution: Configure CORS for Firebase Storage

### Step 1: Install Google Cloud SDK

#### Option A: Windows Installation (Recommended)

1. **Download the installer:**
   - Go to: https://cloud.google.com/sdk/docs/install#windows
   - Download the "Google Cloud SDK Installer for Windows"
   - Or direct link: https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe

2. **Run the installer:**
   - Double-click the downloaded `.exe` file
   - Follow the installation wizard
   - Make sure "Run gcloud init" is checked (or you can do it manually later)

3. **Verify installation:**
   - Open PowerShell or Command Prompt
   - Run: `gcloud --version`
   - You should see version information

#### Option B: Using Package Manager (Windows)

If you have Chocolatey installed:
```powershell
choco install gcloudsdk
```

#### Option C: macOS Installation

```bash
# Using Homebrew
brew install google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install#mac
```

#### Option D: Linux Installation

```bash
# Download and run the install script
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### Step 2: Authenticate with Google Cloud

1. **Open PowerShell or Command Prompt**

2. **Login to Google Cloud:**
   ```bash
   gcloud auth login
   ```
   - This will open your browser
   - Sign in with the Google account associated with your Firebase project
   - Grant permissions

3. **Verify authentication:**
   ```bash
   gcloud auth list
   ```
   - You should see your account listed

### Step 3: Set Your Firebase Project

1. **Find your Firebase Project ID:**
   - Go to Firebase Console → Project Settings (gear icon)
   - Your Project ID is shown at the top (e.g., `voice-identity-shield`)

2. **Set the project in gcloud:**
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```
   
   Example:
   ```bash
   gcloud config set project voice-identity-shield
   ```

3. **Verify it's set:**
   ```bash
   gcloud config get-value project
   ```

### Step 4: Create CORS Configuration File

Create a file named `cors.json` in your project root:

```json
[
  {
    "origin": [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5173",
      "https://your-production-domain.com"
    ],
    "method": ["GET", "HEAD"],
    "responseHeader": [
      "Content-Type",
      "Content-Length",
      "Content-Range"
    ],
    "maxAgeSeconds": 3600
  }
]
```

**Important Notes:**
- Add all your development and production domains
- Replace `your-production-domain.com` with your actual domain
- The Firebase SDK uses `getBytes()` which requires GET and HEAD methods

### Step 5: Apply CORS Configuration

Find your Storage bucket name:
1. Go to Firebase Console → Storage
2. Look at the URL or bucket name (usually `your-project-id.appspot.com`)

Apply the CORS configuration:

```bash
gsutil cors set cors.json gs://YOUR_BUCKET_NAME
```

For example:
```bash
gsutil cors set cors.json gs://voice-identity-shield.appspot.com
```

### Step 6: Verify CORS Configuration

Check if CORS is configured:

```bash
gsutil cors get gs://YOUR_BUCKET_NAME
```

### Alternative: Quick Test Mode (Less Secure)

For development only, you can allow all origins (NOT recommended for production):

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["*"],
    "maxAgeSeconds": 3600
  }
]
```

## Important Notes

1. **Blaze Plan Required**: Your Firebase project must be on the **Blaze (pay-as-you-go) plan** to configure CORS. The free Spark plan doesn't support custom CORS settings.

2. **Upgrade to Blaze Plan**:
   - Go to Firebase Console → Project Settings → Usage and billing
   - Click "Upgrade" to Blaze plan
   - Don't worry - you only pay for what you use, and the free tier is generous

3. **After Configuration**: 
   - Restart your development server
   - Clear browser cache
   - Try downloading the audio again

## Troubleshooting

**"Command not found: gsutil"**
- Make sure Google Cloud SDK is installed
- Add gsutil to your PATH

**"Access Denied"**
- Make sure you're authenticated: `gcloud auth login`
- Verify you have permissions on the Firebase project

**Still getting CORS errors?**
- Check that CORS was applied: `gsutil cors get gs://YOUR_BUCKET_NAME`
- Make sure your origin (localhost:3000) is in the CORS config
- Clear browser cache and try again
- Check browser console for the exact error message

## Testing

After configuring CORS, test by:
1. Going to Dashboard
2. Clicking "Play Recording"
3. The audio should download and play without CORS errors

