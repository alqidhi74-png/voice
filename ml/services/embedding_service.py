"""
FastAPI microservice skeleton for speaker embedding inference.

The service is intentionally model-agnostic so it can host TorchScript, ONNX, or
Python-native checkpoints. The default implementation returns zero vectors until
a trained model is wired in.
"""

from __future__ import annotations

import base64
import inspect
import io
import json
import logging
import math
import time
from pathlib import Path
from typing import Mapping, Optional, Sequence

import librosa
import numpy as np
import torch
import torch.nn.functional as F

try:
    import torchaudio  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    torchaudio = None  # type: ignore

from fastapi import FastAPI, HTTPException
from librosa import note_to_hz
from librosa.util import normalize
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Compatibility fixes for optional audio dependencies
# ---------------------------------------------------------------------------
if torchaudio is not None and not hasattr(torchaudio, "list_audio_backends"):
    torchaudio.list_audio_backends = lambda: []  # type: ignore[attr-defined]

try:
    from speechbrain.pretrained import EncoderClassifier
except ImportError:  # pragma: no cover - dependency managed via requirements
    EncoderClassifier = None  # type: ignore

try:  # pragma: no cover - dependency managed via requirements
    from speechbrain.lobes.models.ECAPA_TDNN import TDNNBlock
except ImportError:  # pragma: no cover - dependency managed via requirements
    TDNNBlock = None  # type: ignore
def _patch_tdnnblock_forward_signature() -> None:
    """
    SpeechBrain <0.5.15 shipped TDNNBlock.forward without the ``lengths`` keyword.
    Later releases added ``lengths`` and the ECAPA pipeline now unconditionally
    passes it. When projects depend on a newer checkpoint but an older library,
    SpeechBrain raises ``TypeError: unexpected keyword argument 'lengths'``.

    To keep the service resilient, we detect the signature mismatch at runtime
    and shim in a compatible wrapper that simply ignores the ``lengths`` argument.
    """
    if TDNNBlock is None:
        return

    try:
        signature = inspect.signature(TDNNBlock.forward)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return

    if "lengths" in signature.parameters:
        return

    original_forward = TDNNBlock.forward

    def _wrapped_forward(self, x, lengths=None):  # type: ignore[override]
        return original_forward(self, x)

    TDNNBlock.forward = _wrapped_forward  # type: ignore[assignment]


def _ensure_waveform_duration(
    waveform: np.ndarray,
    sample_rate: int,
    minimum_duration_seconds: float = 0.5,
) -> np.ndarray:
    """
    Pads short waveforms with silence so convolutional front-ends that expect
    multiple frames do not crash with padding errors (e.g. SpeechBrain ECAPA).
    """
    if sample_rate <= 0 or waveform.size == 0:
        return waveform

    min_samples = max(int(sample_rate * minimum_duration_seconds), 1)
    if waveform.size >= min_samples:
        return waveform

    pad_width = min_samples - waveform.size
    return np.pad(waveform, (0, pad_width), mode="constant")


DEFAULT_EMBEDDING_DIM = 192
DEFAULT_SAMPLE_RATE = 16000
DEFAULT_MODEL_SOURCE = "speechbrain/spkrec-ecapa-voxceleb"
CACHE_DIR = Path.home() / ".voice_identity_shield" / "models"

logger = logging.getLogger("voice_identity_shield.embedding_service")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

N_FFT = 2048
HOP_LENGTH = 512
FRAME_LENGTH = 2048
PYIN_FMIN = note_to_hz("C2")
PYIN_FMAX = note_to_hz("C7")

FEATURE_ORDER: list[str] = [
    # Spectral features
    "spectral_mfccs",
    "spectral_centroid",
    "spectral_bandwidth",
    "spectral_contrast",
    "spectral_flatness",
    "spectral_rolloff",
    "spectral_flux",
    "spectral_entropy",
    "spectral_chroma",
    "spectral_tonnetz",
    # Temporal features
    "temporal_short_term_energy",
    "temporal_energy_variance",
    "temporal_zero_crossing_rate",
    "temporal_jitter",
    "temporal_shimmer",
    "temporal_hnr",
    "temporal_voice_breaks",
    "temporal_modulation_energy",
    "temporal_attack_time",
    "temporal_decay_time",
    # Prosodic features
    "prosodic_fundamental_frequency",
    "prosodic_pitch_range",
    "prosodic_speaking_rate",
    "prosodic_pause_duration",
    "prosodic_intonation_variation",
    "prosodic_stress_patterns",
    "prosodic_syllable_duration_variance",
    "prosodic_emotional_dynamics",
    "prosodic_voice_onset_time",
    "prosodic_loudness_contour",
    # Phase & residual features
    "phase_group_delay",
    "phase_instantaneous_phase",
    "phase_residual_distortion",
    "phase_coherence",
    "phase_modulation_spectrum",
    "phase_cepstral_coefficients",
    # Model / vocoder artifact features
    "artifact_reconstruction",
    "artifact_aliasing",
    "artifact_vocoder_fingerprint",
    "artifact_noise_floor",
    "artifact_absence_of_breathing",
    "artifact_background_consistency",
    "artifact_sample_rate_mismatch",
    "artifact_bitrate_signature",
    "artifact_glitch_click",
    "artifact_speech_smoothness",
    # Deep embedding proxy features
    "embedding_wav2vec2_proxy",
    "embedding_hubert_proxy",
    "embedding_whisper_proxy",
    "embedding_speaker_proxy",
    "embedding_vggish_proxy",
    "embedding_openl3_proxy",
    # Statistical & derived features
    "stat_acoustic_moment_mean",
    "stat_acoustic_moment_variance",
    "stat_temporal_derivative_energy",
    "stat_entropy_pitch_energy",
    "stat_spectrogram_texture",
]


def load_model_manifest(manifest_path: Path) -> dict:
    if not manifest_path.exists():
        return {}
    with manifest_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _ensure_finite(value: float, default: float = 0.0) -> float:
    if not math.isfinite(value):
        return default
    return float(value)


def _safe_mean(array: Sequence[float], default: float = 0.0) -> float:
    if array is None:
        return default
    arr = np.asarray(array, dtype=np.float64)
    if arr.size == 0:
        return default
    mean_value = float(np.nanmean(arr))
    if not math.isfinite(mean_value):
        return default
    return mean_value


def _safe_std(array: Sequence[float], default: float = 0.0) -> float:
    arr = np.asarray(array, dtype=np.float64)
    if arr.size == 0:
        return default
    std_value = float(np.nanstd(arr))
    if not math.isfinite(std_value):
        return default
    return std_value


def _safe_ratio(numerator: float, denominator: float, default: float = 0.0) -> float:
    if denominator == 0:
        return default
    return _ensure_finite(numerator / denominator, default)


def _normalize_features(feature_map: Mapping[str, float]) -> dict[str, float]:
    normalized = {}
    for key in FEATURE_ORDER:
        value = feature_map.get(key, 0.0)
        if isinstance(value, (list, tuple, np.ndarray)):
            value = _safe_mean(value)
        normalized[key] = _ensure_finite(float(value))
    return normalized


def compute_audio_features(waveform: np.ndarray, sample_rate: int, embedding: Optional[np.ndarray] = None) -> dict[str, float]:
    """
    Compute the 57-feature bundle used for downstream comparison and analytics.
    Falls back to zeros when intermediate calculations fail.
    """
    features: dict[str, float] = {}

    if waveform.size == 0 or sample_rate <= 0:
        return {key: 0.0 for key in FEATURE_ORDER}

    try:
        y = waveform.astype(np.float32)
        if np.max(np.abs(y)) > 0:
            y = normalize(y)
        duration = len(y) / float(sample_rate)
        if duration <= 0:
            duration = 1.0

        stft_complex = librosa.stft(y=y, n_fft=N_FFT, hop_length=HOP_LENGTH, win_length=FRAME_LENGTH, center=True)
        S = np.abs(stft_complex) + 1e-10
        power_spectrum = S**2
        freqs = librosa.fft_frequencies(sr=sample_rate, n_fft=N_FFT)
        mel_spec = librosa.feature.melspectrogram(y=y, sr=sample_rate, n_fft=N_FFT, hop_length=HOP_LENGTH)
        mfcc_full = librosa.feature.mfcc(y=y, sr=sample_rate, n_mfcc=20)

        rms = librosa.feature.rms(y=y, frame_length=FRAME_LENGTH, hop_length=HOP_LENGTH)[0]
        zcr = librosa.feature.zero_crossing_rate(y=y, frame_length=FRAME_LENGTH, hop_length=HOP_LENGTH)[0]
        centroid = librosa.feature.spectral_centroid(S=S, sr=sample_rate)[0]
        bandwidth = librosa.feature.spectral_bandwidth(S=S, sr=sample_rate)[0]
        contrast = librosa.feature.spectral_contrast(S=S, sr=sample_rate)
        flatness = librosa.feature.spectral_flatness(S=S)[0]
        rolloff = librosa.feature.spectral_rolloff(S=S, sr=sample_rate, roll_percent=0.85)[0]
        chroma = librosa.feature.chroma_stft(S=S, sr=sample_rate)
        harmonic = librosa.effects.harmonic(y)
        tonnetz = librosa.feature.tonnetz(y=harmonic, sr=sample_rate)
        onset_env = librosa.onset.onset_strength(y=y, sr=sample_rate, hop_length=HOP_LENGTH)

        # Spectral entropy
        norm_power = power_spectrum / (np.sum(power_spectrum, axis=0, keepdims=True) + 1e-10)
        entropy_vals = -np.sum(norm_power * np.log2(norm_power + 1e-10), axis=0)

        # Spectral flux
        flux = np.sqrt(np.sum(np.diff(S, axis=1) ** 2, axis=0)) / (S.shape[0] + 1e-10)

        # Temporal statistics
        energy_mean = _safe_mean(rms)
        energy_var = _ensure_finite(float(np.var(rms))) if rms.size else 0.0

        # Pitch contour using PYIN (guard against failures)
        try:
            f0, voiced_flag, voiced_prob = librosa.pyin(
                y,
                fmin=PYIN_FMIN,
                fmax=PYIN_FMAX,
                sr=sample_rate,
                frame_length=FRAME_LENGTH,
                hop_length=HOP_LENGTH,
            )
        except Exception as exc:  # pragma: no cover
            logger.debug("pyin failed: %s", exc)
            f0 = None
            voiced_flag = None
            voiced_prob = None

        if f0 is None:
            f0 = np.full((S.shape[1],), np.nan, dtype=np.float32)
            voiced_flag = np.zeros_like(f0, dtype=bool)

        valid_f0 = f0[~np.isnan(f0)]
        voiced_mask = voiced_flag.astype(bool) if voiced_flag is not None else np.isfinite(f0)

        jitter = 0.0
        shimmer = 0.0
        if valid_f0.size > 1:
            jitter = _ensure_finite(float(np.mean(np.abs(np.diff(valid_f0)) / (valid_f0[:-1] + 1e-10))))

        if rms.size > 1:
            shimmer = _ensure_finite(float(np.mean(np.abs(np.diff(rms)) / (rms[:-1] + 1e-10))))

        harmonic_energy = float(np.sum(harmonic ** 2))
        noise_component = y - harmonic
        noise_energy = float(np.sum(noise_component ** 2))
        hnr = 0.0
        if noise_energy > 0:
            hnr = _ensure_finite(10 * math.log10((harmonic_energy + 1e-10) / (noise_energy + 1e-10)))

        voice_breaks = 0.0
        if voiced_mask is not None and voiced_mask.size:
            voice_breaks = _ensure_finite(float(np.mean(~voiced_mask)))

        modulation_energy = 0.0
        if onset_env.size:
            modulation_energy = _ensure_finite(float(np.mean(np.abs(np.fft.rfft(onset_env)) ** 2)))

        # Attack & decay time from RMS envelope
        if rms.size == 0:
            attack_time = 0.0
            decay_time = 0.0
        else:
            rms_norm = rms / (np.max(rms) + 1e-10)
            attack_idx = np.argmax(rms_norm >= 0.9)
            attack_time = _ensure_finite(float(attack_idx * HOP_LENGTH / sample_rate))
            peak_idx = np.argmax(rms_norm)
            decay_idx = peak_idx
            for idx in range(peak_idx, rms_norm.size):
                if rms_norm[idx] <= 0.1:
                    decay_idx = idx
                    break
            decay_time = _ensure_finite(float((decay_idx - peak_idx) * HOP_LENGTH / sample_rate))

        # Prosodic derived metrics
        f0_mean = _safe_mean(valid_f0)
        f0_range = 0.0
        if valid_f0.size > 0:
            f0_range = _ensure_finite(float(np.max(valid_f0) - np.min(valid_f0)))
        speaking_rate = 0.0
        syllable_variance = 0.0
        voice_onset_time = 0.0

        onsets = np.asarray(
            librosa.onset.onset_detect(
                onset_envelope=onset_env,
                sr=sample_rate,
                hop_length=HOP_LENGTH,
                units="time"
            ),
            dtype=np.float64
        )
        if onsets.size > 1 and duration > 0:
            speaking_rate = _ensure_finite(float(onsets.size / duration))
            syllable_intervals = np.diff(onsets)
            syllable_variance = _ensure_finite(float(np.var(syllable_intervals)))

        if voiced_mask is not None and voiced_mask.size:
            first_voiced = np.argmax(voiced_mask)
            if voiced_mask[first_voiced]:
                voice_onset_time = _ensure_finite(float(first_voiced * HOP_LENGTH / sample_rate))

        # Pause duration estimation using energy-based segmentation
        splits = librosa.effects.split(y, top_db=35)
        if splits.size == 0:
            pause_duration = duration
        else:
            speech_durations = np.sum((splits[:, 1] - splits[:, 0]) / sample_rate)
            pause_duration = _ensure_finite(float((duration - speech_durations) / max(splits.shape[0], 1)))

        intonation_variation = _safe_std(valid_f0)
        stress_patterns = 0.0
        if rms.size:
            stress_patterns = _ensure_finite(float(np.mean(rms > np.mean(rms))))

        emotional_dynamics = 0.0
        if valid_f0.size and rms.size:
            # Align RMS (frame-based) and F0 (pyin) sequences
            min_len = min(valid_f0.size, rms.size)
            if min_len > 1:
                f0_resampled = np.interp(np.linspace(0, valid_f0.size - 1, num=min_len), np.arange(valid_f0.size), valid_f0)
                rms_resampled = np.interp(np.linspace(0, rms.size - 1, num=min_len), np.arange(rms.size), rms)
                corr_matrix = np.corrcoef(f0_resampled, rms_resampled)
                emotional_dynamics = _ensure_finite(float(corr_matrix[0, 1]))

        loudness_contour = _safe_std(rms)

        # Phase & residual features
        phase = np.angle(stft_complex)
        unwrapped_phase = np.unwrap(phase, axis=0)
        group_delay = np.diff(unwrapped_phase, axis=0)
        instantaneous_phase = np.diff(np.unwrap(phase, axis=1), axis=1)

        phase_coherence = 0.0
        if stft_complex.size:
            phase_coherence = _ensure_finite(float(np.mean(np.abs(np.mean(np.exp(1j * phase), axis=0)))))

        residual_distortion = _safe_std(phase)
        modulation_phase = _safe_std(instantaneous_phase)

        log_spectrum = np.log(power_spectrum + 1e-10)
        cepstrum = np.fft.ifft(log_spectrum, axis=0).real
        if cepstrum.size:
            cepstral_coeff = _ensure_finite(float(np.mean(np.abs(cepstrum[:13, :]))))
        else:
            cepstral_coeff = 0.0

        # Model / vocoder heuristics
        reconstruction_artifacts = _ensure_finite(float(np.mean(np.abs(noise_component))))

        alias_mask = freqs >= (0.45 * (sample_rate / 2))
        alias_energy = float(np.sum(power_spectrum[alias_mask, :]))
        total_energy = float(np.sum(power_spectrum))
        aliasing = _safe_ratio(alias_energy, total_energy)

        if freqs.size > 10:
            mean_spectrum = np.mean(S, axis=1)
            freq_mask = freqs > 0
            if np.count_nonzero(freq_mask) > 10:
                slope, _ = np.polyfit(np.log(freqs[freq_mask]), np.log(mean_spectrum[freq_mask] + 1e-10), deg=1)
                vocoder_fingerprint = _ensure_finite(float(slope))
            else:
                vocoder_fingerprint = 0.0
        else:
            vocoder_fingerprint = 0.0

        quiet_threshold = np.percentile(rms, 20) if rms.size else 0.0
        quiet_frames = rms <= quiet_threshold
        noise_floor = _safe_mean(rms[quiet_frames]) if quiet_frames.any() else 0.0

        low_band_mask = (freqs >= 80) & (freqs <= 400)
        low_band_energy = float(np.sum(power_spectrum[low_band_mask, :]))
        absence_breathing = 1.0 - _safe_ratio(low_band_energy, total_energy)

        background_consistency = 0.0
        if quiet_frames.any():
            noise_floor_variation = _safe_std(rms[quiet_frames])
            background_consistency = 1.0 - _ensure_finite(noise_floor_variation / (noise_floor + 1e-6))

        sample_rate_mismatch = _safe_ratio(
            float(np.sum(power_spectrum[freqs >= 0.9 * (sample_rate / 2), :])),
            total_energy,
        )

        bitrate_signature = _ensure_finite(float(np.mean(np.abs(np.diff(y)))))
        glitch_click = 0.0
        if y.size > 3:
            diff_signal = np.diff(y, n=2)
            if diff_signal.size:
                glitch_click = _ensure_finite(float(np.mean(np.abs(diff_signal))))

        speech_smoothness = 1.0 - min(1.0, shimmer)

        # Deep embedding & statistical features (post embedding, placeholders use embedding stats later)
        features.update({
            "spectral_mfccs": _ensure_finite(float(np.mean(np.abs(mfcc_full)))),
            "spectral_centroid": _safe_mean(centroid),
            "spectral_bandwidth": _safe_mean(bandwidth),
            "spectral_contrast": _safe_mean(contrast),
            "spectral_flatness": _safe_mean(flatness),
            "spectral_rolloff": _safe_mean(rolloff),
            "spectral_flux": _safe_mean(flux),
            "spectral_entropy": _safe_mean(entropy_vals),
            "spectral_chroma": _safe_mean(chroma),
            "spectral_tonnetz": _safe_mean(tonnetz),
            "temporal_short_term_energy": energy_mean,
            "temporal_energy_variance": energy_var,
            "temporal_zero_crossing_rate": _safe_mean(zcr),
            "temporal_jitter": jitter,
            "temporal_shimmer": shimmer,
            "temporal_hnr": hnr,
            "temporal_voice_breaks": voice_breaks,
            "temporal_modulation_energy": modulation_energy,
            "temporal_attack_time": attack_time,
            "temporal_decay_time": decay_time,
            "prosodic_fundamental_frequency": f0_mean,
            "prosodic_pitch_range": f0_range,
            "prosodic_speaking_rate": speaking_rate,
            "prosodic_pause_duration": pause_duration,
            "prosodic_intonation_variation": intonation_variation,
            "prosodic_stress_patterns": stress_patterns,
            "prosodic_syllable_duration_variance": syllable_variance,
            "prosodic_emotional_dynamics": emotional_dynamics,
            "prosodic_voice_onset_time": voice_onset_time,
            "prosodic_loudness_contour": loudness_contour,
            "phase_group_delay": _safe_mean(np.abs(group_delay)),
            "phase_instantaneous_phase": _safe_mean(np.abs(instantaneous_phase)),
            "phase_residual_distortion": residual_distortion,
            "phase_coherence": phase_coherence,
            "phase_modulation_spectrum": modulation_phase,
            "phase_cepstral_coefficients": cepstral_coeff,
            "artifact_reconstruction": reconstruction_artifacts,
            "artifact_aliasing": aliasing,
            "artifact_vocoder_fingerprint": vocoder_fingerprint,
            "artifact_noise_floor": noise_floor,
            "artifact_absence_of_breathing": absence_breathing,
            "artifact_background_consistency": background_consistency,
            "artifact_sample_rate_mismatch": sample_rate_mismatch,
            "artifact_bitrate_signature": bitrate_signature,
            "artifact_glitch_click": glitch_click,
            "artifact_speech_smoothness": speech_smoothness,
        })

        # Statistical derived features using MFCCs and RMS dynamics
        mfcc_matrix = mfcc_full[:13, :] if mfcc_full.shape[0] >= 13 else mfcc_full
        mfcc_mean = _safe_mean(mfcc_matrix)
        mfcc_var = _ensure_finite(float(np.var(mfcc_matrix))) if mfcc_matrix.size else 0.0
        mfcc_delta = librosa.feature.delta(mfcc_matrix)
        mfcc_delta_energy = _ensure_finite(float(np.mean(mfcc_delta**2))) if mfcc_delta.size else 0.0

        pitch_energy_entropy = 0.0
        if valid_f0.size and rms.size:
            pitch_prob = np.abs(valid_f0) / (np.sum(np.abs(valid_f0)) + 1e-10)
            energy_prob = np.abs(rms[: valid_f0.size]) / (np.sum(np.abs(rms[: valid_f0.size])) + 1e-10)
            combined = (pitch_prob + energy_prob) / 2.0
            pitch_energy_entropy = _ensure_finite(float(-np.sum(combined * np.log2(combined + 1e-10))))

        texture = 0.0
        if mel_spec.size:
            texture = _ensure_finite(float(np.std(librosa.power_to_db(mel_spec))))

        features.update({
            "stat_acoustic_moment_mean": mfcc_mean,
            "stat_acoustic_moment_variance": mfcc_var,
            "stat_temporal_derivative_energy": mfcc_delta_energy,
            "stat_entropy_pitch_energy": pitch_energy_entropy,
            "stat_spectrogram_texture": texture,
        })

    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to compute full feature bundle: %s", exc)
        return {key: 0.0 for key in FEATURE_ORDER}

    # Placeholder embedding-dependent features (update below if embedding provided)
    for key in (
        "embedding_wav2vec2_proxy",
        "embedding_hubert_proxy",
        "embedding_whisper_proxy",
        "embedding_speaker_proxy",
        "embedding_vggish_proxy",
        "embedding_openl3_proxy",
    ):
        features.setdefault(key, 0.0)

    if embedding is not None and embedding.size:
        emb = embedding.astype(np.float64)
        emb_abs = np.abs(emb)
        emb_mean = _safe_mean(emb)
        emb_std = _safe_std(emb)
        emb_norm = _ensure_finite(float(np.linalg.norm(emb)))
        emb_skew = _ensure_finite(float(np.mean(((emb - emb_mean) / (emb_std + 1e-10)) ** 3)))
        emb_kurtosis = _ensure_finite(float(np.mean(((emb - emb_mean) / (emb_std + 1e-10)) ** 4)))

        features.update({
            "embedding_wav2vec2_proxy": emb_norm,
            "embedding_hubert_proxy": emb_std,
            "embedding_whisper_proxy": emb_mean,
            "embedding_speaker_proxy": _ensure_finite(float(np.percentile(emb_abs, 90))),
            "embedding_vggish_proxy": emb_skew,
            "embedding_openl3_proxy": emb_kurtosis,
        })

    normalized = _normalize_features(features)
    return normalized



class EmbedRequest(BaseModel):
    audio_base64: str = Field(..., description="Base64 encoded mono PCM16 audio sampled at 16 kHz.")
    sample_rate: int = Field(DEFAULT_SAMPLE_RATE, description="Sample rate of the encoded audio.")
    request_id: Optional[str] = Field(None, description="Optional request identifier propagated from the caller.")


class EmbedResponse(BaseModel):
    embedding: list[float]
    modelVersion: str
    latencyMs: float
    sampleRate: int = DEFAULT_SAMPLE_RATE
    features: dict[str, float]
    featureVector: list[float]
    featureNames: list[str]


class EmbeddingModel:
    """
    Loads a SpeechBrain ECAPA-TDNN encoder if available, otherwise falls back to
    returning zero vectors so the service can still operate in placeholder mode.
    """

    def __init__(self, embedding_dim: int, artifact_path: Optional[str], sample_rate: int) -> None:
        self.embedding_dim = embedding_dim
        self.sample_rate = sample_rate
        self.artifact_path = artifact_path
        self.model_source: Optional[str] = None
        self.classifier: Optional[EncoderClassifier] = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        _patch_tdnnblock_forward_signature()

        if EncoderClassifier is None:
            print("[WARN] speechbrain is not installed; using zero-vector fallback.")
            return

        cache_dir = CACHE_DIR
        cache_dir.mkdir(parents=True, exist_ok=True)

        load_source: Optional[str] = None

        if artifact_path:
            path = Path(artifact_path)
            if path.exists():
                load_source = str(path)
                self.model_source = load_source
            else:
                print(f"[WARN] Embedding artifact path {artifact_path} does not exist. Falling back to default ECAPA model.")

        if load_source is None:
            load_source = DEFAULT_MODEL_SOURCE
            self.model_source = DEFAULT_MODEL_SOURCE

        try:
            # SpeechBrain caches checkpoints automatically; we keep our own cache dir for clarity.
            run_opts = {"device": str(self.device)}
            self.classifier = EncoderClassifier.from_hparams(
                source=load_source,
                savedir=str(cache_dir / "ecapa_tdnn"),
                run_opts=run_opts,
            )
            dense_layer = getattr(self.classifier.mods.embedding_model, "dense3", None)
            if dense_layer is not None and hasattr(dense_layer, "out_features"):
                self.embedding_dim = int(dense_layer.out_features)
        except Exception as exc:  # pragma: no cover - depends on runtime env
            self.classifier = None
            print(f"[WARN] Failed to load SpeechBrain encoder ({load_source}): {exc}")

    def infer(self, waveform: np.ndarray, sample_rate: int) -> np.ndarray:
        if self.classifier is None:
            return np.zeros(self.embedding_dim, dtype=np.float32)

        waveform = _ensure_waveform_duration(waveform, sample_rate)
        waveform_tensor = torch.from_numpy(waveform.astype(np.float32))
        if waveform_tensor.dim() == 1:
            waveform_tensor = waveform_tensor.unsqueeze(0)

        effective_tensor = waveform_tensor
        if sample_rate != self.sample_rate:
            try:
                effective_tensor = torchaudio.functional.resample(
                    waveform_tensor, sample_rate, self.sample_rate
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to resample audio from {sample_rate}Hz to {self.sample_rate}Hz: {exc}",
                ) from exc

        min_samples = max(int(self.sample_rate * 0.5), 1)
        if effective_tensor.size(-1) < min_samples:
            pad_amount = min_samples - effective_tensor.size(-1)
            effective_tensor = F.pad(effective_tensor, (0, pad_amount))

        effective_tensor = effective_tensor.to(self.device)

        with torch.no_grad():
            embedding = self.classifier.encode_batch(effective_tensor)

        embedding_np = embedding.squeeze().cpu().numpy()
        if embedding_np.ndim != 1:
            embedding_np = np.reshape(embedding_np, (-1,))

        if embedding_np.size != self.embedding_dim:
            embedding_np = embedding_np.astype(np.float32)
            embedding_np = embedding_np.flatten()
            if embedding_np.size != self.embedding_dim:
                # Pad or truncate to expected dimension for downstream compatibility.
                if embedding_np.size > self.embedding_dim:
                    embedding_np = embedding_np[: self.embedding_dim]
                else:
                    embedding_np = np.pad(
                        embedding_np,
                        (0, self.embedding_dim - embedding_np.size),
                        mode="constant",
                    )

        return embedding_np.astype(np.float32)


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
        # Fallback to raw PCM16 little-endian
        if len(raw) % 2 != 0:
            raise HTTPException(status_code=400, detail="PCM16 payload must have an even number of bytes.")
        audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
        return audio, None


class EmbeddingService:
    def __init__(self, manifest_path: Path) -> None:
        manifest = load_model_manifest(manifest_path)
        self.model_version = manifest.get("embedding", {}).get("modelId", "unknown")
        embedding_conf = manifest.get("embedding", {})
        embedding_dim = embedding_conf.get("embeddingDim", DEFAULT_EMBEDDING_DIM)
        artifact_path = embedding_conf.get("artifactPath")
        sample_rate = embedding_conf.get("sampleRate", DEFAULT_SAMPLE_RATE)
        self.model = EmbeddingModel(embedding_dim, artifact_path, sample_rate)
        self.sample_rate = sample_rate

    def embed(self, request: EmbedRequest) -> EmbedResponse:
        start = time.perf_counter()
        waveform, detected_rate = decode_audio(request.audio_base64)
        effective_rate = detected_rate or request.sample_rate
        conditioned_waveform = _ensure_waveform_duration(waveform, effective_rate)
        embedding = self.model.infer(conditioned_waveform, effective_rate)
        feature_bundle = compute_audio_features(conditioned_waveform, effective_rate, embedding)
        feature_vector = [feature_bundle.get(name, 0.0) for name in FEATURE_ORDER]
        latency_ms = (time.perf_counter() - start) * 1000.0
        return EmbedResponse(
            embedding=embedding.tolist(),
            modelVersion=self.model_version,
            latencyMs=latency_ms,
            sampleRate=effective_rate,
            features=feature_bundle,
            featureVector=feature_vector,
            featureNames=FEATURE_ORDER,
        )


manifest_path = Path(__file__).resolve().parents[2] / "config" / "model_manifest.json"
service = EmbeddingService(manifest_path)
app = FastAPI(title="Embedding Service", version="0.1.0", description="Speaker embedding inference endpoint.")


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "modelVersion": service.model_version,
        "embeddingDim": service.model.embedding_dim,
    }


@app.post("/embed", response_model=EmbedResponse)
async def embed(request: EmbedRequest) -> EmbedResponse:
    return service.embed(request)


@app.post("/batch/embed")
async def batch_embed(requests: list[EmbedRequest]) -> dict:
    responses = [service.embed(item) for item in requests]
    return {
        "results": [response.dict() for response in responses],
        "count": len(responses),
    }

