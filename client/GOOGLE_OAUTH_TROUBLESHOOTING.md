# Google OAuth Troubleshooting Guide

## Common Errors and Solutions

### 1. "ERR_FAILED" and CORS Errors

**Error Messages:**
- `The fetch of the id assertion endpoint resulted in a network error: ERR_FAILED`
- `Server did not send the correct CORS headers`
- `[GSI_LOGGER]: FedCM get() rejects with IdentityCredentialError`

**Cause:**
These errors occur when Google Identity Services tries to use FedCM (Federated Credential Management) which requires proper CORS configuration from Google's servers. This is typically a client-side configuration issue, not a server issue.

**Solutions:**

1. **Disable FedCM (Already done in code):**
   - The code now sets `use_fedcm_for_prompt: false` to avoid FedCM issues
   - This uses the traditional popup flow instead

2. **Verify OAuth Consent Screen Configuration:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to **APIs & Services** → **OAuth consent screen**
   - Make sure it's configured as **External** (for public apps)
   - Verify all required fields are filled:
     - App name
     - User support email
     - Developer contact information
     - Scopes (at minimum: email, profile, openid)

3. **Check Authorized JavaScript Origins:**
   - Go to **APIs & Services** → **Credentials**
   - Click on your OAuth 2.0 Client ID
   - Under **Authorized JavaScript origins**, make sure you have:
     - `http://localhost:5173` (for development)
     - `http://localhost:3000` (if testing on different port)
     - Your production domain (for production)

4. **Verify Client ID:**
   - Make sure the Client ID in your `.env` file matches the one in Google Cloud Console
   - The Client ID should end with `.apps.googleusercontent.com`
   - Restart your dev server after changing the `.env` file

5. **Clear Browser Cache:**
   - Clear cookies for `accounts.google.com`
   - Clear browser cache
   - Try in an incognito/private window

### 2. "Google Client ID not configured"

**Solution:**
- Create a `.env` file in the `client/` directory
- Add: `VITE_GOOGLE_CLIENT_ID=your-client-id-here`
- Restart the development server

### 3. "OAuth client not found" or "Invalid client"

**Solutions:**
- Verify the Client ID is correct in `.env`
- Check that OAuth consent screen is published (not in testing mode for production)
- Make sure the Client ID is for a "Web application" type, not "Desktop app" or other types

### 4. Sign-In Popup Not Showing

**Solutions:**
- Check browser popup blocker settings
- Make sure `http://localhost:5173` is in authorized JavaScript origins
- Try in a different browser
- Clear browser cache and cookies

### 5. "Failed to render Google Sign-In button"

**Solutions:**
- Verify Google Identity Services script is loading (check browser console)
- Check network tab for failed requests to `accounts.google.com`
- Verify Client ID is correct
- Make sure you're not blocking Google's scripts with ad blockers

## Step-by-Step Verification

1. **Check `.env` file:**
   ```bash
   # Should be in client/.env
   VITE_GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
   ```

2. **Verify Google Cloud Console:**
   - OAuth consent screen is configured
   - OAuth 2.0 Client ID exists
   - Authorized JavaScript origins include your domain

3. **Check Browser Console:**
   - No CORS errors
   - Google Identity Services script loads successfully
   - No network errors

4. **Test in Incognito:**
   - Open an incognito/private window
   - Try signing in
   - This eliminates cache/cookie issues

## Still Having Issues?

1. **Check Google Cloud Console Status:**
   - Go to [Google Cloud Status](https://status.cloud.google.com/)
   - Make sure Google Identity Services is operational

2. **Verify Firebase Configuration (if using Firebase):**
   - Make sure Google Sign-In is enabled in Firebase Console
   - Check that the same project is used in both Firebase and Google Cloud Console

3. **Test with Minimal Setup:**
   - Create a new OAuth client ID
   - Use a fresh browser profile
   - Test with minimal scopes

4. **Check Network Requests:**
   - Open browser DevTools → Network tab
   - Try signing in
   - Look for failed requests to `accounts.google.com` or `googleapis.com`
   - Check the error messages in failed requests

## Additional Resources

- [Google Identity Services Documentation](https://developers.google.com/identity/gsi/web)
- [OAuth 2.0 Setup Guide](https://developers.google.com/identity/protocols/oauth2)
- [Troubleshooting OAuth](https://developers.google.com/identity/protocols/oauth2/policies)

