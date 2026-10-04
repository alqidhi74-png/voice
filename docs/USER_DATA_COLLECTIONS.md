# 📊 User Data Collections & Structure

## Overview

All user data is stored in Firestore with automatic timestamps and member tracking.

## Firestore Collection: `users`

### Document Structure

Each user document is stored at: `users/{userId}` where `userId` is the Firebase Auth UID.

```javascript
{
  // Basic Information
  email: "user@example.com",
  displayName: "John Doe",
  
  // Profile Information (Optional)
  age: 25,                    // Number (13-120)
  phoneNumber: "+1 234 567 8900",  // String
  gender: "male",             // "male" | "female" | "other" | "prefer-not-to-say" | null
  country: "United States",    // String | null
  
  // Timestamps (Auto-generated)
  createdAt: Timestamp,       // When profile was created
  updatedAt: Timestamp,       // Last profile update
  registrationDate: Timestamp, // Same as createdAt (for clarity)
  memberSince: Timestamp,     // Same as createdAt (for member duration calculation)
  lastLogin: Timestamp | null, // Updated on each login
  
  // AI/Analytics Fields (Computed)
  memberSinceDays: 15,        // Calculated: days since registration
  lastLoginDays: 2,           // Calculated: days since last login
  isActive: true,             // true if lastLoginDays < 30
  userSegment: "adult",       // "young" | "adult" | "senior" | "unknown"
}
```

## Data Flow

### Registration Flow
1. User fills registration form (name, email, password, age, phone, gender, country)
2. Firebase Auth creates user account
3. Firestore creates user profile document with:
   - All form data
   - `createdAt`, `registrationDate`, `memberSince` = current timestamp
   - `lastLogin` = null (will be set on first login)

### Login Flow
1. User authenticates with Firebase Auth
2. Firestore updates user document:
   - `lastLogin` = current timestamp
   - `updatedAt` = current timestamp

## Available Functions

### From `firestore.js`:

```javascript
// Create user profile
createUserProfile(userId, userData)

// Get user profile
getUserProfile(userId)

// Update user profile
updateUserProfile(userId, updates)

// Update last login
updateLastLogin(userId)

// Calculate member since
calculateMemberSince(registrationDate) // Returns days

// Get formatted member since
getMemberSinceString(registrationDate) // Returns "15 days", "2 months", etc.

// Get user data for AI
getUserDataForAI(userId) // Returns enriched data with computed fields
```

## Usage Examples

### Get User Profile
```javascript
import { getUserProfile } from '../services/firestore'

const profile = await getUserProfile(currentUser.uid)
if (profile.success) {
  console.log(profile.data.displayName)
  console.log(profile.data.memberSince)
}
```

### Update User Profile
```javascript
import { updateUserProfile } from '../services/firestore'

await updateUserProfile(userId, {
  age: 26,
  phoneNumber: "+1 234 567 8901"
})
```

### Get AI-Ready Data
```javascript
import { getUserDataForAI } from '../services/firestore'

const aiData = await getUserDataForAI(userId)
// Returns: { success, data: { ...userData, memberSinceDays, isActive, userSegment } }
```

## Security

- Users can only read/write their own data (enforced by Firestore rules)
- All timestamps are server-generated (prevents tampering)
- Sensitive data (like phone numbers) are optional and can be encrypted later

## Firestore Collection: `voiceprints`

### Document Structure

Each voiceprint document is stored at: `voiceprints/{voiceprintId}` where `voiceprintId` is auto-generated.

```javascript
{
  // User Reference
  userId: "user123",              // Firebase Auth UID (links to users collection)
  
  // Encrypted Data
  encryptedFeatures: "encrypted_string",  // AES-256 encrypted voice features
  
  // Audio File References
  audioStoragePath: "users/user123/voices/voice_1234567890.encrypted",  // Firebase Storage path
  audioUrl: "https://firebasestorage...",  // Download URL (optional)
  
  // Voiceprint Metadata
  name: "My Voice Recording",     // User-defined name (default: "My Voice Recording")
  duration: 15.5,                // Recording duration in seconds
  sampleRate: 44100,              // Audio sample rate
  
  // Timestamps (Auto-generated)
  createdAt: Timestamp,           // When voiceprint was created
  updatedAt: Timestamp,           // Last update (e.g., name change)
}
```

### User Profile Link

The user's profile document (`users/{userId}`) contains:
```javascript
{
  // ... other user fields ...
  
  // Voiceprint References
  voiceprintId: "voiceprint123",             // Reference to the most recent voiceprint
  voiceprintIds: ["voiceprint123", "voiceprint456"], // All enrollment IDs for this user
  voiceprintKeys: {
    "voiceprint123": "hex_encoded_key",
    "voiceprint456": "hex_encoded_key"
  },                                         // Per-voiceprint AES-256-GCM keys (hex encoded)
  voiceprintEncryptionKey: "hex_encoded_key", // Backwards-compatible field for latest voiceprint
  hasVoiceprint: true,                        // Boolean flag
  voiceprintCreatedAt: Timestamp,             // When the latest voiceprint was created
  updatedAt: Timestamp                        // Last profile update
}
```

### Available Functions

From `firestore.js`:

```javascript
// Store voiceprint
storeVoiceprint(userId, voiceprintData, encryptionKey)
// voiceprintData: { encryptedFeatures, audioStoragePath, audioUrl, duration, sampleRate, name }

// Get voiceprint
getVoiceprint(userId)
// Returns: { success, data: voiceprint, encryptionKey }

// List all voiceprints (multi-voiceprint support)
getVoiceprints(userId)
// Returns: { success, data: [{ id, name, audioStoragePath, encryptionKey, ... }] }

// Update voiceprint name
updateVoiceprintName(userId, newName, voiceprintId)

// Delete voiceprint
deleteVoiceprint(userId, deleteAudioFile, voiceprintId)
// deleteAudioFile: function to delete audio from Storage
```

### Usage Examples

#### Store Voiceprint
```javascript
import { storeVoiceprint } from '../services/firestore'

const voiceprintData = {
  encryptedFeatures: "encrypted_string",
  audioStoragePath: "users/user123/voices/voice_123.encrypted",
  audioUrl: "https://...",
  duration: 15.5,
  sampleRate: 44100,
  name: "Work Voice"
}

const result = await storeVoiceprint(userId, voiceprintData, encryptionKey)
```

#### Get Voiceprint
```javascript
import { getVoiceprint } from '../services/firestore'

const result = await getVoiceprint(userId)
if (result.success) {
  console.log(result.data.name)  // "Work Voice"
  console.log(result.encryptionKey)  // Decryption key
}

const allVoiceprints = await getVoiceprints(userId)
allVoiceprints.data.forEach(vp => {
  console.log(vp.id, vp.name)
})
```

#### Update Name
```javascript
import { updateVoiceprintName } from '../services/firestore'

await updateVoiceprintName(userId, "Personal Voice", "voiceprint123")
```

#### Delete Voiceprint
```javascript
import { deleteVoiceprint } from '../services/firestore'
import { deleteVoiceFile } from '../services/firebaseStorage'

await deleteVoiceprint(userId, deleteVoiceFile, "voiceprint123")
// This deletes both Firestore document and Storage file
```

## Future Collections

### `verifications/{verificationId}`
- Store verification history
- Link to user via `userId` field
- Include similarity scores, timestamps, results

### `analytics/{userId}`
- Store AI analysis results
- User behavior patterns

> **Legacy note:** Voiceprints enrolled before 2025-11-09 might not have entries in `voiceprintKeys`. Add the correct AES key under `voiceprintKeys.{voiceprintId}` (hex) to restore playback and decryption for those recordings.
- Voice pattern analysis

## Setup Instructions

1. **Enable Firestore:**
   - Go to Firebase Console → Firestore Database
   - Click "Create database"
   - Choose "Start in test mode"
   - Select location

2. **Set Security Rules:**
   - Go to Firestore Database → Rules
   - Copy rules from `docs/FIRESTORE_RULES.md`
   - Click "Publish"

3. **Test:**
   - Register a new user
   - Check Firestore Console → Data → `users` collection
   - Verify document was created with all fields

## Data for AI

The `getUserDataForAI()` function provides enriched data including:
- Demographic information (age, gender, country)
- Activity metrics (memberSinceDays, lastLoginDays, isActive)
- User segmentation (young, adult, senior)
- All original profile data

This data can be used for:
- Voice pattern analysis
- User behavior prediction
- Personalized features
- Fraud detection
- Analytics and reporting

