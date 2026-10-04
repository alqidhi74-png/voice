# 🎙️ Voice Identity Shield

A web-based cybersecurity platform that protects users from AI voice impersonation attacks using encrypted biometric voice authentication.

## 🚀 Features

### Authentication & User Management
- **Multi-Provider Authentication**: Email/Password, Google Sign-In, and Apple Sign-In
- **User Profiles**: Complete profile management with editable information
- **Protected Routes**: Secure access control - features only available after login
- **Session Management**: Automatic login state tracking and logout functionality

### Voice Protection
- **Voice Enrollment**: Record and encrypt your voice to create a unique voiceprint
  - Record 10-60 seconds of audio
  - Live preview of extracted voice metrics (duration, RMS, energy, centroid, more)
  - Custom naming for voice recordings
  - Audio playback before upload
  - Encrypted storage in Firebase
- **Voice Verification**: Compare new recordings against your voiceprint to detect deepfakes
  - Record verification audio with a post-capture review/confirm step
  - Dual scoring: cosine similarity + anti-spoof risk
  - Similarity override policy: match score ≥ 85% auto-accepts, < 60% auto-rejects regardless of auxiliary scores
  - Feature drift analytics (L2 distance, mean |Δ|, top shifting dimensions)
  - Verdict fusion (Authentic, Challenge, Reject) with confidence bands
  - Verification history tracking with audit metadata
- **Real-time Analysis & Visualisation**
  - Meyda.js extracts MFCC, RMS, energy, spectral centroid, chroma, and more
  - 3D Feature Delta Network animated by the verification result
  - **Embedding Preview (first 64 dimensions) stays in sync with audio playback** for intuitive comparisons
  - Features persisted alongside each enrollment for future comparison
- **AES-256 Encryption**: Secure client-side encryption before storage
  - Encrypted voice features + embeddings (AES-256-GCM)
  - Encrypted audio files
  - Per-user encryption keys, decrypted only server-side
- **Analytics Dashboard**: Track verification history with interactive charts
  - Trend lines for similarity/final score
  - Verdict distribution summaries
  - Rich score breakdown panels
- **Voiceprint Management**: 
  - Manage multiple encrypted voiceprints per user with playlist-style selection
  - Persist friendly recording names across devices and sessions
  - Play back encrypted recordings from the dashboard (auto-decrypts with stored keys)
  - Rename or delete individual voiceprints with Storage cleanup
  - Heads up: recordings enrolled before 2025-11-09 may need an encryption-key backfill for playback

### User Experience
- **Modern UI**: Cybersecurity-themed design with smooth animations
- **Immersive Visualization**: 3D acoustic islands with a playback-synced pulsing core
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Smart Phone Input**: Country code selector with search and auto-formatting
- **Public Landing Page**: Informative website before login, protected system after

## 🛠️ Tech Stack

### Frontend
- **Framework**: React + Vite
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion + React Three Fiber (Feature Delta Network)
- **Routing**: React Router DOM
- **Charts**: Recharts (line + bar + synced cursor overlays)
- **Audio Analysis**: Meyda.js
- **Encryption**: CryptoJS (AES-256)

### Backend
- **Runtime**: Node.js + Express (port 5001)
- **Authentication**: Firebase Admin SDK (server-side only)
- **Database**: Firebase Firestore (via Admin SDK)
- **Storage**: Firebase Storage (via Admin SDK)
- **Security**: Helmet, CORS, Rate Limiting
- **Logging**: Pino-style logger wrapper
- **Scoring**: Cosine similarity + anti-spoof fusion + drift penalties
- **Indexes**: Firestore composite index on `audit_events` (`userId` asc, `timestamp` desc)

### ML Microservices
- **Embedding Service**: FastAPI (SpeechBrain ECAPA), port 8000
- **Anti-Spoof Service**: FastAPI heuristic model, port 8001
- **Audio Preprocessing**: FFmpeg front-loaded in the Node service

### Architecture
- **Client**: Talks only to the Node API (no direct Firebase SDK usage)
- **Backend**: Orchestrates Firebase + ML services + encryption
- **Security**: Token-based authentication, centralized operations, encrypted artefacts

## 📦 Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Voice_Identity_Shield
   ```

2. **Install dependencies:**
   ```bash
   cd client
   npm install
   ```

3. **Start ML services first:**
   ```bash
   cd ../ml
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn services.embedding_service:app --port 8000
   # new terminal
   uvicorn services.antispoof_service:app --port 8001
   ```

4. **Set up Backend:**
   - Configure environment variables in `server/.env` (see `docs/SERVER_SETUP.md`)
   - Start the API server:
     ```bash
     cd ../server
     npm install
     npm run dev  # http://localhost:5001
     ```

5. **Set up Client:**
   - Create `client/.env.local` with API + Firebase credentials (see `client/ENV_SETUP_INSTRUCTIONS.md`)
   - Start Vite in another terminal:
     ```bash
     cd ../client
     npm run dev  # http://localhost:5173
     ```

6. **Build for production:**
   ```bash
   npm run build
   ```

## 🎯 Usage

### Getting Started

1. **Visit the Website**
   - Open the app in your browser
   - Browse the public landing page to learn about the project

2. **Create an Account**
   - Click "Sign Up" in the navigation
   - Register with Email/Password, Google, or Apple
   - Complete your profile (optional: age, phone, gender, country)

3. **Access Protected Features** (After Login)
   - **Enroll**: Record and store your voiceprint
     - Record 10-60 seconds of audio
     - Live feature preview (energy, RMS, centroid, duration, more)
     - Name your voice recording
     - Playback before uploading
     - Encrypted storage in Firebase
   - **Verify**: Compare voices for authenticity
     - Record verification audio
     - Receive match score, synthetic score, fused final score, and verdict
     - Watch the Feature Delta Network and Embedding Preview move together with playback
     - View verification history with detailed audit entries
   - **Dashboard**: View verification history and manage all enrolled voices
     - Interactive charts and statistics
     - Multi-recording management (select, rename, delete individual enrollments)
     - Audio playback for any enrolled voice (auto-decrypts with stored keys)
   - **Profile**: Manage your account information

### User Profile Management
- Edit your profile information anytime
- Update phone number with smart country code selector
- View member since date and last login
- All data securely stored in Firestore

## 🎨 Design System

The application uses a cybersecurity-themed color palette:
- **Primary**: Royal Green (#00C853)
- **Accent**: Neon Emerald (#00FF88)
- **Background**: Night Void (#101418)
- **Cards**: Stealth Gray (#182028)

See `Color_Palette.md` for complete color specifications.

## 📁 Project Structure

```
voice-identity-shield/
├── client/                   # React frontend application (Vite)
│   ├── src/
│   │   ├── components/       # Reusable UI & 3D visualisations
│   │   │   ├── ResultCard.jsx        # Verification summary + synced charts
│   │   │   ├── BiometricIslands.jsx  # Feature Delta Network (React Three Fiber)
│   │   │   └── ...
│   │   ├── pages/            # Page-level views (Home, Enroll, Verify, Dashboard, Profile)
│   │   ├── contexts/         # Auth + UI contexts
│   │   ├── services/         # REST clients, encryption helpers
│   │   ├── hooks/            # Recorder + analytics hooks
│   │   ├── utils/            # Audio/Meyda utilities
│   │   └── styles/
│   ├── public/
│   ├── env docs (see `ENV_SETUP_INSTRUCTIONS.md`)
│   └── package.json
├── server/                   # Node/Express API (port 5001)
│   ├── src/
│   │   ├── routes/           # enroll, verify, audit, storage, user, health
│   │   ├── services/         # audioPreprocessor, featureExtractor, antiSpoof, scoreFusion, encryption
│   │   ├── middleware/       # auth, rateLimiter, errorHandler
│   │   ├── config/           # firebase admin bootstrap
│   │   └── utils/            # logger, helpers
│   ├── uploads/              # temp workspace for FFmpeg (gitignored)
│   └── package.json
├── ml/                       # FastAPI microservices
│   ├── services/embedding_service.py   # SpeechBrain ECAPA embeddings
│   ├── services/antispoof_service.py   # Heuristic anti-spoof scoring
│   └── config/model_manifest.json      # Tunable thresholds
└── docs/                     # Comprehensive documentation set
    ├── README.md
    ├── RUNBOOK.md
    ├── SERVER_SETUP.md
    ├── CLIENT_API_INTEGRATION.md
    ├── IMPLEMENTATION_PLAN.md
    └── ...

## 🔒 Security Features

### Implemented
- **Backend-Only Firebase**: All Firebase operations server-side only
- **Token-Based Authentication**: JWT tokens for API authentication
- **Centralized Operations**: All Firebase operations via backend API
- **Path Validation**: Storage paths validated for user isolation
- **Rate Limiting**: API rate limiting on all endpoints
- **CORS Protection**: Cross-origin resource sharing protection
- **Protected Routes**: Authentication-required pages
- **Client-side Encryption**: AES-256 voice encryption
- **Secure Storage**: Firebase Storage with backend validation

### Coming Soon
- Automated backfill tooling for legacy enrollments missing encryption keys
- Expanded deepfake detection models beyond current heuristic placeholders
- Optional cold-storage tiers for dormant encrypted voiceprints

## ✅ Current Status

### Completed (Core Milestones)
- ✅ React + Vite client with Tailwind design system
- ✅ Firebase Authentication (email/password, Google, Apple)
- ✅ Voice enrollment & encrypted storage
- ✅ Voice verification with cosine similarity scoring
- ✅ Anti-spoof heuristic integration + risk scoring
- ✅ Score fusion & decision engine (match vs. synthetic weighting + drift penalties)
- ✅ Feature Delta Network visualisation with playback-synced embedding preview
- ✅ Analytics dashboard & audit history (Firestore-backed)
- ✅ Node/Express backend with Firebase Admin SDK
- ✅ FFmpeg preprocessing + SpeechBrain embedding microservice
- ✅ Comprehensive audit logging pipeline

### In Progress
- ⏳ Upgrade anti-spoof service to production-ready model (AASIST-lite)
- ⏳ Advanced anomaly detection + behavioural analytics
- ⏳ Automated key rotation & KMS-backed encryption workflows

## 🚀 Future Enhancements

- TensorFlow.js or ONNX Runtime for advanced deepfake detection
- Multi-language support
- API integration for communication apps
- Blockchain-based voiceprint storage
- Real-time voice call verification

## 👨‍💻 Author

**Talal Ahmed Al Aidarus**  
University of Technology and Applied Sciences – Muscat  
*Cybersecurity | AI | Web Development | Voice Biometrics*

## 📄 License

This project is for educational and demonstration purposes.
