from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

import numpy as np
import librosa
import soundfile as sf
from scipy.signal import lfilter


@dataclass
class PreprocessingConfig:
    target_sample_rate: int
    mono: bool
    max_duration_seconds: float
    trim_db: float
    pre_emphasis: float


class AudioPreprocessor:
    """
    Applies canonical preprocessing steps before feature extraction.
    """

    def __init__(self, config: PreprocessingConfig) -> None:
        self.config = config

    def load(self, path: str | Path | bytes) -> Tuple[np.ndarray, int]:
        if isinstance(path, (str, Path)):
            waveform, sr = librosa.load(path, sr=None, mono=False)
        else:
            buffer = io.BytesIO(path)
            waveform, sr = sf.read(buffer, dtype="float32", always_2d=True)
            waveform = waveform.T

        if self.config.mono and waveform.ndim == 2:
            waveform = np.mean(waveform, axis=0)
        waveform = np.asarray(waveform, dtype=np.float32)
        return waveform, sr

    def resample(self, waveform: np.ndarray, sample_rate: int) -> Tuple[np.ndarray, int]:
        if sample_rate == self.config.target_sample_rate:
            return waveform, sample_rate
        resampled = librosa.resample(waveform, orig_sr=sample_rate, target_sr=self.config.target_sample_rate)
        return resampled.astype(np.float32), self.config.target_sample_rate

    def trim(self, waveform: np.ndarray) -> np.ndarray:
        trimmed, _ = librosa.effects.trim(waveform, top_db=self.config.trim_db)
        return trimmed

    def apply_pre_emphasis(self, waveform: np.ndarray) -> np.ndarray:
        return lfilter([1, -self.config.pre_emphasis], [1], waveform)

    def enforce_duration(self, waveform: np.ndarray, sample_rate: int) -> np.ndarray:
        max_samples = int(self.config.max_duration_seconds * sample_rate)
        if waveform.shape[-1] > max_samples:
            return waveform[..., :max_samples]
        return waveform

    def normalize(self, waveform: np.ndarray) -> np.ndarray:
        max_abs = np.max(np.abs(waveform)) + 1e-9
        return waveform / max_abs

    def run(self, source: str | Path | bytes) -> Tuple[np.ndarray, int]:
        waveform, sr = self.load(source)
        waveform, sample_rate = self.resample(waveform, sr)
        waveform = self.trim(waveform)
        waveform = self.apply_pre_emphasis(waveform)
        waveform = self.enforce_duration(waveform, sample_rate)
        waveform = self.normalize(waveform)
        return waveform, sample_rate


