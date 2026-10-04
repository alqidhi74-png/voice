"""
FastAPI microservice skeleton for anti-spoof detection inference.

The current implementation returns placeholder scores so the backend can be wired
before a trained model is available.
"""

from __future__ import annotations

import base64
import io
import json
import time
from pathlib import Path
from typing import Optional

import math
import numpy as np
import torch
import torchaudio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


DEFAULT_SAMPLE_RATE = 16000
HIGH_FREQUENCY_CUTOFF = 4000  # Hz


def load_model_manifest(manifest_path: Path) -> dict:
    if not manifest_path.exists():
        return {}
    with manifest_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


class AntiSpoofRequest(BaseModel):
    audio_base64: str = Field(..., description="Base64 encoded mono PCM16 audio sampled at 16 kHz.")
    sample_rate: int = Field(DEFAULT_SAMPLE_RATE, description="Sample rate of the encoded audio.")
    request_id: Optional[str] = Field(None, description="Optional request identifier propagated from the caller.")


class AntiSpoofResponse(BaseModel):
    spoofScore: float
    decision: str
    modelVersion: str
    latencyMs: float
    sampleRate: int = DEFAULT_SAMPLE_RATE
    confidence: float | None = None
    indicators: dict[str, float] | None = None


class AntiSpoofModel:
    """
    Heuristic anti-spoof estimation leveraging spectral statistics until a trained model is wired in.
    """

    def __init__(self, threshold: float, sample_rate: int) -> None:
        self.threshold = threshold
        self.sample_rate = sample_rate

    def infer(self, waveform: np.ndarray, sample_rate: int) -> tuple[float, dict[str, float]]:
        if waveform.size == 0:
            # Empty waveform → treat as suspicious
            return 1.0, {"hfRatio": 0.0, "flux": 0.0, "flatness": 0.0, "zcr": 0.0, "modulation": 0.0}

        waveform = waveform.astype(np.float32)
        waveform = waveform - np.mean(waveform)
        waveform = waveform / (np.std(waveform) + 1e-8)

        if sample_rate != self.sample_rate:
            waveform_tensor = torch.from_numpy(waveform).unsqueeze(0)
            waveform_tensor = torchaudio.functional.resample(
                waveform_tensor, sample_rate, self.sample_rate
            )
            waveform = waveform_tensor.squeeze(0).numpy()
            sample_rate = self.sample_rate

        frame_length = int(0.025 * sample_rate)
        hop_length = max(1, int(0.010 * sample_rate))
        if frame_length <= 0:
            frame_length = 400
        window = np.hanning(frame_length)
        n_fft = int(2 ** math.ceil(math.log2(frame_length)))

        frames = []
        energies = []
        for start in range(0, max(len(waveform) - frame_length, 1), hop_length):
            frame = waveform[start : start + frame_length]
            if frame.shape[0] < frame_length:
                frame = np.pad(frame, (0, frame_length - frame.shape[0]))
            windowed = frame * window
            spectrum = np.fft.rfft(windowed, n=n_fft)
            magnitude = np.abs(spectrum)
            frames.append(magnitude)
            energies.append(float(np.sum(windowed ** 2)))

        if not frames:
            return 1.0, {"hfRatio": 0.0, "flux": 0.0, "flatness": 0.0, "zcr": 0.0, "modulation": 0.0}

        magnitudes = np.stack(frames, axis=0)
        energies = np.array(energies, dtype=np.float32)
        freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)

        hf_mask = freqs >= HIGH_FREQUENCY_CUTOFF
        magnitude_power = magnitudes**2
        total_energy = float(np.sum(magnitude_power))
        if total_energy <= 0.0:
            return 1.0, {"hfRatio": 0.0, "flux": 0.0, "flatness": 0.0, "zcr": 0.0, "modulation": 0.0}
        hf_energy = float(np.sum(magnitude_power[:, hf_mask]))
        hf_ratio = float(hf_energy / (total_energy + 1e-10))

        if magnitudes.shape[0] > 1:
            diffs = np.diff(magnitudes, axis=0)
            flux = float(np.mean(np.sqrt(np.sum(diffs**2, axis=1))) / (magnitudes.shape[1] + 1e-10))
        else:
            flux = 0.0
        flux_norm = min(flux * 10.0, 1.0)

        flatness_frames = np.exp(np.mean(np.log(magnitudes + 1e-10), axis=1)) / (
            np.mean(magnitudes + 1e-10, axis=1) + 1e-10
        )
        flatness = float(np.clip(np.mean(flatness_frames), 0.0, 1.0))

        zero_crossings = np.sum(np.diff(np.sign(waveform)) != 0)
        zcr = float(zero_crossings / (waveform.size + 1e-10))
        zcr_norm = min(zcr / 0.15, 1.0)

        modulation = float(np.var(energies) / (np.mean(energies) + 1e-10))
        modulation_norm = float(np.clip(modulation / 5.0, 0.0, 1.0))

        # Weighted logistic combination prioritising high-frequency artifacts and unstable spectra.
        linear_score = (
            2.0 * hf_ratio
            + 1.4 * flux_norm
            + 1.2 * flatness
            + 1.0 * zcr_norm
            + 1.0 * modulation_norm
            - 1.5
        )
        spoof_prob = float(1.0 / (1.0 + math.exp(-linear_score)))
        spoof_prob = float(np.clip(spoof_prob, 0.0, 1.0))

        indicators = {
            "hfRatio": hf_ratio,
            "flux": flux_norm,
            "flatness": flatness,
            "zcr": zcr_norm,
            "modulation": modulation_norm,
        }

        return spoof_prob, indicators

    def decide(self, score: float) -> str:
        return "bona_fide" if score < self.threshold else "spoof"


def decode_audio(audio_base64: str) -> tuple[np.ndarray, int | None]:
    try:
        raw = base64.b64decode(audio_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {exc}") from exc

    buffer = io.BytesIO(raw)

    try:
        waveform, sample_rate = torchaudio.load(buffer)
        if waveform.dim() == 2 and waveform.size(0) > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        waveform = waveform.squeeze(0)
        return waveform.numpy().astype(np.float32), int(sample_rate)
    except Exception:
        if len(raw) % 2 != 0:
            raise HTTPException(status_code=400, detail="PCM16 payload must have an even number of bytes.")
        audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
        return audio, None


class AntiSpoofService:
    def __init__(self, manifest_path: Path) -> None:
        manifest = load_model_manifest(manifest_path)
        antispoof_conf = manifest.get("antispoof", {})
        self.model_version = antispoof_conf.get("modelId", "spectral-heuristic-placeholder-v1")
        threshold = antispoof_conf.get("decisionThreshold", 0.5)
        sample_rate = antispoof_conf.get("sampleRate", DEFAULT_SAMPLE_RATE)
        self.model = AntiSpoofModel(threshold, sample_rate)
        self.sample_rate = sample_rate

    def score(self, request: AntiSpoofRequest) -> AntiSpoofResponse:
        start = time.perf_counter()
        waveform, detected_rate = decode_audio(request.audio_base64)
        effective_rate = detected_rate or request.sample_rate
        score, indicators = self.model.infer(waveform, effective_rate)
        decision = self.model.decide(score)
        latency_ms = (time.perf_counter() - start) * 1000.0
        confidence = float(np.clip(1.0 - abs(score - self.model.threshold) * 2.0, 0.0, 1.0))
        return AntiSpoofResponse(
            spoofScore=score,
            decision=decision,
            modelVersion=self.model_version,
            latencyMs=latency_ms,
            sampleRate=effective_rate,
            confidence=confidence,
            indicators=indicators,
        )


manifest_path = Path(__file__).resolve().parents[2] / "config" / "model_manifest.json"
service = AntiSpoofService(manifest_path)
app = FastAPI(
    title="Anti-Spoof Heuristic Placeholder",
    version="0.1.0",
    description="Development-only spectral heuristic. This is not AASIST or a production anti-spoof model.",
)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "modelVersion": service.model_version,
        "threshold": service.model.threshold,
        "modelType": "heuristic_placeholder",
        "productionReady": False,
    }


@app.post("/antispoof", response_model=AntiSpoofResponse)
async def antispoof(request: AntiSpoofRequest) -> AntiSpoofResponse:
    return service.score(request)
