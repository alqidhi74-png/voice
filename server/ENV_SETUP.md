# 🔐 Environment Variables Setup Guide

This guide will help you set up your `.env` file with Firebase Admin SDK credentials for secure configuration.

## Quick Setup

### Option 1: Using the Conversion Script (Recommended)

If you have the Firebase service account JSON file:

```bash
# Convert JSON file to .env format (provide path to your JSON file)
node scripts/convert-json-to-env.js path/to/your-service-account.json

# Example if JSON is in Downloads folder:
node scripts/convert-json-to-env.js ../Downloads/voice-identity-shield-firebase-adminsdk-xxxxx.json

# Or use absolute path:
node scripts/convert-json-to-env.js "C:\Users\YourName\Downloads\service-account.json"
```

This will automatically create a `.env` file in the server directory with all required credentials.

### Option 2: Manual Setup

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` file and fill in your Firebase credentials from your service account JSON file.

## Required Environment Variables

### Firebase Admin SDK (Required)

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
```

### Optional Firebase Variables

These have default values but can be customized:

```env
FIREBASE_TYPE=service_account
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/...
FIREBASE_UNIVERSE_DOMAIN=googleapis.com
```

### Server Configuration

```env
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Important Notes

### Private Key Format

When copying the private key to `.env`, you have two options:

**Option 1: Single line with escaped newlines (Recommended)**
```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG...\n-----END PRIVATE KEY-----\n"
```

**Option 2: Multi-line format (if your .env parser supports it)**
```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG...
-----END PRIVATE KEY-----"
```

The code automatically handles `\n` escape sequences, so Option 1 is recommended.

### Security Best Practices

1. ✅ **Never commit `.env` file to version control**
   - The `.env` file is already in `.gitignore`
   - Only commit `.env.example` as a template

2. ✅ **Use environment variables in production**
   - Set environment variables directly in your hosting platform
   - Don't upload `.env` files to production servers

3. ✅ **Rotate credentials regularly**
   - If credentials are compromised, generate new ones in Firebase Console
   - Update `.env` file with new credentials

4. ✅ **Use different credentials for different environments**
   - Development, staging, and production should have separate service accounts
   - Use different `.env` files or environment variables

## Getting Firebase Service Account Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings (gear icon) → Service Accounts
4. Click "Generate new private key"
5. Download the JSON file
6. Use the conversion script or manually extract values to `.env`

## Verification

After setting up your `.env` file, start the server:

```bash
npm start
```

You should see:
```
✅ Firebase Admin SDK initialized from environment variables
🚀 Server running on port 3000
```

If you see an error, check:
- All required variables are set in `.env`
- Private key is properly formatted with `\n` escape sequences
- No extra spaces or quotes around values (except for the private key)
- File is named exactly `.env` (not `.env.txt` or similar)

## Troubleshooting

### Error: "FIREBASE_PROJECT_ID is required in .env file"

- Make sure `.env` file exists in the `server/` directory
- Check that `FIREBASE_PROJECT_ID` is set (no spaces around `=`)
- Verify `dotenv` package is installed

### Error: "FIREBASE_PRIVATE_KEY is required in .env file"

- Ensure private key is in quotes: `FIREBASE_PRIVATE_KEY="..."`
- Check that newlines are escaped: `\n` not actual newlines
- Verify the entire key is on one line

### Error: "Failed to initialize Firebase Admin"

- Verify all required fields are present
- Check that the private key format is correct
- Ensure the service account has proper permissions in Firebase Console

