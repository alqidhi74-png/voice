# Voice Identity Shield – Backend API Server

This service powers enrollment, verification, and audit logging for Voice Identity Shield. It orchestrates Firebase, the ML microservices (embedding + anti-spoof), and the feature-scoring pipeline.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm
- Firebase project with Admin SDK credentials
- ML services running locally (`ml/services/embedding_service.py` on **8000**, `ml/services/antispoof_service.py` on **8001**)  
  👉 See `RUNBOOK.md` for the recommended startup order.

### Installation
```bash
cd server
npm install
cp .env.example .env.local  # or .env
```

### Configure `.env`
- Paste Firebase Admin credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
- Point the API to the ML services:
  ```env
  EMBED_SERVICE_URL=http://localhost:8000/embed
  ANTISPOOF_SERVICE_URL=http://localhost:8001/antispoof
  ```
- Adjust `PORT` (defaults to **5001**) and CORS origins to match your client.

### Run the server
```bash
# Development with hot reload
npm run dev

# Production
npm start
```

By default the API listens on `http://localhost:5001`.

---

## 📁 Project Structure (2025-11)

```
server/
├── src/
│   ├── index.js              # Express bootstrap + service wiring
│   ├── config/
│   │   └── firebase.js       # Firebase Admin bootstrap
│   ├── middleware/
│   │   ├── auth.js           # Firebase ID token verification
│   │   ├── rateLimiter.js    # Sliding-window limiter
│   │   └── errorHandler.js   # Normalised error responses
│   ├── routes/
│   │   ├── audit.js          # Audit history + event queries
│   │   ├── auth.js           # Session introspection helpers
│   │   ├── enroll.js         # Voice enrollment flow
│   │   ├── health.js         # Service + dependency health
│   │   ├── storage.js        # Encrypted asset download helpers
│   │   ├── user.js           # Profile management
│   │   └── verify.js         # Verification pipeline (embedding, anti-spoof, fusion)
│   ├── services/
│   │   ├── antiSpoof.js      # Calls anti-spoof microservice
│   │   ├── audioPreprocessor.js # FFmpeg-based normalisation
│   │   ├── auditLogger.js    # Structured audit event logging
│   │   ├── encryption.js     # AES-256-GCM helpers for embeddings
│   │   ├── featureExtractor.js # Embedding microservice client
+│   │   └── scoreFusion.js   # Match + anti-spoof fusion and policy
│   └── utils/
│       └── logger.js         # Pino-style logger wrapper
├── uploads/                  # Temp workspace for FFmpeg (gitignored)
├── scripts/                  # Utility scripts (env conversion, etc.)
├── package.json
└── README.md
```

---

## 🔌 Core Endpoints

| Method & Path | Purpose | Notes |
|---------------|---------|-------|
| `GET /api/health` | Lightweight health check | Returns build + dependency summary |
| `GET /api/health/detailed` | Deep health check | Includes embedding/anti-spoof reachability |
| `POST /api/enroll` | Enroll a new voiceprint | Multipart upload, server-side encryption, audit logged |
| `POST /api/verify` | Verify voice vs. stored print | Runs preprocessing → embedding → anti-spoof → score fusion |
| `GET /api/storage/audio/:id` | Secure audio download | Requires auth + ownership |
| `GET /api/audit/user` | Verification/enrollment history | Paginates over `audit_events` |
| `GET /api/user/profile` | Fetch profile | Mirrors Firebase document |
| `PATCH /api/user/profile` | Update profile | Validates against user schema |

All protected routes require a Firebase ID token in `Authorization: Bearer <token>`.

---

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Express listen port | `5001` |
| `NODE_ENV` | Environment flag | `development` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | _required_ |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin client email | _required_ |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin private key (escaped `\n`) | _required_ |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:5173` |
| `MAX_FILE_SIZE` | Upload limit (bytes) | `15728640` (15 MB) |
| `UPLOAD_DIR` | Temp workspace path | `./uploads` |
| `EMBED_SERVICE_URL` | Embedding microservice endpoint | `http://localhost:8000/embed` |
| `EMBED_SERVICE_TIMEOUT_MS` | Embedding call timeout | `15000` |
| `ANTISPOOF_SERVICE_URL` | Anti-spoof endpoint | `http://localhost:8001/antispoof` |
| `ANTISPOOF_SERVICE_TIMEOUT_MS` | Anti-spoof timeout | `15000` |
| `VERIFICATION_ACCEPT_THRESHOLD` | Accept decision boundary | `0.85` (overrides default) |
| `FIRESTORE_REGION` | Optional Firestore region override | _(unset)_ |

> Use `npm run setup-env` if you store Firebase credentials as JSON and need a `.env` conversion.

---

## 🧪 Testing the Pipeline

```bash
# Health (expects 200)
curl http://localhost:5001/api/health

# Enrollment (requires Firebase ID token)
curl -X POST http://localhost:5001/api/enroll \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -F "audio=@enrollment.webm" \
  -F "label=Primary voiceprint"

# Verification (runs embedding + anti-spoof + score fusion)
curl -X POST http://localhost:5001/api/verify \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -F "audio=@probe.webm"
```

Successful verification responses include:
- `matchScore` (cosine similarity)
- `syntheticScore` (anti-spoof heuristic)
- `finalScore`, `verdict`, `riskLevel`
- `featureComparison` stats (mean abs diff, L2)
- `biometricComparison` previews used by the client’s synced charts

---

## ✅ Current Capabilities

- [x] FFmpeg-based preprocessing (normalise to 16 kHz mono, trim silence)
- [x] Embedding service integration with SpeechBrain ECAPA (via `ml/`)
- [x] Heuristic anti-spoof scoring (spectral artefact detection placeholder)
- [x] Score fusion + policy engine (match vs. synthetic weighting, drift penalties)
- [x] AES-256-GCM encryption for stored embeddings & feature vectors
- [x] Comprehensive audit logging with risk metadata
- [x] Secure download proxy for encrypted audio blobs
- [x] Feature drift analytics powering the Feature Delta Network UI sync

### 📈 Roadmap
- [ ] Swap anti-spoof placeholder for production-grade model (AASIST-lite / RawNet2)
- [ ] Integrate KMS-backed key management for voiceprint encryption
- [ ] Expand verification throttling + anomaly detection
- [ ] Add contract tests for ML service timeouts and fallbacks

---

## 🔗 Client Integration Tips

1. Obtain Firebase ID token on the client (see `client/src/services/authApi.js`).
2. Send audio as `multipart/form-data` to `/api/enroll` or `/api/verify`.
3. On verification success, surface the returned `biometricComparison` so the UI can sync the Feature Delta Network tracer and the embedding preview line chart (already handled in `client/src/components/ResultCard.jsx`).

---

## 🐛 Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Error: could not reach embedding service` | Confirm ML service at `http://localhost:8000/embed`, restart per `RUNBOOK.md` |
| `ANTI_SPOOF_UNAVAILABLE` / HTTP 503 | The heuristic anti-spoof placeholder is unavailable or returned an invalid score; inspect `ml/services/antispoof_service.py` logs |
| `Firebase ID token missing` | Ensure client attaches `Authorization: Bearer <token>` |
| `Unsupported voiceprint format` | Enrollment may have failed; clear the user’s voiceprint document and re-enroll |
| CORS failures | Update `ALLOWED_ORIGINS` and restart the server |

---

## 📚 Further Reading

- `RUNBOOK.md` – complete multi-service startup guide
- `docs/IMPLEMENTATION_PLAN.md` – roadmap + milestones
- `docs/CLIENT_API_INTEGRATION.md` – request/response contracts
- `docs/COMPLETED_FEATURES.md` – changelog of backend capabilities

---

_Status: Verification pipeline v2 (match + anti-spoof fusion with synced UI telemetry)._
