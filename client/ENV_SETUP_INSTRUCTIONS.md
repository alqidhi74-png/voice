# Client Environment Setup

Follow these steps to align the Vite client with the current backend + ML microservices stack.

---

## 1. Create `.env.local`

In `client/`, create a `.env.local` (or `.env`) file with the following base variables:

```env
# API routing
VITE_API_BASE_URL=http://localhost:5001/api

# Google OAuth (required for Sign-In button)
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# Firebase Auth config (mirrors server Firebase project)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef123456
```

> **Why 5001?** The Node/Express API runs on port `5001` when started via `npm run dev`. Update the URL if you bind the server elsewhere.

---

## 2. Retrieve Values

### Google Client ID
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Select (or create) the project used for OAuth.
3. Navigate to **APIs & Services → Credentials**.
4. Create an **OAuth client ID** (`Web application`).
5. Add `http://localhost:5173` to **Authorized JavaScript origins**.
6. Copy the Client ID into `VITE_GOOGLE_CLIENT_ID`.

### Firebase Config
1. Go to the Firebase console → **Project settings**.
2. Under **Your apps**, locate the Web app configuration.
3. Copy each value (`apiKey`, `authDomain`, etc.) into the matching `VITE_FIREBASE_*` variable.
4. Ensure every value stays on a single line (no extra quotes).

---

## 3. Restart Vite After Changes

Vite only reads environment variables at boot. Whenever you edit `.env.local`, restart the dev server:

```bash
# Stop the dev server (Ctrl+C)
npm run dev
```

---

## 4. Verify the Setup

- Load the app at `http://localhost:5173`.
- Use Google Sign-In: the OAuth popup should appear instead of 400 errors.
- After a successful verification run, play back the voice result. The **Feature Delta Network** tracer and the **Embedding Preview (first 64 dimensions)** chart should advance together; if they drift, restart the client to reload the synced visualisation logic.

---

## FAQs

- **Where does the file live?** → `client/.env.local`
- **Will git pick this up?** → No; `.env*` is ignored.
- **Can I use HTTPS?** → Yes, update `VITE_API_BASE_URL` and add the new origin to Google OAuth.
- **Seeing missing Firebase config errors?** → Double-check every `VITE_FIREBASE_*` value is present and spelled correctly.

