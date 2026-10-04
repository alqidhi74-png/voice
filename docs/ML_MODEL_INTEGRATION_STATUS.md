# ML Model Integration Status

**Last Updated:** 2025-11-08  
**Owner:** Voice Identity Shield Engineering  

---

## 1. Current Snapshot
- Backend enrollment ➜ verification pipeline is live with FFmpeg preprocessing, encrypted storage, audit logging, and score fusion.
- Feature extraction and anti-spoof services are operational **placeholders** returning synthetic embeddings/scores.
- Client already consumes backend results; UI exposes match/synthetic/final scores plus biometric deltas.
- Security baseline (AES-256-GCM, audit hashes, rate limiting, Firebase Auth) is complete, but keys still live in Firestore pending KMS migration.

---

## 2. Gaps Blocking Production ML
1. **Embedding Model**
   - No ECAPA-TDNN/X-Vector inference yet; random vectors drive cosine similarity.
   - No GPU-aware service, batching strategy, or model version tracking.
2. **Anti-Spoof Detection**
   - Static `0.1` synthetic score; no bona fide vs spoof classification.
   - Lack of metadata (confidence, model provenance) in audit records.
3. **Data Pipeline**
   - Training/eval datasets (VoxCeleb, LibriSpeech, ASVspoof) not curated.
   - No retention & consent strategy for live traffic samples.
4. **Ops & Governance**
   - No monitoring for inference latency, score drift, or GPU utilisation.
   - No retraining loop or feedback capture from ACCEPT/CHALLENGE/REJECT outcomes.

---

## 3. Integration Plan
| Phase | Scope | Owner | Target |
|-------|-------|-------|--------|
| 1. Microservices | Deliver FastAPI (or equivalent) service for embeddings + anti-spoof. Dockerize with CUDA base image, add `/health`, `/embed`, `/antispoof`. | ML Eng | Week 1 |
| 2. Backend Wiring | Replace placeholder services with REST/gRPC calls, add retries, circuit breaker, and observability hooks (timers, request IDs). | Platform Eng | Week 2 |
| 3. Calibration | Run closed-set eval on curated dataset, tune fusion weights, thresholds, and challenge policy. | ML + Product | Week 3 |
| 4. Security Hardening | Enforce service-to-service auth (mTLS or signed tokens), migrate encryption keys to KMS, log model versions in audit events. | Security Eng | Week 4 |
| 5. Ops & Retraining | Stand up monitoring dashboards, schedule drift detection, define labelled feedback pipeline for monthly retrains. | ML Ops | Week 5 |

---

## 4. Action Items (Next Sprint)
- [ ] Package SpeechBrain ECAPA-TDNN checkpoint into Docker image; expose inference API.
- [ ] Integrate ASVspoof 2019 baseline (AASIST or RawNet2) for `/antispoof`.
- [ ] Update `featureExtractor.js` and `antiSpoof.js` to call the microservice and persist `modelVersion`, `latencyMs`.
- [ ] Extend audit logger to include `{ modelEmbeddingVersion, modelSpoofVersion }`.
- [ ] Draft dataset intake SOP (consent, storage, anonymisation).
- [ ] Wire preprocessing CLI into staging dataset workflow and document usage.
- [ ] Populate `config/model_manifest.json` with hashes and export timestamps after first model export.
- [ ] Containerise embedding microservice with SpeechBrain dependencies and TorchScript export support.

---

## 5. ML Engineering Execution Plan

### 5.1 Embedding Microservice
- **Model Packaging:** Export SpeechBrain ECAPA-TDNN checkpoint to TorchScript (fallback: ONNX + Triton). Freeze preprocessing (resample to 16 kHz, mean/variance normalisation) inside the bundle to guarantee parity across environments.
- **Inference API:** FastAPI with `/health`, `/embed`, `/batch/embed`. Accept signed upload URL or raw PCM bytes; return `{ embedding: float[192], modelVersion, latencyMs, queueDelayMs }`.
- **Performance Targets:** P50 latency ≤ 120 ms per utterance on A10G GPU, throughput ≥ 150 req/min sustained. Add micro-batching (8×1.5 s clips) behind feature flag.
- **Observability:** Emit Prometheus metrics (`inference_latency_ms`, `gpu_mem_util`, `batch_size`). Forward structured logs to Loki with `requestId`.
- **Testing:** Unit test deterministic output (fixed seed input), integration test gRPC/REST client, and smoke test in staging with golden audio set (10 speakers, 3 samples each).

### 5.2 Anti-Spoof Microservice
- **Model Selection:** Start with ASVspoof 2019 LA AASIST checkpoint. Maintain YAML manifest capturing training corpus, EER, and commit SHA.
- **Inference API:** `/antispoof` endpoint returning `{ spoofScore, decision, modelVersion, latencyMs }`. Include optional waveform diagnostics (CQCC image) under debug flag.
- **Threshold Strategy:** Ship default decision thresholds from challenge set (target FPR 2.5%). Provide config hot-reload via S3-backed JSON to adjust without redeploy.
- **Robustness:** Augment inputs with replay/codec perturbations during validation. Track failure cases (e.g., non-speech) and expose `qualityFlag`.

### 5.3 Shared ML Infrastructure
- **Deployment:** Base image `nvidia/cuda:12.2.0-runtime-ubuntu22.04` + Poetry-managed environment. Bake models under `/opt/models/{embedding,antispoof}` with versioned subfolders. CI pipeline pushes signed container to Artifact Registry.
- **Configuration Management:** Read model version pins and thresholds from ConfigMap (Kubernetes) or SSM Parameter Store. Use semantic versioning (`ecapa-1.0.0`, `aasist-1.0.0`).
- **Security:** Enforce service-to-service mTLS using SPIRE-issued certificates. Rotate inference API tokens every 7 days. Restrict GPU nodes to private subnets.
- **Resilience:** Sidecar queue (Redis Streams) to absorb traffic spikes; circuit breaker trips when GPU load > 90% for 5 min. Publish fallback signals to backend to trigger "challenge" decision.

### 5.4 Data & Evaluation Loop
- **Dataset Curation:** Pull VoxCeleb1/2, LibriSpeech train-clean-360, ASVspoof 2019 LA; store in encrypted S3 bucket with IAM boundary. Maintain metadata catalog (speaker ID, consent, demographic tags).
- **Benchmark Suite:** Weekly run `eval.py` computing EER, minDCF, spoof detection APCER/BPCER. Produce markdown report and attach to `docs/metrics/YYYY-MM-DD.md`.
- **Calibration:** Use T-norm score normalisation and grid-search thresholds on validation set; log chosen parameters in `config/calibration.json`.
- **Feedback Ingestion:** Stream Accept/Challenge/Reject outcomes with audio hashes into Snowflake. Label drift detector monitors monthly KS-statistic; alert if > 0.15.

### 5.5 Timeline & Dependencies
- **Week 1:** Containerise embedding service, smoke tests in staging GPU environment, publish deployment runbook.
- **Week 2:** Integrate anti-spoof service, implement observability dashboards, enforce mTLS.
- **Week 3:** Run calibration suite, wire backend feature flags, document rollback procedure.
- **Week 4:** Pilot retraining workflow (dry run), finalise dataset SOP, hand off monitoring dashboards to ML Ops.

---

## 6. Risks & Mitigations
- **Model drift / bias** → Establish recurring evaluation on demographic slices; store false accept/reject samples for review.
- **Service downtime** → Implement fallback logic (challenge decision) when microservice unreachable; alerting on error budget breach.
- **Security of model endpoints** → Restrict access via internal network + mutual TLS; rotate service credentials; add WAF rules if exposed.
- **Data privacy** → Use KMS-backed envelope encryption before persisting embeddings/audio; scrub PII from training artefacts.

---

## 7. Definition of Done
- Real embeddings + anti-spoof scores drive Accept/Challenge/Reject decisions.
- Audit trail captures model IDs, inference latency, and final decision.
- Thresholds derived from validation data and documented.
- KMS protects encryption keys; manual key rotation runbook published.
- Monitoring dashboards and alerting policies active; retraining pipeline scheduled.

---

**Next Update:** after embedding microservice merges to main (ETA Week 1). Share progress via `docs/CHANGELOG.md` and link here.  
For questions ping `#voice-identity-ml` Slack channel.

---

## 8. Latest Progress (2025-11-08)
- Created Python `ml/` package scaffolding covering preprocessing CLI (`ml/preprocess/cli.py`), export utilities, calibration helpers, and FastAPI microservice skeletons for `/embed` and `/antispoof`.
- Added shared model manifest at `config/model_manifest.json` to track deployed model IDs, dimensions, thresholds, and artifact locations.
- Preprocessing CLI now supports 16 kHz normalisation, segmentation for embedding windows, optional log-mel caching, and smoke-test subset flags (`--max-speakers`, `--max-files-per-speaker`).
- Introduced `ml/export/embed_export.py` to pull the SpeechBrain ECAPA-TDNN checkpoint locally, persist metadata, and auto-update the model manifest for service consumption.
- Embedding microservice now loads the SpeechBrain encoder when an exported artifact is present, falling back to zero vectors otherwise; latency and version metadata remain unchanged.
- Calibration helper (`ml/calibration/fuse_scores.py`) introduces reusable fusion utilities ahead of threshold search implementation.

### 8.1 Embedding Export Workflow
1. Install ML dependencies: `pip install -r ml/requirements.txt` (ensure CUDA-compatible PyTorch build).
2. Run exporter: `python ml/export/embed_export.py --version 1.0.0`.
3. Verify manifest update at `config/model_manifest.json` (fields `modelId`, `artifactPath`, `embeddingDim`, `exportedAt`).
4. Restart embedding microservice so it loads the new artifact (FastAPI auto-detects via manifest).

### 8.2 Backend Service Wiring
- Backend `featureExtractor` now base64-encodes processed WAVs and calls the embedding microservice (`EMBED_SERVICE_URL`), capturing `modelVersion`, `latencyMs`, and transport timing metadata.
- Backend `antiSpoof` service calls the anti-spoof microservice (`ANTISPOOF_SERVICE_URL`) with identical telemetry capture; both services respect configurable timeouts via environment variables.

