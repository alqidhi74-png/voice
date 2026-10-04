# 📝 Changelog

All notable changes to the Voice Identity Shield project will be documented in this file.

## [Unreleased]

### Added
- Applied explicit similarity overrides in the verification pipeline so match scores ≥ 0.85 force an ACCEPT decision and scores < 0.60 immediately REJECT, regardless of fused anti-spoof results.

### Changed
- Bypassed feature-drift penalties when a similarity override is triggered to ensure high-confidence matches are not downgraded by secondary heuristics.

## [2025-10-14] Voice Identity Shield v0.4.0
### Added
- Real-time voice activity detection (VAD) during recording to prevent capturing unnecessary silence.

## [Latest] - 2025-11-09

### ✅ Added
- Linked the Feature Delta Network tracer to verification audio playback and fed real-time progress into `ResultCard` so the **Embedding Preview (first 64 dimensions)** chart highlights the active dimension while the clip plays.

### 🔄 Changed
- Refreshed documentation to reflect the synced visualisation flow and current service topology:
  - `client/ENV_SETUP_INSTRUCTIONS.md` now details the full environment schema (`VITE_API_BASE_URL=http://localhost:5001/api`, Google OAuth, Firebase keys) and the playback-sync verification check.
  - `server/README.md` rewritten with ML microservice dependencies, expanded route map, score fusion pipeline, and troubleshooting table.
  - `docs/README.md` updated with the latest feature list, installation order (ML → API → client), architecture breakdown, and milestone status.
  - `RUNBOOK.md` checklist now includes verifying that the Feature Delta Network and embedding chart stay in sync during playback.
- Documented the Firestore composite index required by `GET /api/verify/history` (`audit_events` with `userId` ascending and `timestamp` descending`) so operators can resolve the cached-results fallback.
- Updated setup and progress documentation to call out the index requirement alongside the verification history guidance.

### 🗑️ Removed
- Pruned obsolete, historical docs (`CURRENT_STATUS.md`, `CURRENT_PROGRESS.md`, `DAY1_PROGRESS.md`, `checklist.md`, `PROGRESS_ANALYSIS.md`, `Voice_Identity_Shield_Plan.md`, `SETUP_COMPLETE.md`, `audio_features_list.md`) to keep the documentation set focused on the current architecture.

---

## 2025-11-08

### ✅ Added
- Restored client-side feature preview metrics on the enrollment screen (energy, RMS, spectral centroid, duration, sample rate).
- Included serialized preview features with every enrollment request so the backend can store and audit them.
- Voice enrollment responses now echo the client feature payload to support downstream verification comparisons.
- Firestore user documents now keep a `voiceprintIds` array and per-voiceprint key map (`voiceprintKeys.{voiceprintId}`) while preserving backwards-compatible fields.
- Verification flow now stages recorded audio for review, allowing users to replay, confirm, or re-record before submitting to the backend.
- `/api/verify` returns a biometric comparison snapshot (L2 distance, mean deltas, top dimension shifts) that the client surfaces in the result card and history.

### 🔄 Changed
- Enrollment route logs client feature summaries and persists them alongside existing metadata in both `voiceprints` and `enrollments` collections.
- Updated documentation to reflect the latest feature workflow and multi-voiceprint support.
- Verification result view highlights the new biometric delta stats, and the 3D acoustic “islands” visualization now includes a pulsing core synced with playback activity.

---

## 2025-11-07

### ✅ Added

#### Core Services Implementation
- **Audit Logging System**
  - Comprehensive audit event logging with integrity hashes (SHA-256)
  - Enrollment and verification event tracking
  - Audit API endpoints (`GET /api/audit/user`, `GET /api/audit/operation/:operation`)
  - Automatic logging in enroll/verify endpoints
  - Tamper-evidence via integrity hashes

- **Score Fusion & Policy Decision Engine**
  - Score fusion formula: `final_score = w_match * match_score + w_auth * (1 - synthetic_score)`
  - Decision thresholds: ACCEPT (≥0.85), CHALLENGE (0.7-0.85), REJECT (<0.7)
  - Risk score calculation (0-100)
  - Confidence levels (high, medium, low)
  - Recommended actions based on verdict
  - Fully integrated into verification endpoint

- **AES-256-GCM Encryption Service**
  - Authenticated encryption with integrity verification
  - Proper IV generation (12 bytes for GCM)
  - Authentication tags for tamper detection
  - Voiceprint ID generation (SHA-256)
  - Fully integrated into enrollment and verification flows
  - Replaces old CryptoJS-based encryption

- **Feature Extraction Service**
  - Service structure for X-Vector/ECAPA-TDNN integration
  - Placeholder embedding generation (192-dim vectors)
  - Canonical voiceprint creation (averaging multiple embeddings)
  - Cosine similarity calculation
  - Integrated into enrollment and verification flows

- **Anti-Spoof Detection Service**
  - Service structure for anti-spoof model integration
  - Placeholder synthetic score detection
  - Authenticity score calculation
  - Integrated into verification flow

#### Full Pipeline Integration
- **Enrollment Pipeline Complete**
  - Audio preprocessing → Feature extraction → Voiceprint creation → Encryption → Storage → Audit logging

- **Verification Pipeline Complete**
  - Audio preprocessing → Feature extraction → Voiceprint retrieval & decryption → Cosine similarity → Anti-spoof detection → Score fusion → Decision making → Audit logging

#### New Files
- `server/src/services/auditLogger.js` - Audit logging service
- `server/src/services/scoreFusion.js` - Score fusion and decision engine
- `server/src/services/encryption.js` - AES-256-GCM encryption service
- `server/src/services/featureExtractor.js` - Feature extraction service
- `server/src/services/antiSpoof.js` - Anti-spoof detection service
- `server/src/routes/audit.js` - Audit API endpoints

### 🔄 Changed
- Updated enrollment endpoint to use full pipeline with encryption
- Updated verification endpoint to use full pipeline with score fusion
- Replaced CryptoJS encryption with Node.js crypto (AES-256-GCM)
- Enhanced error handling and logging throughout

### 📊 Progress
- **Overall Backend Progress**: ~85%
- **Core Services**: 100% complete
- **ML Model Integration**: 80% (services ready, models pending)

---

## [Day 1] - 2025-11-XX

### ✅ Added

#### Authentication System
- **Multi-Provider Authentication**
  - Email/Password registration and login
  - Google Sign-In integration
  - Apple Sign-In integration
  - Automatic profile creation for social auth users

#### User Management
- **User Registration Page**
  - Clean registration form
  - Multiple authentication options
  - Form validation
  - Error handling

- **User Login Page**
  - Email/Password login
  - Social authentication buttons
  - Error handling
  - Automatic redirect after login

- **User Profile Page**
  - View profile information
  - Edit profile functionality
  - Smart phone input with country codes
  - Member since calculation
  - Last login display

#### Firebase Integration
- **Firebase Configuration**
  - Complete Firebase SDK setup
  - Environment variable support
  - Error handling for missing config

- **Firestore Database**
  - User data collection structure
  - Security rules implementation
  - User profile CRUD operations
  - Timestamp tracking (createdAt, updatedAt, lastLogin, memberSince)

- **Firebase Storage**
  - Storage configuration
  - Security rules for user-specific files
  - Upload/download utilities
  - Ready for voice file storage

#### UI Components
- **PhoneInput Component**
  - Country code dropdown with 60+ countries
  - Search functionality
  - Auto-formatting (spaces after country code and every 4 digits)
  - Flag emojis for visual identification

- **ProtectedRoute Component**
  - Route protection wrapper
  - Automatic redirect to login
  - Loading states

- **ErrorBoundary Component**
  - React error catching
  - User-friendly error display
  - Error recovery options

#### Navigation
- **Dynamic Navbar**
  - Shows protected routes only when logged in
  - User information display
  - Logout functionality
  - Login/Register buttons for guests

#### Pages
- **Home Page (Public)**
  - Landing page with project information
  - Features showcase
  - Call-to-action buttons (redirect to login if not authenticated)
  - Responsive design

- **Login Page**
  - Email/Password form
  - Social authentication buttons
  - Link to registration

- **Register Page**
  - Registration form
  - Social authentication options
  - Link to login

- **Profile Page**
  - Complete profile management
  - Editable fields
  - Account information display

#### Services
- **Firebase Service** (`firebase.js`)
  - Firebase app initialization
  - Auth, Firestore, Storage exports
  - Configuration management

- **Firestore Service** (`firestore.js`)
  - User profile creation
  - Profile retrieval
  - Profile updates
  - Last login tracking
  - Member since calculations
  - AI-ready data functions

- **Firebase Storage Service** (`firebaseStorage.js`)
  - Voice file upload
  - Voice features upload
  - File deletion
  - File listing
  - Download URL generation

#### Contexts
- **AuthContext**
  - Global authentication state
  - Registration function
  - Login function
  - Logout function
  - Social authentication functions
  - User state management

### 🔧 Changed

- Updated project structure to include Firebase services
- Modified navigation to be authentication-aware
- Updated Home page to redirect protected actions to login
- Changed storage from localStorage to Firebase Firestore

### 📚 Documentation

- Created `FIREBASE_SETUP.md` - Complete Firebase setup guide
- Created `FIRESTORE_RULES.md` - Security rules documentation
- Created `USER_DATA_COLLECTIONS.md` - Data structure guide
- Created `SOCIAL_AUTH_SETUP.md` - Social authentication setup
- Created `GET_FIREBASE_CONFIG.md` - Config extraction guide
- Created `QUICK_FIREBASE_SETUP.md` - Quick setup reference
- Created `SETUP_COMPLETE.md` - Setup completion checklist
- Created `DAY1_PROGRESS.md` - Day 1 progress report
- Created `CHANGELOG.md` - This file
- Updated `README.md` - Main project documentation
- Updated `SETUP.md` - Setup instructions
- Updated `checklist.md` - Progress checklist
- Updated `Voice_Identity_Shield_Plan.md` - Development timeline

### 🔒 Security

- Implemented Firestore security rules
- Implemented Storage security rules
- Added protected routes
- User-specific data isolation
- Secure session management

### 🎨 UI/UX

- Modern cybersecurity-themed design
- Smooth animations with Framer Motion
- Responsive layout
- Dark theme with green accents
- Professional navigation system
- User-friendly forms with validation

---

## [Day 2] - 2025-11-XX

### ✅ Added

#### Voice Enrollment System
- **Voice Recording Component**
  - Real-time audio recording with MediaRecorder API
  - Minimum recording duration: 10 seconds
  - Maximum recording duration: 60 seconds
  - Manual stop allowed after 10 seconds
  - Auto-stop at 60 seconds
  - Recording progress indicator
  - Audio playback before upload

- **Audio Feature Extraction**
  - Meyda.js integration for audio analysis
  - Feature extraction: RMS, Energy, Spectral Centroid, MFCC
  - Robust error handling for feature extraction
  - Feature aggregation (mean, std) for voiceprint creation

- **Voice Encryption**
  - AES-256 encryption for voice features
  - AES-256 encryption for audio files
  - Per-user encryption keys
  - Secure key generation and storage

- **Firebase Storage Integration**
  - Encrypted audio file upload to Firebase Storage
  - Voiceprint metadata storage in Firestore
  - Audio file download with CORS support
  - Audio playback in Dashboard

- **Voiceprint Management**
  - Custom naming for voice recordings
  - Rename voiceprint functionality
  - Delete voiceprint with Storage cleanup
  - Voiceprint metadata tracking (duration, sample rate, timestamps)

#### Voice Verification System
- **Verification Flow**
  - Record verification audio (10-60 seconds)
  - Feature extraction and comparison
  - Similarity scoring
  - Verdict generation (Authentic, Possible Deepfake, Uncertain)
  - Verification history tracking

#### Dashboard Enhancements
- **Voiceprint Display**
  - Show enrolled voiceprint name
  - Display enrollment date
  - Audio playback functionality
  - Loading and error states

- **Voiceprint Management UI**
  - Inline name editing with save/cancel
  - Delete button with confirmation modal
  - Real-time UI updates after changes

- **Verification History**
  - Interactive charts (Line chart, Bar chart)
  - Verification statistics
  - Similarity score tracking
  - Verdict categorization

#### Firebase Integration Enhancements
- **Firestore Voiceprint Collection**
  - `voiceprints/{voiceprintId}` collection
  - Fields: userId, encryptedFeatures, audioStoragePath, audioUrl, name, duration, sampleRate, timestamps
  - User profile linking with voiceprintId

- **Firebase Storage**
  - Encrypted audio file storage
  - User-specific file paths: `users/{userId}/voices/{filename}`
  - CORS configuration support
  - File download with ArrayBuffer conversion

- **CORS Configuration**
  - Documentation for Firebase Storage CORS setup
  - Google Cloud SDK integration guide
  - CORS troubleshooting guide

### 🔧 Changed

- Updated `Recorder` component to support min/max duration constraints
- Modified `Enroll` page to allow playback before upload
- Enhanced error handling in audio feature extraction
- Improved Firebase Storage download with proper ArrayBuffer handling
- Updated `Dashboard` to fetch voiceprints from Firebase first, localStorage fallback
- Modified `Navbar` to hide Home tab after login
- Enhanced `deleteVoiceprint` to also delete audio files from Storage

### 🐛 Fixed

- Fixed recording button becoming unclickable after 10 seconds
- Fixed duplicate playback buttons in Enroll page
- Fixed "blob is not defined" error in enrollment flow
- Fixed audio feature extraction errors (spectralFlux, mean calculation)
- Fixed "encryptedAudio is not defined" error in localStorage fallback
- Fixed CORS errors when downloading audio from Firebase Storage
- Fixed ArrayBuffer conversion issues in audio download

### 📚 Documentation

- Updated `CORS_SETUP.md` - Complete CORS configuration guide
- Updated `USER_DATA_COLLECTIONS.md` - Added voiceprint collection structure
- Updated `FIRESTORE_RULES.md` - Added voiceprint collection rules
- Updated `README.md` - Voice features documentation

### 🔒 Security

- Encrypted voice features before storage
- Encrypted audio files before upload
- Per-user encryption keys stored securely
- User-specific file access in Storage
- Secure voiceprint deletion with Storage cleanup

### 🎨 UI/UX

- Recording duration constraints with clear feedback
- Audio playback controls with progress bar
- Voice name input field in enrollment
- Inline editing for voiceprint names
- Delete confirmation modals
- Loading states for audio operations
- Error messages with troubleshooting tips

---

## Next Release (Day 3+)

### Planned Features
- Multiple voiceprint support per user
- Advanced deepfake detection models
- Real-time verification API
- Voice pattern analytics
- Export verification reports

