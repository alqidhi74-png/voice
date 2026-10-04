# DEPRECATED: Firebase Client Configuration Helper

⚠️ **This file is no longer needed for the client.**

The client no longer uses Firebase SDK directly. All Firebase operations are handled by the backend API.

## What Changed

- **Before:** Client needed Firebase configuration (apiKey, authDomain, etc.)
- **Now:** Client only needs `VITE_API_BASE_URL` pointing to your backend
- **Backend:** Backend uses Firebase Admin SDK (server-side only)

## Required Environment Variables (Client)

Only this is needed in `client/.env`:

```
VITE_API_BASE_URL=http://localhost:3000/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id (for OAuth)
```

## Backend Configuration

The backend still needs Firebase Admin SDK credentials (see `server/.env`):
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_WEB_API_KEY` (for Auth REST API)

See `server/ENV_SETUP.md` for backend configuration details.

