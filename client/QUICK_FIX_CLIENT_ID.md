# Quick Fix: Invalid Google Client ID Format

## Error Message
```
Invalid Google Client ID format. It should end with .apps.googleusercontent.com
```

## Quick Fix (3 Steps)

### Step 1: Check if `.env` file exists
1. Navigate to the `client/` directory
2. Check if a file named `.env` exists
3. If it doesn't exist, create it

### Step 2: Add/Update the Client ID

Open `client/.env` and add or update:

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
```

**Important:**
- ❌ **NO quotes** around the value
- ❌ **NO spaces** before or after the `=`
- ✅ Should end with `.apps.googleusercontent.com`
- ✅ Should look like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`

### Step 3: Get Your Client ID

If you don't have a Client ID yet:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Choose **Web application**
6. Add **Authorized JavaScript origins**:
   - `http://localhost:5173`
7. Click **Create**
8. **Copy the Client ID** (looks like: `123456789-abc.apps.googleusercontent.com`)
9. Paste it in your `.env` file

### Step 4: Restart Dev Server

**CRITICAL:** After changing `.env`, you MUST restart your development server:

```bash
# Stop the server (Ctrl+C)
# Then restart:
cd client
npm run dev
```

## Common Mistakes

### ❌ Wrong Format Examples:
```env
# Has quotes - WRONG
VITE_GOOGLE_CLIENT_ID="123456789-abc.apps.googleusercontent.com"

# Has spaces - WRONG
VITE_GOOGLE_CLIENT_ID = 123456789-abc.apps.googleusercontent.com

# Missing value - WRONG
VITE_GOOGLE_CLIENT_ID=

# Wrong format - WRONG
VITE_GOOGLE_CLIENT_ID=123456789-abc
```

### ✅ Correct Format:
```env
VITE_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
```

## Verification

After fixing, you should:
1. ✅ See no error about Client ID format
2. ✅ Be able to click the Google Sign-In button
3. ✅ See the Google Sign-In modal/popup

## Still Having Issues?

1. **Double-check the file location:**
   - Must be in `client/.env` (not `server/.env`)
   - Must be named exactly `.env` (not `.env.example`)

2. **Check for hidden characters:**
   - Open `.env` in a text editor
   - Make sure there are no invisible characters
   - Try recreating the file

3. **Verify the Client ID:**
   - Go back to Google Cloud Console
   - Check that the Client ID matches exactly
   - Make sure you copied the entire Client ID

4. **Clear and restart:**
   ```bash
   # Stop server
   # Delete node_modules/.vite cache (optional)
   rm -rf node_modules/.vite
   # Restart server
   npm run dev
   ```

## Need Help?

- See `client/GOOGLE_OAUTH_SETUP.md` for detailed setup instructions
- See `client/GOOGLE_400_ERROR_FIX.md` for OAuth configuration help

