# Security and database design

## Authentication flow

1. Firebase Authentication validates email/password or the configured OAuth provider.
2. New password accounts receive a Firebase email-verification link. All profile,
   enrollment, storage, verification, and audit endpoints reject unverified accounts.
3. Accounts may enable TOTP MFA with an authenticator app. Password login then creates
   a five-minute, single-use server challenge; tokens are released only after a valid code.
4. Password changes and logout revoke Firebase refresh tokens. The API checks token
   revocation on every protected request.
5. `user` and `admin` roles are enforced on the server from signed Firebase custom claims
   (or `ADMIN_EMAILS` only for initial bootstrap). Client-side route guards are convenience,
   not the security boundary.

## Data protection

- Voice embeddings, acoustic feature vectors/summaries, and audio are encrypted with a
  unique 256-bit data key using AES-256-GCM.
- Each data key is envelope-encrypted with `VOICEPRINT_MASTER_KEY`; plaintext data keys are
  never returned by the API or stored beside the biometric record.
- Legacy plaintext data keys are re-wrapped and deleted when a voiceprint is next verified.
- Passwords are handled only by Firebase Authentication and are never stored in Firestore.
- Responses carrying authentication or profile data use `Cache-Control: no-store`.

## Firestore collections

| Collection | Document ID | Purpose | Key fields |
|---|---|---|---|
| `users` | Firebase UID | Account/profile and current voiceprint reference | `role`, `emailVerified`, `mfaEnabled`, `voiceprintId`, `voiceprintIds` |
| `voiceprints` | SHA-256-derived ID | Encrypted biometric record | `userId`, `encryptedEmbedding`, `encryptedFeatureVector`, `encryptedFeatureSummary`, `wrappedDataKey` |
| `enrollments` | Generated enrollment ID | Non-biometric enrollment metadata/status | `userId`, `voiceprintId`, `status`, timestamps |
| `auditLogs` | Generated event ID | Security and verification audit history | `userId`, `operation`, `status`, scores, timestamp |
| `mfaChallenges` | SHA-256 of random challenge | Five-minute MFA login transaction | `uid`, `encryptedSession`, `attempts`, `expiresAt` |

Relationships:

```text
Firebase Auth user (uid)
  └── users/{uid}
       ├── voiceprintIds[] ──> voiceprints/{voiceprintId}
       ├── enrollments.userId
       └── auditLogs.userId

mfaChallenges/{hash(randomToken)} ──> users/{uid} (expires after 5 minutes)
```

## Injection and authorization controls

Firestore is a NoSQL database, so classic SQL injection does not apply. Equivalent query
injection is mitigated by rejecting operator keys (`$...`), dotted field paths, and prototype
keys; allow-listing update fields; validating document IDs; clamping query limits; and never
building database queries from arbitrary client objects. Cross-account voice verification is
limited to administrators, while ordinary users can access only records tied to their UID.

## Deployment requirements

- Set `VOICEPRINT_MASTER_KEY` to a backed-up high-entropy secret before enrollment or MFA setup.
- Set `FIREBASE_WEB_API_KEY`, Firebase Admin credentials, and an exact `ALLOWED_ORIGINS` list.
- Use HTTPS in production and configure Firebase authorized domains/action-email templates.
- Configure a Firestore TTL policy for `mfaChallenges.expiresAt` so expired documents are removed.
- Create the first administrator with `ADMIN_EMAILS`, sign in, assign permanent roles through
  the admin screen/API, then remove the bootstrap value if desired.
# Account security and access control

## Authentication and passwords

- Email/password authentication is handled by Firebase Authentication. The application never stores plaintext passwords or password hashes in Firestore.
- Firebase Authentication stores passwords using its managed password-hashing configuration. Password verification and password reset are delegated to Firebase rather than implemented in application code.
- After three consecutive invalid password attempts, the account is locked.
- The lock has a 60-second security cooldown. It does not disappear automatically: only an authenticated administrator can unlock the account after the cooldown.
- A successful login, password reset, or password change clears the failed-attempt counter.

## Roles and account status

- Server routes enforce the `user` and `admin` roles from trusted Firebase custom claims. Client-side route guards are only an additional UI control.
- Administration endpoints require a verified Firebase token, a verified email, and the `admin` role.
- An administrator can mark an account `active` or `blocked`. Blocking also disables the Firebase Authentication user and revokes existing refresh tokens.
- Firestore client access is denied; protected data is available only through the authenticated Express API.

## Encrypted alerts and feedback

- Security-alert details and user-feedback messages are encrypted at rest with AES-256-GCM before being stored in Firestore.
- Only authenticated administrators can retrieve decrypted alerts and feedback through the administration API.
- Encryption uses the configured versioned master-key mechanism (`VOICEPRINT_MASTER_KEYS`, or the compatible legacy master key).
- Administrators can mark alerts read/unread, update feedback to `new`, `in_progress`, or `resolved`, and send an encrypted response.
- Feedback responses create encrypted user notifications. Authenticated Server-Sent Events deliver admin and user updates instantly while the browser is open.
- Native browser notifications are used after the administrator grants browser permission.
- Custom email delivery is optional. Set `EMAIL_NOTIFICATIONS_ENABLED=true` and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`. If SMTP is disabled or unavailable, the database operation and live notification still succeed.
