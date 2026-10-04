# Google OAuth Setup Guide

## Quick Setup

### Step 1: Get Google Client ID

1. **Go to Google Cloud Console**: [https://console.cloud.google.com/](https://console.cloud.google.com/)

2. **Select or Create a Project**:
   - If you have a Firebase project, select it
   - Otherwise, create a new project

3. **Enable Google Sign-In API**:
   - Go to **APIs & Services** → **Library**
   - Search for "Google Sign-In API" or "Identity Toolkit API"
   - Click **Enable** (if not already enabled)

4. **Configure OAuth Consent Screen**:
   - Go to **APIs & Services** → **OAuth consent screen**
   - Choose **External** (for public use) or **Internal** (for organization only)
   - Fill in required fields:
     - App name: `Voice Identity Shield`
     - User support email: Your email
     - Developer contact: Your email
   - Click **Save and Continue**
   - Add scopes (default is fine)
   - Add test users (optional for development)
   - Click **Save**

5. **Create OAuth Client ID**:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Choose **Web application**
   - Add **Authorized JavaScript origins**:
     - `http://localhost:5173` (for development)
     - `http://localhost:3000` (if testing on different port)
     - Your production domain (e.g., `https://yourdomain.com`)
   - Add **Authorized redirect URIs** (optional, not needed for Google Identity Services):
     - `http://localhost:5173`
     - Your production domain
   - Click **Create**
   - **Copy the Client ID** (it looks like: `123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com`)

### Step 2: Add to Environment Variables

1. **Create `.env` file** in the `client` directory (if it doesn't exist)

2. **Add the following**:
   ```env
   # Backend API URL
   VITE_API_BASE_URL=http://localhost:3000/api

   # Google OAuth Client ID
   VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   ```

3. **Replace `your-client-id-here.apps.googleusercontent.com`** with your actual Client ID

### Step 3: Restart Development Server

After adding the environment variable, restart your development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

**Important**: Environment variables are only loaded when the server starts, so you must restart after changing `.env`!

## Verification

1. **Check that `.env` file exists** in `client/` directory
2. **Verify the Client ID** is correct (should end with `.apps.googleusercontent.com`)
3. **Restart the dev server** after adding the variable
4. **Try Google Sign-In** - the error should be gone!

## Troubleshooting

### "Google Client ID not configured"
- Make sure `.env` file exists in `client/` directory
- Check that `VITE_GOOGLE_CLIENT_ID` is set correctly
- Restart the development server after adding the variable
- Verify there are no typos in the variable name

### "OAuth client not found" or "Invalid client"
- Verify the Client ID is correct
- Check that OAuth consent screen is configured
- Make sure `http://localhost:5173` is in authorized JavaScript origins
- Try creating a new OAuth client ID

### "Popup blocked"
- Check browser popup settings
- Make sure your domain is in authorized JavaScript origins
- Try in an incognito/private window

### Sign-In prompt not showing
- This is normal if you've signed in recently
- Try clearing cookies for `accounts.google.com`
- The prompt may be skipped if you're already signed in

## Alternative: Using Firebase OAuth Client ID

If you're using Firebase, you can also use the Firebase OAuth client ID:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** → **General**
4. Scroll down to **Your apps** section
5. Find your Web app or create one
6. Copy the **Web API Key** (this is different from OAuth Client ID)
7. However, for Google Sign-In, you still need to create an OAuth Client ID in Google Cloud Console as described above

## Production Setup

For production:

1. Add your production domain to **Authorized JavaScript origins**
2. Update `.env` or set environment variable in your hosting platform
3. Make sure OAuth consent screen is published (not in testing mode)

## Security Notes

- Never commit `.env` file to version control (it's in `.gitignore`)
- The Client ID is safe to expose in frontend code (it's public)
- However, keep your backend API keys secret!

