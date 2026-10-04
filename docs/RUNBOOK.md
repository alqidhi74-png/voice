# Voice Identity Shield – Runbook

This guide walks you through starting every service that powers Voice Identity Shield on a development machine. It assumes you cloned the repository to `D:\College\Codes\VS\Side_Projects\Voice_Identity_Shield` (adjust paths if needed).

---

## 1. Prerequisites

- **Node.js 18+** with npm.
- **Python 3.9 – 3.12** (3.12 confirmed working) and the ability to create virtual environments.
- **FFmpeg** on your `PATH` for audio preprocessing (see `docs/FFMPEG_INSTALLATION.md` if you do not have it).
- Valid Firebase project credentials; follow `docs/FIREBASE_SETUP.md` and copy the values into the server/client `.env` files.

---

## 2. Service Startup Order

1. Machine Learning microservices (`ml/`)
2. Node/Express API server (`server/`)
3. React client (`client/`)

Starting the ML layer first ensures the API can call into the embedding and anti-spoof endpoints during enrollment/verification flows.

---

## 3. Machine Learning Services (`ml/`)

### 3.1 Create/Activate Virtual Environment

```powershell
cd D:\College\Codes\VS\Side_Projects\Voice_Identity_Shield\ml
python -m venv .venv
.\.venv\Scripts\activate
```

> Every time you open a new terminal for the ML services, run the `activate` script before continuing.

### 3.2 Install Dependencies

```powershell
pip install --upgrade pip
pip install -r requirements.txt
pip install soundfile requests "huggingface_hub<0.25"
```

The extra packages provide audio backends (`soundfile`), model downloads (`requests`), and compatibility with SpeechBrain (`huggingface_hub` downgrade).

### 3.3 Start Embedding Service (Port 8000)

```powershell
uvicorn services.embedding_service:app --host 0.0.0.0 --port 8000
```

Expected first-time log output:
- SpeechBrain warning about deprecated module (safe to ignore).
- Download/cache messages for `speechbrain/spkrec-ecapa-voxceleb`.
- `Uvicorn running on http://0.0.0.0:8000`

Leave this terminal open.

### 3.4 Start Anti-Spoof Service (Port 8001)

Open a **second** terminal:

```powershell
cd D:\College\Codes\VS\Side_Projects\Voice_Identity_Shield\ml
.\.venv\Scripts\activate
uvicorn services.antispoof_service:app --host 0.0.0.0 --port 8001
```

First launch will be instantaneous because models are heuristic; log should end with `Uvicorn running on http://0.0.0.0:8001`.

---

## 4. Node API Server (`server/`)

Open a new terminal window (no Python venv required here):

```powershell
cd D:\College\Codes\VS\Side_Projects\Voice_Identity_Shield\server
npm install
```

Configure environment variables:
1. Copy `.env.example` to `.env.local` (or `.env`) if provided.
2. Populate Firebase keys, storage bucket, and any service URLs:
   - `EMBED_SERVICE_URL`: `http://localhost:8000/embed`
   - `ANTISPOOF_SERVICE_URL`: `http://localhost:8001/antispoof`
   - Other Firebase settings per `server/ENV_SETUP.md`.

Start the dev server:

```powershell
npm run dev
```

The API listens on `http://localhost:5001` by default. Keep this terminal running.

---

## 5. React Client (`client/`)

Final terminal window:

```powershell
cd D:\College\Codes\VS\Side_Projects\Voice_Identity_Shield\client
npm install
```

Set up client env:
- Duplicate `.env.example` → `.env.local`.
- Fill Firebase web config, API base URL (e.g., `VITE_API_BASE=https://localhost:5001` or proxy path), and OAuth settings as described in `client/ENV_SETUP_INSTRUCTIONS.md`.

Start Vite dev server:

```powershell
npm run dev
```

Vite prints a local URL such as `http://localhost:5173`. Open it in your browser to use the app.

---

## 6. Quick Verification Checklist

- **Embedding service** reachable: `curl http://localhost:8000/health`
- **Anti-spoof service** reachable: `curl http://localhost:8001/health`
- **API server** logs show successful connection to Firebase and no 5xx errors.
- **Client** can enroll/verify without console errors; network tab shows calls to `/api/enroll` and `/api/verify` hitting the Node server.

If any service stops, restart it in the same order (ML → server → client). For dependency or credential changes, repeat the relevant install or env setup steps.

---

### Next Steps

- Review `docs/TECHNICAL_PLAN.md` for architecture details.
- Inspect `docs/ML_MODEL_INTEGRATION_STATUS.md` for model roadmap.
- Use `docs/FFMPEG_INSTALLATION.md` if FFmpeg is missing on the new machine.

Happy hacking!


