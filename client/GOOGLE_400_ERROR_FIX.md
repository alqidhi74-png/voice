# Fixing Google OAuth 400 Error

## Error Message
```
400. That's an error.
The server cannot process the request because it is malformed. It should not be retried.
```

## Common Causes

### 1. OAuth Consent Screen Not Configured

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. Make sure it's configured with:
   - **User Type**: External (for public apps)
   - **App name**: Voice Identity Shield
   - **User support email**: Your email
   - **Developer contact**: Your email
   - **Scopes**: At minimum, add `email`, `profile`, `openid`
4. Click **Save and Continue** through all steps
5. For production, click **PUBLISH APP** (not required for testing with your own account)

### 2. Missing or Incorrect Authorized JavaScript Origins

**Solution:**
1. Go to **APIs & Services** → **Credentials**
2. Click on your OAuth 2.0 Client ID
3. Under **Authorized JavaScript origins**, make sure you have:
   - `http://localhost:5173` (for development)
   - `http://localhost:3000` (if testing on different port)
   - Your production domain (for production)
4. Click **Save**

### 3. Client ID Format Issue

**Check:**
- Your Client ID should end with `.apps.googleusercontent.com`
- Example: `123456789-abc123def456.apps.googleusercontent.com`
- Make sure there are no extra spaces or characters in your `.env` file

### 4. Multiple Initializations

The code now prevents multiple initializations which can cause 400 errors.

### 5. Browser Cache Issues

**Solution:**
1. Clear browser cache and cookies
2. Clear cookies specifically for `accounts.google.com`
3. Try in an incognito/private window

## Step-by-Step Verification

1. **Check `.env` file:**
   ```env
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```
   - No quotes around the value
   - No extra spaces
   - Ends with `.apps.googleusercontent.com`

2. **Verify OAuth Consent Screen:**
   - Go to Google Cloud Console
   - Check that all required fields are filled
   - For testing, add yourself as a test user if in testing mode

3. **Check Authorized Origins:**
   - Must include `http://localhost:5173`
   - Must match exactly (including http:// and port)

4. **Restart Dev Server:**
   - After changing `.env`, always restart your dev server
   - Environment variables are only loaded on startup

5. **Test in Incognito:**
   - Open incognito/private window
   - Try signing in
   - This eliminates cache/cookie issues

## Testing the Configuration

1. **Verify Client ID is loaded:**
   - Open browser console
   - Check that there are no errors about missing Client ID
   - The Google Sign-In button should appear

2. **Check Network Requests:**
   - Open DevTools → Network tab
   - Try signing in
   - Look for requests to `accounts.google.com`
   - Check the error response if any

3. **Verify Redirect URI:**
   - The redirect URI should match your authorized origins
   - For Google Identity Services, the redirect is handled automatically
   - Make sure your origin is in the authorized list

## Still Getting 400 Error?

1. **Create a New OAuth Client ID:**
   - Sometimes recreating the client ID fixes configuration issues
   - Delete the old one and create a new one
   - Update your `.env` file with the new Client ID

2. **Check Google Cloud Console Status:**
   - Go to [Google Cloud Status](https://status.cloud.google.com/)
   - Make sure all services are operational

3. **Verify Project Billing:**
   - Some OAuth features require billing to be enabled
   - Check your Google Cloud project billing status

4. **Check Browser Console:**
   - Look for specific error messages
   - The error might give more details about what's malformed

## Quick Checklist

- [ ] OAuth consent screen is configured
- [ ] Client ID is correct format (ends with `.apps.googleusercontent.com`)
- [ ] Authorized JavaScript origins include `http://localhost:5173`
- [ ] `.env` file has correct Client ID (no quotes, no spaces)
- [ ] Dev server restarted after changing `.env`
- [ ] Tested in incognito window
- [ ] Cleared browser cache and cookies
- [ ] Checked browser console for detailed errors

