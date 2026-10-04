# 🚀 Quick Firebase Setup (5 minutes)

## Step 1: Create Firebase Project

1. Go to https://console.firebase.google.com/
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `voice-identity-shield`
4. Click **"Continue"** → **"Continue"** → **"Create project"**
5. Wait for setup, then click **"Continue"**

## Step 2: Enable Authentication

1. Click **"Authentication"** in left sidebar
2. Click **"Get started"**
3. Go to **"Sign-in method"** tab
4. Click **"Email/Password"**
5. **Enable** the first toggle (Email/Password)
6. Click **"Save"**

## Step 3: Enable Storage

1. Click **"Storage"** in left sidebar
2. Click **"Get started"**
3. Choose **"Start in test mode"**
4. Select location (choose closest to you)
5. Click **"Done"**

## Step 4: Get Your Config

1. Click the **⚙️ gear icon** next to "Project Overview"
2. Click **"Project settings"**
3. Scroll to **"Your apps"** section
4. Click the **Web icon** (`</>`)
5. Register app name: `Voice Identity Shield Web`
6. Click **"Register app"**
7. **Copy the config object** that appears (looks like this):

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

## Step 5: Create .env File

1. In the `client` folder, create a file named `.env`
2. Copy the template from `.env.example`
3. Fill in your values from Step 4:

```env
VITE_FIREBASE_API_KEY=AIza... (from apiKey)
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com (from authDomain)
VITE_FIREBASE_PROJECT_ID=your-project-id (from projectId)
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com (from storageBucket)
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 (from messagingSenderId)
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef (from appId)
```

## Step 6: Restart Dev Server

1. Stop your dev server (Ctrl+C)
2. Start it again:
   ```bash
   npm run dev
   ```

## Step 7: Update Storage Rules (Important!)

1. Go to Firebase Console → **Storage** → **Rules** tab
2. Replace with:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Click **"Publish"**

## ✅ Done!

Your app should now work with Firebase! Try:
- Register a new account at `/register`
- Login at `/login`
- Check Firebase Console → Authentication → Users to see your user

## Troubleshooting

**Still seeing "Firebase not configured"?**
- Make sure `.env` is in the `client` folder (not root)
- Restart dev server after creating `.env`
- Check that all variables start with `VITE_`

**Can't upload files?**
- Check Storage rules are published
- Make sure you're logged in

