# 🚀 Quick Setup Guide

## Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Google account (for Firebase)

## Architecture Overview

This project uses a **backend-only Firebase architecture**:
- **Client**: Uses backend API only (no Firebase SDK)
- **Backend**: Uses Firebase Admin SDK (all Firebase operations)
- **Security**: Token-based authentication, centralized operations

## Installation Steps

### 1. Clone and Install Dependencies

```bash
# Clone repository
git clone <repository-url>
cd Voice_Identity_Shield

# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### 2. Set Up Backend

1. **Configure Firebase Admin SDK**:
   - Follow `docs/SERVER_SETUP.md` for complete setup
   - Get Firebase Admin SDK credentials from Firebase Console
   - Configure `server/.env` with Firebase credentials

2. **Required Environment Variables** (`server/.env`):
   ```env
   PORT=3000
   NODE_ENV=development
   
   # Firebase Admin SDK
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
   FIREBASE_WEB_API_KEY=AIzaSy...
   
   # Frontend URL
   FRONTEND_URL=http://localhost:5173
   
   # CORS
   ALLOWED_ORIGINS=http://localhost:5173
   ```

3. **Start Backend Server**:
   ```bash
   cd server
   npm run dev
   ```

### 3. Set Up Client

1. **Configure Client Environment** (`client/.env`):
   ```env
   # Backend API URL
   VITE_API_BASE_URL=http://localhost:3000/api
   
   # Google OAuth (optional)
   VITE_GOOGLE_CLIENT_ID=your-google-client-id
   ```

   **Note**: Client does NOT need Firebase configuration. All Firebase operations are handled by the backend.

2. **Start Client**:
   ```bash
   cd client
   npm run dev
   ```

### 4. Set Up Firebase (Backend)

1. **Create Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project
   - See `docs/FIREBASE_SETUP.md` for detailed instructions

2. **Enable Services**:
   - Enable Authentication (Email/Password, Google)
   - Enable Firestore Database
   - Enable Storage

3. **Get Admin SDK Credentials**:
   - Project Settings → Service Accounts
   - Generate New Private Key
   - Download JSON file
   - Extract credentials to `server/.env`

4. **Get Web API Key**:
   - Project Settings → Your apps
   - Copy API Key (starts with "AIza...")
   - Add to `server/.env` as `FIREBASE_WEB_API_KEY`

## Running the Application

### Development Mode

**Terminal 1 - Backend**:
```bash
cd server
npm run dev
```

**Terminal 2 - Client**:
```bash
cd client
npm run dev
```

The client will be available at `http://localhost:5173`  
The backend API will be available at `http://localhost:3000/api`

## First Time Usage

### 1. Create an Account
- Open `http://localhost:5173`
- Click "Sign Up" in the navigation
- Choose registration method:
  - **Email/Password**: Fill in name, email, and password
  - **Google**: Sign in with Google account
- After registration, you'll be redirected to the dashboard

### 2. Complete Your Profile (Optional)
- Click "Profile" in the navigation
- Click "Edit Profile"
- Add optional information:
  - Age
  - Phone number (with country code selector)
  - Gender
  - Country
- Click "Save Changes"

### 3. Access Protected Features
After logging in, you can access:
- **Enroll**: Voice enrollment
- **Verify**: Voice verification
- **Dashboard**: Analytics and history
- **Profile**: Manage your account

## Troubleshooting

### Backend Server Not Starting
- Check that `server/.env` file exists
- Verify all Firebase credentials are set
- Ensure private key has `\n` for newlines
- Check port 3000 is not already in use

### Client Can't Connect to Backend
- Verify backend server is running
- Check `VITE_API_BASE_URL` in `client/.env`
- Verify CORS settings in `server/.env`
- Check browser console for errors

### Authentication Errors
- Check Firebase Admin SDK credentials are correct
- Verify `FIREBASE_WEB_API_KEY` is set
- Check Firebase Console → Authentication is enabled
- Verify email/password auth is enabled

### CORS Errors
- Add client URL to `ALLOWED_ORIGINS` in `server/.env`
- Restart backend server after changing `.env`
- Verify URL matches exactly (including port)

### File Upload Errors
- Check `MAX_FILE_SIZE` in `server/.env`
- Verify user is authenticated
- Check backend logs for errors

## Browser Compatibility

- ✅ Chrome/Edge (Recommended)
- ✅ Firefox
- ✅ Safari (may have limited Web Audio API support)
- ❌ Internet Explorer (not supported)

## Development Notes

- **User Data**: Stored in Firebase Firestore via backend API
- **Authentication**: Managed by backend API (Firebase Admin SDK)
- **Storage**: Firebase Storage accessed via backend API
- **Security**: All routes protected, user-specific data access
- **Architecture**: Backend-only Firebase, client uses API only

## Documentation

- **Backend Setup**: `docs/SERVER_SETUP.md`
- **Firebase Setup**: `docs/FIREBASE_SETUP.md`
- **Client Integration**: `docs/CLIENT_API_INTEGRATION.md`
- **API Reference**: See `docs/CLIENT_API_INTEGRATION.md`
- **Architecture**: See `docs/CURRENT_STATUS.md`

## Next Steps

1. ✅ Backend and client are running
2. ✅ User can register and login
3. ✅ Test voice enrollment
4. ✅ Test voice verification
5. ✅ Review analytics dashboard

---

**Status**: Setup complete! Ready for development 🚀
