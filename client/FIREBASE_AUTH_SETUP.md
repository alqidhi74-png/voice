# Firebase Auth SDK Setup for Google Sign-In

## ✅ What Changed

We've switched from direct Google Identity Services to **Firebase Auth SDK**, which is much simpler and more reliable.

### Before (Complex)
- Direct Google Identity Services
- CORS/FedCM issues
- Complex OAuth flow
- Manual credential handling

### After (Simple)
- Firebase Auth SDK
- No CORS issues
- Standard Firebase flow
- Automatic token management

---

## 🔧 Setup Instructions

### Step 1: Get Firebase Web App Config

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon ⚙️ → **Project Settings**
4. Scroll down to **"Your apps"** section
5. Click the **</>** (Web) icon to add a web app (if you haven't already)
6. Register your app with a nickname (e.g., "Voice Identity Shield Web")
7. Copy the Firebase configuration object

It will look like this:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
}
```

### Step 2: Update `.env` File

Create or update `client/.env` file with:

```env
# Backend API URL
VITE_API_BASE_URL=http://localhost:3000/api

# Firebase Web App Configuration (for Google Sign-In)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

**Important:**
- Replace the values with your actual Firebase config
- No quotes around values
- No spaces around `=`

### Step 3: Enable Google Sign-In in Firebase

1. In Firebase Console, go to **Authentication**
2. Click **Sign-in method** tab
3. Click on **Google**
4. Enable the toggle
5. Enter a **Project support email**
6. Click **Save**

### Step 4: Restart Dev Server

```bash
# Stop server (Ctrl+C)
cd client
npm run dev
```

---

## ✅ Verification

After setup:

1. ✅ No more "Invalid Google Client ID" errors
2. ✅ No CORS/FedCM errors
3. ✅ Google Sign-In button works
4. ✅ Popup opens correctly
5. ✅ Sign-in works smoothly

---

## 🎯 How It Works Now

```
1. User clicks "Sign in with Google"
2. Firebase Auth SDK opens popup
3. User signs in with Google
4. Firebase returns Firebase ID token
5. Client sends ID token to backend
6. Backend verifies token (same as before)
7. User is authenticated
```

**Backend doesn't change** - it still receives and verifies Firebase ID tokens!

---

## 🔒 Security

- ✅ Firebase API key is safe to expose (it's public)
- ✅ Security comes from Firebase security rules
- ✅ Backend still verifies all tokens
- ✅ No sensitive credentials in client

---

## 🐛 Troubleshooting

### "Firebase config is incomplete"
- Check all `VITE_FIREBASE_*` variables are set in `.env`
- Restart dev server after changing `.env`

### "Popup was blocked"
- Allow popups for `localhost:5173`
- Try in incognito window

### "Google sign-in failed"
- Check Google Sign-In is enabled in Firebase Console
- Verify Firebase config is correct
- Check browser console for detailed errors

---

## 📚 Benefits

- ✅ **Simpler**: Less code, fewer errors
- ✅ **Reliable**: No CORS/FedCM issues
- ✅ **Standard**: Uses Firebase's recommended approach
- ✅ **Better UX**: Firebase handles popups, errors, etc.
- ✅ **Automatic**: Token refresh handled automatically

---

**Status**: ✅ Firebase Auth SDK implemented and ready to use!

