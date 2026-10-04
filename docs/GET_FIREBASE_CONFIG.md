# Firebase Configuration Guide (Backend Only)

**⚠️ IMPORTANT**: This project uses **Firebase Admin SDK on the backend only**. The client does NOT need Firebase configuration.

## For Backend Setup

The backend needs Firebase Admin SDK credentials. See `docs/SERVER_SETUP.md` for complete setup instructions.

### Quick Setup

1. **Get Firebase Admin SDK Credentials**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Project Settings → Service Accounts
   - Generate New Private Key
   - Download JSON file

2. **Extract credentials to `server/.env`**:
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
   FIREBASE_WEB_API_KEY=AIzaSy... (from Project Settings → Your apps)
   ```

3. **See `docs/SERVER_SETUP.md`** for complete configuration

## For Client Setup

**The client does NOT need Firebase configuration.**

Client only needs:
```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id (optional, for OAuth)
```

## Why This Architecture?

### Before (Old)
- Client → Firebase SDK → Firebase Services
- Firebase credentials in client code
- Security concerns with exposed keys

### After (New)
- Client → Backend API → Firebase Admin SDK → Firebase Services
- No Firebase credentials in client
- Better security and centralized control

## Benefits

✅ **Better Security**: No Firebase keys in client  
✅ **Centralized Logic**: All operations on backend  
✅ **Easier Maintenance**: Single point of control  
✅ **Better Error Handling**: Centralized error management  
✅ **Easier Scaling**: Backend can scale independently  

## Need Help?

- **Backend Setup**: See `docs/SERVER_SETUP.md`
- **Firebase Setup**: See `docs/FIREBASE_SETUP.md`
- **Client Integration**: See `docs/CLIENT_API_INTEGRATION.md`

---

**Status**: Client no longer needs Firebase configuration ✅
