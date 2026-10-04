# 🔥 Firebase Setup Guide (Backend Only)

**IMPORTANT**: This project uses **Firebase Admin SDK on the backend only**. The client does NOT use Firebase SDK directly.

## Architecture Overview

```
┌─────────┐         ┌─────────┐         ┌─────────┐
│ Client  │ ───API──>│ Backend │ ──SDK──>│Firebase │
│         │         │         │         │         │
│ No SDK  │         │ Admin   │         │Services │
└─────────┘         └─────────┘         └─────────┘
```

- **Client**: Uses backend API only (no Firebase SDK)
- **Backend**: Uses Firebase Admin SDK (server-side)
- **Firebase**: Provides Auth, Firestore, Storage services

---

## Prerequisites

- A Google account
- Node.js and npm installed
- Backend server setup (see `SERVER_SETUP.md`)

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter your project name: `voice-identity-shield` (or your preferred name)
4. Disable Google Analytics (optional) or enable it if you want analytics
5. Click **"Create project"**
6. Wait for the project to be created, then click **"Continue"**

## Step 2: Enable Authentication

1. In your Firebase project, click on **"Authentication"** in the left sidebar
2. Click **"Get started"** if you haven't enabled it yet
3. Go to the **"Sign-in method"** tab
4. Enable **"Email/Password"**:
   - Click on **"Email/Password"**
   - Enable the first toggle (Email/Password)
   - Click **"Save"**
5. Enable **"Google"** (for OAuth):
   - Click on **"Google"**
   - Enable the toggle
   - Enter a project support email
   - Click **"Save"**
6. Enable **"Apple"** (optional, for OAuth):
   - Click on **"Apple"**
   - Enable the toggle
   - Configure Apple Sign-In (requires Apple Developer account)
   - Click **"Save"**

## Step 3: Set Up Firebase Storage

1. Click on **"Storage"** in the left sidebar
2. Click **"Get started"**
3. Choose **"Start in production mode"** (backend handles security)
4. Select a location for your storage bucket (choose the closest to your users)
5. Click **"Done"**

### Storage Security Rules

Update the security rules to restrict access:

1. Go to **Storage** → **Rules** tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Only authenticated users can access files
    // Backend validates user ownership
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Click **"Publish"**

**Note**: Backend enforces user isolation, so these rules allow authenticated access. Backend validates that users can only access their own files.

## Step 4: Set Up Firestore Database

1. Click on **"Firestore Database"** in the left sidebar
2. Click **"Create database"**
3. Choose **"Start in production mode"** (backend handles security)
4. Select a location (same as Storage)
5. Click **"Enable"**

### Firestore Security Rules

Update the security rules:

1. Go to **Firestore Database** → **Rules** tab
2. Update the rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users can access
    // Backend validates user ownership
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /voiceprints/{voiceprintId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Click **"Publish"**

**Note**: Backend enforces additional security checks, so these rules provide a first layer of protection.

### Firestore Composite Indexes

`GET /api/verify/history` queries the `audit_events` collection by `userId` and orders by `timestamp`. Create this index once so verification history loads without falling back to cached data:

1. Go to **Firestore Database** → **Indexes** → **Composite**
2. Click **"Create index"**
3. Choose collection `audit_events`
4. Add fields:
   - `userId` — **Ascending**
   - `timestamp` — **Descending**
5. Leave query scope as **Collection**
6. Click **"Create"** and wait for the index to finish building

If the API responds with `Firestore index required`, follow the link included in the error to auto-fill the same configuration.

## Step 5: Get Firebase Admin SDK Credentials

1. In Firebase Console, click on **"Project Settings"** (gear icon)
2. Go to **"Service Accounts"** tab
3. Click **"Generate New Private Key"**
4. Click **"Generate Key"** in the confirmation dialog
5. Download the JSON file (keep it secure!)

## Step 6: Get Firebase Web API Key

1. In Firebase Console, go to **"Project Settings"**
2. Scroll to **"Your apps"** section
3. If you don't have a web app, click the **Web icon** (`</>`) and register one
4. Copy the **API Key** value (starts with "AIza...")
5. This is needed for the backend to use Firebase Auth REST API

## Step 7: Configure Backend Server

1. **Navigate to server directory**:
```bash
cd server
```

2. **Create `.env` file**:
```bash
cp .env.example .env
```

3. **Extract credentials from JSON file**:
   - Open the downloaded JSON file
   - Copy values to `.env` file (see `SERVER_SETUP.md` for format)

4. **Add Firebase Web API Key**:
```env
FIREBASE_WEB_API_KEY=AIzaSy... (your API key)
```

5. **Complete `.env` file**:
```env
PORT=3000
NODE_ENV=development

# Firebase Admin SDK (from JSON file)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY_ID=...
FIREBASE_CLIENT_ID=...
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=...

# Firebase Web API Key (for Auth REST API)
FIREBASE_WEB_API_KEY=AIzaSy...

# Frontend URL
FRONTEND_URL=http://localhost:5173

# CORS
ALLOWED_ORIGINS=http://localhost:5173

# Other settings
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

## Step 8: Configure Client (No Firebase SDK Needed)

1. **Navigate to client directory**:
```bash
cd client
```

2. **Create `.env` file**:
```env
# Backend API URL
VITE_API_BASE_URL=http://localhost:3000/api

# Google OAuth Client ID (optional, for Google Sign-In)
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

**Note**: Client does NOT need Firebase configuration. All Firebase operations are handled by the backend.

## Step 9: Get Google OAuth Client ID (Optional)

If you want to use Google Sign-In:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project (or create API credentials)
3. Go to **"APIs & Services"** → **"Credentials"**
4. Click **"Create Credentials"** → **"OAuth client ID"**
5. Choose **"Web application"**
6. Add authorized JavaScript origins:
   - `http://localhost:5173` (for development)
   - Your production domain (for production)
7. Copy the **Client ID**
8. Add to client `.env`: `VITE_GOOGLE_CLIENT_ID=your-client-id`

## Step 10: Test Your Setup

1. **Start backend server**:
```bash
cd server
npm run dev
```

2. **Start client**:
```bash
cd client
npm run dev
```

3. **Test registration**:
   - Go to Register page
   - Create an account
   - Check Firebase Console → Authentication → Users

4. **Test login**:
   - Login with your credentials
   - Verify authentication works

5. **Test storage**:
   - Enroll a voice
   - Check Firebase Console → Storage → Files

## Troubleshooting

### "Firebase Admin credentials not configured"
- Check that `server/.env` file exists
- Verify all Firebase variables are set
- Ensure private key has `\n` for newlines
- Check file is in `server/` directory (not root)

### "FIREBASE_WEB_API_KEY is required"
- Get Web API Key from Firebase Console
- Add to `server/.env` file
- Restart backend server

### "CORS policy violation"
- Add client URL to `ALLOWED_ORIGINS` in `server/.env`
- Restart backend server
- Verify URL matches exactly

### "Authentication failed" during login
- Check `FIREBASE_WEB_API_KEY` is correct
- Verify Email/Password auth is enabled in Firebase Console
- Check credentials are correct

### Storage upload fails
- Check Storage is enabled in Firebase Console
- Verify Storage rules are published
- Check backend logs for errors
- Verify user is authenticated

### Firestore operations fail
- Check Firestore is enabled in Firebase Console
- Verify Firestore rules are published
- Check backend logs for errors
- Verify user is authenticated

## Security Best Practices

1. **Never commit `.env` files** - They should be in `.gitignore`
2. **Keep Firebase credentials secure** - Store in environment variables only
3. **Use production security rules** - Before deploying to production
4. **Enable Firebase App Check** - For production (optional but recommended)
5. **Regularly review Firebase usage** - Monitor usage in Firebase Console
6. **Rotate credentials** - Periodically rotate service account keys
7. **Limit API access** - Use Firebase security rules as first layer
8. **Backend validation** - Backend enforces additional security checks

## Important Notes

### Client Does NOT Use Firebase SDK
- ✅ Client uses backend API only
- ✅ No Firebase configuration needed in client
- ✅ No Firebase SDK in `package.json`
- ✅ All operations go through backend

### Backend Uses Firebase Admin SDK
- ✅ Backend has full Firebase access
- ✅ Backend enforces user isolation
- ✅ Backend validates all operations
- ✅ Backend handles all Firebase operations

### Security Benefits
- ✅ No Firebase credentials exposed to client
- ✅ Centralized authentication
- ✅ Better access control
- ✅ Easier to monitor and audit
- ✅ Easier to scale

## Next Steps

After completing this setup:
- ✅ Users can register and login via backend API
- ✅ Voice files can be uploaded via backend API
- ✅ User data is stored in Firestore via backend
- ✅ All operations are authenticated and secure
- ✅ Ready to implement voice enrollment and verification

## Additional Resources

- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Firebase Authentication Guide](https://firebase.google.com/docs/auth)
- [Firebase Storage Guide](https://firebase.google.com/docs/storage)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)

---

**Status**: Firebase configured for backend-only architecture ✅
