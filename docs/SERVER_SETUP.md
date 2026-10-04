# Backend Server Setup Guide

## Overview

The backend server handles all Firebase operations (Firestore, Storage, Auth) and provides a secure API for the client. All Firebase operations are server-side only for better security.

## Step 1: Get Firebase Admin SDK Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** (gear icon)
4. Click **Service Accounts** tab
5. Click **Generate New Private Key**
6. Download the JSON file

## Step 2: Extract Credentials from JSON

The downloaded JSON has this structure:
```json
{
  "project_id": "your-project-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
  "private_key_id": "...",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

## Step 3: Get Firebase Web API Key (for Auth REST API)

1. In Firebase Console, go to **Project Settings**
2. Scroll to **Your apps** section
3. Find your web app (or create one)
4. Copy the **API Key** value (starts with "AIza...")

## Step 4: Configure Server

1. **Navigate to server directory**:
```bash
cd server
```

2. **Install dependencies**:
```bash
npm install
```

3. **Create `.env` file**:
```bash
cp .env.example .env
```

4. **Edit `.env` file** with your Firebase credentials:
```env
PORT=3000
NODE_ENV=development

# Firebase Admin SDK Credentials (from JSON file)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/...

# Firebase Web API Key (for Auth REST API)
FIREBASE_WEB_API_KEY=AIzaSy...

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# CORS - Add your client URL
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

**Important**: 
- Keep the `\n` characters in `FIREBASE_PRIVATE_KEY`
- Wrap the private key in quotes if it contains special characters
- Add your client URL to `ALLOWED_ORIGINS`
- The `FIREBASE_WEB_API_KEY` is needed for email/password login

## Step 5: Start the Server

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start
```

You should see:
```
✅ Firebase Admin SDK initialized from environment variables
🚀 Server running on port 3000
📝 Environment: development
🌐 CORS enabled for: http://localhost:5173, http://localhost:3000
```

## Step 6: Test the Server

### Test Health Endpoint
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 1.234,
  "environment": "development"
}
```

### Test Authentication Endpoints

#### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "displayName": "Test User"
  }'
```

#### Login User
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Response includes `idToken` which should be used for authenticated requests.

#### Get Current User (Authenticated)
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
```

### Test User Operations

#### Get User Profile
```bash
curl -X GET http://localhost:3000/api/user/profile \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
```

#### Update User Profile
```bash
curl -X PUT http://localhost:3000/api/user/profile \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Updated Name",
    "age": 25
  }'
```

### Test Storage Operations

#### Upload File
```bash
curl -X POST http://localhost:3000/api/storage/upload \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE" \
  -F "file=@path/to/file.webm" \
  -F "fileName=test-voice.webm"
```

#### Download File
```bash
curl -X GET "http://localhost:3000/api/storage/download/users/USER_ID/voices/file.webm" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE" \
  --output downloaded-file.webm
```

## API Endpoints Summary

### Authentication (`/api/auth`)
- `POST /register` - Register new user
- `POST /login` - Login user
- `POST /logout` - Logout user
- `GET /me` - Get current user
- `POST /oauth/google` - Google OAuth
- `POST /oauth/apple` - Apple OAuth
- `POST /verify-token` - Verify token

### User (`/api/user`)
- `GET /profile` - Get user profile
- `PUT /profile` - Update user profile
- `GET /voiceprint` - Get voiceprint
- `POST /voiceprint` - Store voiceprint
- `PUT /voiceprint/name` - Update voiceprint name
- `DELETE /voiceprint` - Delete voiceprint

### Storage (`/api/storage`)
- `POST /upload` - Upload file
- `GET /download/*` - Download file
- `GET /url/*` - Get file URL
- `DELETE /delete/*` - Delete file

### Voice Operations (`/api/enroll`, `/api/verify`)
- `POST /enroll` - Enroll voice (full pipeline: preprocessing → features → encryption → storage)
- `POST /verify` - Verify voice (full pipeline: preprocessing → features → matching → anti-spoof → decision)

### Audit (`/api/audit`)
- `GET /user` - Get user audit events
- `GET /operation/:operation` - Get events by operation type (enroll, verify, etc.)

## Troubleshooting

### Error: "Firebase Admin credentials not configured"
- Check that `.env` file exists
- Verify all Firebase variables are set
- Ensure private key has `\n` for newlines
- Check that file is in `server/` directory

### Error: "CORS policy violation"
- Add your client URL to `ALLOWED_ORIGINS` in `.env`
- Restart server after changing `.env`
- Check that URL matches exactly (including port)

### Error: "Port already in use"
- Change `PORT` in `.env` to a different port
- Or stop the process using port 3000

### Error: "Cannot find module"
- Run `npm install` in the `server` directory
- Check that `node_modules` exists

### Error: "FIREBASE_WEB_API_KEY is required"
- Get the Web API Key from Firebase Console
- Add it to `.env` file
- Restart server

### Error: "Invalid token" during login
- Check that `FIREBASE_WEB_API_KEY` is correct
- Verify email/password are correct
- Check Firebase Auth is enabled in console

## Security Notes

1. **Never commit `.env` file** - It's in `.gitignore`
2. **Firebase credentials are server-side only** - Never expose to client
3. **All operations are authenticated** - Requires valid token
4. **Path validation** - Storage paths are validated for user isolation
5. **Rate limiting** - Enabled on all endpoints

## Core Services

The server includes the following core services:

### Audio Processing
- **Audio Preprocessing** (`services/audioPreprocessor.js`)
  - Noise reduction, VAD, normalization, resampling to 16kHz
  - FFmpeg-based processing

### Feature Extraction
- **Feature Extraction Service** (`services/featureExtractor.js`)
  - Service ready for X-Vector/ECAPA-TDNN integration
  - Currently uses placeholder embeddings (ready for ML model)

### Anti-Spoof Detection
- **Anti-Spoof Service** (`services/antiSpoof.js`)
  - Service ready for anti-spoof model integration
  - Currently uses placeholder scores (ready for ML model)

### Score Fusion & Decision
- **Score Fusion Service** (`services/scoreFusion.js`)
  - Combines match score and anti-spoof score
  - Decision thresholds: ACCEPT/CHALLENGE/REJECT
  - Risk scoring and confidence levels

### Encryption
- **Encryption Service** (`services/encryption.js`)
  - AES-256-GCM authenticated encryption
  - Voiceprint ID generation (SHA-256)
  - Integrated into enrollment/verification flows

### Audit Logging
- **Audit Logger** (`services/auditLogger.js`)
  - Comprehensive event logging
  - Integrity hashes for tamper-evidence
  - Automatic logging in all operations

## Next Steps

Once the server is running:
1. Test enrollment: `POST /api/enroll` (with audio file)
2. Test verification: `POST /api/verify` (with audio file)
3. View audit logs: `GET /api/audit/user`
4. Test all authentication flows
5. Test user and profile operations
6. Test storage operations

See `docs/CLIENT_API_INTEGRATION.md` for client setup details.

---

**Status**: Server ready with full pipeline! Core services complete, ML models pending. 🚀
