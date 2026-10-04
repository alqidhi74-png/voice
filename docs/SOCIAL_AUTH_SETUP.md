# 🔐 Social Authentication Setup (Google & Apple)

## Overview

Your app now supports:
- ✅ Email/Password authentication
- ✅ Google Sign-In
- ✅ Apple Sign-In

## Google Sign-In Setup

### Step 1: Enable Google Provider in Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `voice-identity-shield`
3. Go to **Authentication** → **Sign-in method**
4. Click on **Google**
5. Toggle **Enable**
6. Enter a **Project support email** (your email)
7. Click **Save**

### Step 2: Configure OAuth Consent Screen (if needed)

If you haven't set up OAuth consent screen:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to **APIs & Services** → **OAuth consent screen**
4. Fill in required information:
   - User type: External (for public use)
   - App name: Voice Identity Shield
   - User support email: Your email
   - Developer contact: Your email
5. Add scopes (default is fine)
6. Add test users (optional for development)
7. Save

### Step 3: Add Authorized Domains

1. In Firebase Console → **Authentication** → **Settings**
2. Scroll to **Authorized domains**
3. Add your domain (localhost is already there for development)
4. For production, add your deployed domain

## Apple Sign-In Setup

### Step 1: Enable Apple Provider in Firebase

1. Go to Firebase Console → **Authentication** → **Sign-in method**
2. Click on **Apple**
3. Toggle **Enable**
4. Click **Save**

### Step 2: Configure Apple Developer Account

**Note:** Apple Sign-In requires an Apple Developer account ($99/year)

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Create an App ID
3. Enable "Sign in with Apple" capability
4. Create a Service ID
5. Configure domains and redirect URLs

### Step 3: Add OAuth Configuration

1. In Firebase Console → **Authentication** → **Sign-in method** → **Apple**
2. Enter your:
   - **Services ID**
   - **Apple Team ID**
   - **Key ID**
   - **Private Key** (download from Apple Developer)

### Step 4: Configure OAuth Redirect URLs

In Apple Developer Portal:
- Add redirect URL: `https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler`

## Testing Social Authentication

### Test Google Sign-In:
1. Go to `/register` or `/login`
2. Click "Google" button
3. Select Google account
4. Grant permissions
5. Should redirect to dashboard

### Test Apple Sign-In:
1. Go to `/register` or `/login`
2. Click "Apple" button
3. Sign in with Apple ID
4. Grant permissions
5. Should redirect to dashboard

## How It Works

### New Users (First Time):
1. User clicks Google/Apple button
2. Authenticates with provider
3. Firebase creates user account
4. App checks Firestore for user profile
5. If no profile exists, creates one with:
   - Email (from provider)
   - Display name (from provider)
   - Age, phone, gender, country = null
6. User can complete profile later

### Existing Users:
1. User clicks Google/Apple button
2. Authenticates with provider
3. Firebase recognizes existing account
4. App updates `lastLogin` timestamp
5. Redirects to dashboard

## Troubleshooting

### Google Sign-In Issues:

**"Popup blocked" error:**
- Check browser popup settings
- Make sure domain is authorized in Firebase

**"OAuth client not found":**
- Verify OAuth consent screen is configured
- Check that Google provider is enabled in Firebase

### Apple Sign-In Issues:

**"Apple Sign-In not available":**
- Requires Apple Developer account
- Check that Apple provider is enabled
- Verify Service ID configuration

**"Invalid client":**
- Check Service ID matches Firebase config
- Verify redirect URLs are correct

### General Issues:

**Profile not created:**
- Check Firestore rules allow user to write
- Check browser console for errors
- Verify Firestore is enabled

**Redirect not working:**
- Check that authorized domains include your domain
- Verify redirect URLs in provider settings

## Security Notes

- Social auth uses OAuth 2.0 (secure)
- User data is stored in Firestore (encrypted)
- Each user can only access their own data
- Tokens are managed by Firebase (secure)

## Production Checklist

Before deploying:
- [ ] Configure OAuth consent screen (Google)
- [ ] Set up Apple Developer account (Apple)
- [ ] Add production domain to authorized domains
- [ ] Test both providers
- [ ] Verify Firestore rules
- [ ] Test profile creation flow

## Support

If you encounter issues:
1. Check Firebase Console → Authentication → Users
2. Check browser console for errors
3. Verify provider settings in Firebase
4. Check Firestore rules

