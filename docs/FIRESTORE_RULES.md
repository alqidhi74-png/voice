# 🔥 Firestore Security Rules

## User Data Collection Rules

Copy and paste these rules into Firebase Console → Firestore Database → Rules tab:

**⚠️ IMPORTANT: Copy ONLY the code below, starting from `rules_version` and ending with the closing `}`. Do NOT copy the markdown code block markers (```).**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Subcollections under user document
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    
    // Voiceprints collection (if you create a separate collection)
    match /voiceprints/{voiceprintId} {
      // Allow read if user owns the voiceprint
      allow read: if request.auth != null && 
        resource.data.userId == request.auth.uid;
      
      // Allow create if user is authenticated and setting their own userId
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
      
      // Allow update/delete if user owns the voiceprint
      allow update, delete: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
    
    // Verification history collection
    match /verifications/{verificationId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
  }
}
```

**Tip:** Copy only the code inside the code block (between the ``` markers), not the markdown formatting.

## How to Apply Rules

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `voice-identity-shield`
3. Click **Firestore Database** in left sidebar
4. Click **Rules** tab
5. Paste the rules above
6. Click **Publish**

## Rule Explanation

- **Users Collection**: Each user can only access their own document (matched by `userId == request.auth.uid`)
- **Subcollections**: Any nested data under a user document follows the same rule
- **Voiceprints**: Users can only access voiceprints they own
- **Verifications**: Users can only see their own verification history

## Testing Rules

After publishing, test with:
- Register a new user → Should create document in `users/{userId}`
- Login → Should update `lastLogin` field
- Try accessing another user's data → Should be denied

## Data Structure

### Users Collection
```
users/
  {userId}/
    email: string
    displayName: string
    age: number | null
    phoneNumber: string | null
    gender: string | null
    country: string | null
    createdAt: timestamp
    updatedAt: timestamp
    lastLogin: timestamp | null
    memberSince: timestamp
    registrationDate: timestamp
    // Voiceprint Reference (if enrolled)
    voiceprintId: string | null
    voiceprintEncryptionKey: string | null
    hasVoiceprint: boolean
    voiceprintCreatedAt: timestamp | null
```

### Voiceprints Collection
```
voiceprints/
  {voiceprintId}/
    userId: string (references users/{userId})
    encryptedFeatures: string (AES-256 encrypted)
    audioStoragePath: string (Firebase Storage path)
    audioUrl: string (optional download URL)
    name: string (user-defined name)
    duration: number (seconds)
    sampleRate: number
    createdAt: timestamp
    updatedAt: timestamp
```

