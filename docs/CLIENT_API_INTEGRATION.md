# Client API Integration Guide

This document explains how the client integrates with the backend API. **All Firebase operations have been moved to the backend** - the client no longer uses Firebase SDK directly.

## 🔄 Architecture Changes

### Before (Old Architecture)
```
Client → Firebase SDK → Firebase Services (Auth, Firestore, Storage)
```

### After (New Architecture)
```
Client → Backend API → Firebase Admin SDK → Firebase Services
```

### Benefits
- ✅ **Better Security**: No Firebase credentials in client
- ✅ **Centralized Logic**: All operations on backend
- ✅ **Easier Maintenance**: Single point of control
- ✅ **Better Error Handling**: Centralized error management
- ✅ **Easier Scaling**: Backend can scale independently

---

## 📦 Client Services

### 1. Authentication API (`services/authApi.js`)

Handles all authentication operations:

```javascript
import * as authApi from '../services/authApi'

// Register
const result = await authApi.register(email, password, userData)

// Login
const result = await authApi.login(email, password)

// Logout
const result = await authApi.logout()

// Get current user
const result = await authApi.getCurrentUser()

// Google OAuth
const result = await authApi.handleGoogleOAuth(credential)

// Apple OAuth
const result = await authApi.handleAppleOAuth(credential)
```

**Token Management**:
- Tokens stored in `localStorage`
- Automatically included in API requests
- Handles token refresh (if implemented)

### 2. User API (`services/userApi.js`)

Handles user profile and voiceprint operations:

```javascript
import * as userApi from '../services/userApi'

// Get user profile
const result = await userApi.getUserProfile()

// Update user profile
const result = await userApi.updateUserProfile({ displayName: 'New Name' })

// Get voiceprint
const result = await userApi.getVoiceprint()

// Get all voiceprints (multi-recording support)
const list = await userApi.getVoiceprints()

// Store voiceprint
const result = await userApi.storeVoiceprint(voiceprintData, encryptionKey, name)

// Update voiceprint name
const result = await userApi.updateVoiceprintName('New Name', voiceprintId)

// Delete voiceprint
const result = await userApi.deleteVoiceprint(voiceprintId)
```

### 3. Storage API (`services/storageApi.js`)

Handles file storage operations:

```javascript
import * as storageApi from '../services/storageApi'

// Upload file
const result = await storageApi.uploadVoiceFile(file, fileName)

// Download file
const result = await storageApi.downloadFileAsArrayBuffer(storagePath)

// Get file URL
const result = await storageApi.getFileDownloadURL(storagePath)

// Delete file
const result = await storageApi.deleteVoiceFile(storagePath)
```

### 4. General API (`services/api.js`)

Handles enrollment and verification:

```javascript
import { enrollVoice, verifyVoice } from '../services/api'

// Enroll voice
const result = await enrollVoice(audioBlob, 'My Voice')

// Verify voice
const result = await verifyVoice(audioBlob, targetUserId)
```

---

## 🔧 Configuration

### Environment Variables

**Client (`.env`)**:
```env
# Backend API URL
VITE_API_BASE_URL=http://localhost:3000/api

# Google OAuth (optional)
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

**Note**: Client no longer needs Firebase configuration variables. All Firebase operations are handled by the backend.

### Backend Configuration

**Server (`.env`)**:
```env
# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="..."
FIREBASE_CLIENT_EMAIL=...

# Firebase Web API Key (for Auth REST API)
FIREBASE_WEB_API_KEY=AIza...

# Frontend URL
FRONTEND_URL=http://localhost:5173

# CORS
ALLOWED_ORIGINS=http://localhost:5173
```

---

## 🔐 Authentication Flow

### 1. Registration
```
Client → POST /api/auth/register → Backend → Firebase Admin SDK → Create User
Client ← { idToken, refreshToken, user } ← Backend
Client → Store tokens in localStorage
```

### 2. Login
```
Client → POST /api/auth/login → Backend → Firebase Auth REST API → Verify Password
Client ← { idToken, refreshToken, user } ← Backend
Client → Store tokens in localStorage
```

### 3. Authenticated Requests
```
Client → GET /api/user/profile
       → Include: Authorization: Bearer <idToken>
       → Backend → Verify token → Return data
Client ← { success: true, data: {...} } ← Backend
```

### 4. OAuth (Google)
```
Client → Google Identity Services → Get credential
Client → POST /api/auth/oauth/google { credential }
       → Backend → Verify credential → Create/Update user
Client ← { idToken, user } ← Backend
Client → Store tokens in localStorage
```

---

## 📡 API Endpoints Reference

### Authentication

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "displayName": "John Doe",
  "age": 25,
  "phoneNumber": "+1234567890",
  "gender": "male",
  "country": "USA"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "uid": "user-id",
      "email": "user@example.com",
      "displayName": "John Doe"
    },
    "idToken": "firebase-id-token",
    "refreshToken": "refresh-token",
    "expiresIn": "3600"
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <idToken>
```

### User Profile

#### Get Profile
```http
GET /api/user/profile
Authorization: Bearer <idToken>
```

#### Update Profile
```http
PUT /api/user/profile
Authorization: Bearer <idToken>
Content-Type: application/json

{
  "displayName": "New Name",
  "age": 30,
  "phoneNumber": "+1234567890",
  "gender": "female",
  "country": "Canada"
}
```

### Voiceprint

#### Get Voiceprint
```http
GET /api/user/voiceprint
Authorization: Bearer <idToken>
```

#### List Voiceprints
```http
GET /api/user/voiceprints
Authorization: Bearer <idToken>
```

Response snapshot:
```json
{
  "success": true,
  "data": [
    {
      "id": "voiceprint123",
      "name": "Work Meeting Voice",
      "audioStoragePath": "users/uid/voiceprints/voiceprint123/file.encrypted",
      "encryptionKey": "hex_encoded_key",
      "timestamp": "2025-11-09T08:15:14.000Z"
    }
  ]
}
```

> **Legacy note:** Voiceprints enrolled before 2025-11-09 may not have an entry in `voiceprintKeys`; add the missing hex key to restore download/decryption before calling the playback helper.

#### Store Voiceprint
```http
POST /api/user/voiceprint
Authorization: Bearer <idToken>
Content-Type: application/json

{
  "voiceprintData": {
    "encryptedFeatures": "...",
    "audioStoragePath": "users/uid/voices/file.webm",
    "audioUrl": "https://...",
    "duration": 30.5,
    "sampleRate": 16000
  },
  "encryptionKey": "encryption-key",
  "name": "My Voice Recording"
}
```

#### Update Voiceprint Name
```http
PUT /api/user/voiceprint/name
Authorization: Bearer <idToken>
Content-Type: application/json

{
  "voiceprintId": "voiceprint123",
  "name": "New Name"
}
```

#### Delete Voiceprint
```http
DELETE /api/user/voiceprint
Authorization: Bearer <idToken>
Content-Type: application/json

{
  "voiceprintId": "voiceprint123"
}
```

### Storage

#### Upload File
```http
POST /api/storage/upload
Authorization: Bearer <idToken>
Content-Type: multipart/form-data

file: <File>
fileName: "voice.webm" (optional)
```

Response:
```json
{
  "success": true,
  "data": {
    "url": "https://storage.googleapis.com/...",
    "path": "users/uid/voices/voice.webm",
    "fileName": "voice.webm"
  }
}
```

#### Download File
```http
GET /api/storage/download/users/{userId}/voices/{fileName}
Authorization: Bearer <idToken>
```

Returns: File binary data

#### Get File URL
```http
GET /api/storage/url/users/{userId}/voices/{fileName}
Authorization: Bearer <idToken>
```

Response:
```json
{
  "success": true,
  "data": {
    "url": "https://storage.googleapis.com/...",
    "path": "users/uid/voices/file.webm"
  }
}
```

#### Delete File
```http
DELETE /api/storage/delete/users/{userId}/voices/{fileName}
Authorization: Bearer <idToken>
```

---

## 🧪 Testing

### Test API Connection

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

3. **Check health endpoint** (from browser console):
```javascript
fetch('http://localhost:3000/api/health')
  .then(r => r.json())
  .then(console.log)
```

### Test Authentication

1. **Register user**:
   - Go to Register page
   - Fill form and submit
   - Check browser console for API calls
   - Verify tokens are stored in localStorage

2. **Login user**:
   - Go to Login page
   - Enter credentials
   - Check Network tab for `/api/auth/login`
   - Verify tokens are stored

3. **Get current user**:
   - After login, check Network tab
   - Look for `/api/auth/me` call
   - Verify user data is returned

### Test User Operations

1. **Update profile**:
   - Go to Profile page
   - Click "Edit Profile"
   - Make changes and save
   - Check Network tab for `/api/user/profile` PUT request

2. **Get voiceprint**:
   - Go to Dashboard
   - Check Network tab for `/api/user/voiceprint` GET request

### Test Storage Operations

1. **Upload file**:
   - Go to Enroll page
   - Record audio
   - Upload
   - Check Network tab for `/api/storage/upload` request

2. **Download file**:
   - In Dashboard, click "Play Audio"
   - Check Network tab for `/api/storage/download/*` request

---

## 🐛 Troubleshooting

### API Not Working

**Symptoms**:
- Console shows API errors
- Requests fail with 401/403/500

**Solutions**:
1. Check backend server is running: `curl http://localhost:3000/api/health`
2. Verify `VITE_API_BASE_URL` in client `.env`
3. Check CORS settings in backend `.env`
4. Verify tokens are stored: `localStorage.getItem('idToken')`
5. Check browser console for detailed errors

### CORS Errors

**Error**: `CORS policy violation`

**Solution**:
1. Add client URL to `ALLOWED_ORIGINS` in `server/.env`
2. Restart backend server
3. Check URL matches exactly (including `http://` and port)

### Authentication Errors

**Error**: `401 Unauthorized`

**Solutions**:
1. Check token exists: `localStorage.getItem('idToken')`
2. Verify token is valid (check expiry)
3. Try logging in again to get new token
4. Check backend logs for authentication errors

### File Upload Errors

**Error**: `File too large` or `Invalid file type`

**Solutions**:
1. Check `MAX_FILE_SIZE` in backend `.env` (default: 10MB)
2. Verify audio format is supported
3. Check file size is under limit
4. Verify user is authenticated

### Storage Path Errors

**Error**: `Access denied` or `File not found`

**Solutions**:
1. Verify storage path belongs to current user
2. Check file exists in Firebase Storage
3. Verify authentication token is valid
4. Check backend logs for detailed errors

---

## 📊 Response Format

All API responses follow this format:

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error message"
}
```

---

## 🔒 Security Features

### Implemented
- ✅ Token-based authentication
- ✅ All requests require authentication
- ✅ Path validation on storage operations
- ✅ User isolation enforced on backend
- ✅ CORS protection
- ✅ Rate limiting
- ✅ Input validation

### Token Management
- Tokens stored in `localStorage`
- Automatically included in requests
- Backend validates all tokens
- Tokens expire (Firebase default: 1 hour)

---

## 🚀 Next Steps

1. **Implement Token Refresh**: Add automatic token refresh logic
2. **Error Handling**: Improve error messages and user feedback
3. **Loading States**: Add better loading indicators
4. **Retry Logic**: Add automatic retry for failed requests
5. **Offline Support**: Add service worker for offline functionality

---

**Status**: Client fully integrated with backend API ✅

All Firebase operations now go through the backend for better security and centralized management.
