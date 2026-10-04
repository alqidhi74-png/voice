from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4

import numpy as np
import torch
from transformers import (
    AutoModel,
    AutoProcessor,
    Wav2Vec2Model,
    Wav2Vec2Processor,
    WhisperModel,
    WhisperProcessor,
)

# ---------------------------------------------------------------------------
# Compatibility fixes for optional audio dependencies
# ---------------------------------------------------------------------------
try:
    import torchaudio  # type: ignore

    if not hasattr(torchaudio, "list_audio_backends"):
        torchaudio.list_audio_backends = lambda: []  # type: ignore[attr-defined]
except Exception:  # pragma: no cover - torchaudio is optional in test envs
    torchaudio = None  # type: ignore

try:
    import openl3  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    openl3 = None  # type: ignore

try:
    from speechbrain.pretrained import EncoderClassifier  # pragma: no cover - optional
except ImportError:
    EncoderClassifier = None  # type: ignore

from ml.services.embedding_service import FEATURE_ORDER, compute_audio_features, EmbeddingModel
from utils.cache import DiskCache, cached_compute
from utils.config import AppConfig
from utils.io import FeatureStore
from .preprocessing import AudioPreprocessor, PreprocessingConfig


@dataclass
class FeatureExtractionResult:
    feature_map: Dict[str, float]
    feature_vector: np.ndarray
    embeddings: Dict[str, np.ndarray]
    metadata: Dict[str, Any]


class FeatureExtractor:
    """
    High-level orchestrator that extracts 57 canonical features plus deep embeddings.
    """

    def __init__(self, config: AppConfig) -> None:
        self.config = config
        preprocess_cfg = PreprocessingConfig(
            target_sample_rate=config.target_sample_rate,
            mono=config.mono,
            max_duration_seconds=config.max_duration_seconds,
            trim_db=config.trim_db,
            pre_emphasis=config.pre_emphasis,
        )
        self.preprocessor = AudioPreprocessor(preprocess_cfg)
        self.feature_store = FeatureStore(
            config.feature_store,
            encryption_key_path=config.encryption_key_file,
            use_encryption=config.encrypt_voiceprints,
            key_length=config.aes_key_length,
            env_var=config.aes_key_env,
        )
        self.cache = DiskCache(config.cache_dir)

        self._wav2vec2_processor: Optional[Wav2Vec2Processor] = None
        self._wav2vec2_model: Optional[Wav2Vec2Model] = None
        self._hubert_processor: Optional[Any] = None
        self._hubert_model: Optional[AutoModel] = None
        self._whisper_processor: Optional[WhisperProcessor] = None
        self._whisper_model: Optional[WhisperModel] = None
        self._ecapa: Optional[EmbeddingModel] = None
        self._vggish: Optional[torch.nn.Module] = None

    def _hash_waveform(self, waveform: np.ndarray) -> str:
        return hashlib.sha256(waveform.tobytes()).hexdigest()

    def _cached_embedding(self, name: str, fingerprint: str, compute_fn) -> np.ndarray:
        def _compute(root: Path) -> Path:
            temp_path = root / f"{uuid4().hex}.npy"
            embedding = compute_fn()
            np.save(temp_path, embedding)
            return temp_path

        path = cached_compute(self.cache, (name, fingerprint), _compute)
        return np.load(path, allow_pickle=False)

    def _load_wav2vec2(self) -> None:
        if self._wav2vec2_model is None or self._wav2vec2_processor is None:
            self._wav2vec2_processor = Wav2Vec2Processor.from_pretrained(self.config.wav2vec2_model)
            self._wav2vec2_model = Wav2Vec2Model.from_pretrained(self.config.wav2vec2_model)
            self._wav2vec2_model.eval()

    def _load_hubert(self) -> None:
        if self._hubert_model is None or self._hubert_processor is None:
            self._hubert_processor = AutoProcessor.from_pretrained(self.config.hubert_model)
            self._hubert_model = AutoModel.from_pretrained(self.config.hubert_model)
            self._hubert_model.eval()

    def _load_whisper(self) -> None:
        if self._whisper_model is None or self._whisper_processor is None:
            self._whisper_processor = WhisperProcessor.from_pretrained(self.config.whisper_model)
            self._whisper_model = WhisperModel.from_pretrained(self.config.whisper_model)
            self._whisper_model.eval()

    def _load_ecapa(self) -> None:
        if self._ecapa is None:
            self._ecapa = EmbeddingModel(
                embedding_dim=192,
                artifact_path=None,
                sample_rate=self.config.target_sample_rate,
            )

    def _load_vggish(self) -> None:
        if self._vggish is None:
            try:
                self._vggish = torch.hub.load("harritaylor/torchvggish", "vggish", pretrained=True)  # type: ignore[attr-defined]
                self._vggish.eval()
            except Exception:  # pragma: no cover - optional dependency
                self._vggish = None

    def _embedding_stats(self, embedding: np.ndarray) -> Dict[str, float]:
        if embedding.size == 0:
            return dict(norm=0.0, mean=0.0, std=0.0, skew=0.0, kurtosis=0.0, p90=0.0)
        emb = embedding.astype(np.float64)
        norm = float(np.linalg.norm(emb))
        mean = float(np.mean(emb))
        std = float(np.std(emb))
        centered = (emb - mean) / (std + 1e-9)
        skew = float(np.mean(centered**3))
        kurtosis = float(np.mean(centered**4))
        p90 = float(np.percentile(np.abs(emb), 90))
        return dict(norm=norm, mean=mean, std=std, skew=skew, kurtosis=kurtosis, p90=p90)

    def _compute_wav2vec2(self, waveform: np.ndarray, sample_rate: int, fingerprint: str) -> np.ndarray:
        def _run():
            self._load_wav2vec2()
            assert self._wav2vec2_processor is not None and self._wav2vec2_model is not None
            inputs = self._wav2vec2_processor(waveform, sampling_rate=sample_rate, return_tensors="pt", padding=True)
            with torch.no_grad():
                outputs = self._wav2vec2_model(**inputs)
            return outputs.last_hidden_state.mean(dim=1).squeeze().cpu().numpy().astype(np.float32)

        return self._cached_embedding("wav2vec2", fingerprint, _run)

    def _compute_hubert(self, waveform: np.ndarray, sample_rate: int, fingerprint: str) -> np.ndarray:
        def _run():
            self._load_hubert()
            assert self._hubert_processor is not None and self._hubert_model is not None
            inputs = self._hubert_processor(waveform, sampling_rate=sample_rate, return_tensors="pt", padding=True)
            with torch.no_grad():
                outputs = self._hubert_model(**inputs)
            return outputs.last_hidden_state.mean(dim=1).squeeze().cpu().numpy().astype(np.float32)

        return self._cached_embedding("hubert", fingerprint, _run)

    def _compute_whisper(self, waveform: np.ndarray, sample_rate: int, fingerprint: str) -> np.ndarray:
        def _run():
            self._load_whisper()
            assert self._whisper_processor is not None and self._whisper_model is not None
            features = self._whisper_processor.feature_extractor(
                waveform,
                sampling_rate=sample_rate,
                return_tensors="pt"
            ).input_features
            with torch.no_grad():
                outputs = self._whisper_model.encoder(features)
            return outputs.last_hidden_state.mean(dim=1).squeeze().cpu().numpy().astype(np.float32)

        return self._cached_embedding("whisper", fingerprint, _run)

    def _compute_ecapa(self, waveform: np.ndarray, sample_rate: int, fingerprint: str) -> np.ndarray:
        def _run():
            self._load_ecapa()
            assert self._ecapa is not None
            return self._ecapa.infer(waveform, sample_rate).astype(np.float32)

        return self._cached_embedding("ecapa", fingerprint, _run)

    def _compute_vggish(self, waveform: np.ndarray, sample_rate: int, fingerprint: str) -> np.ndarray:
        def _run():
            self._load_vggish()
            if self._vggish is None:
                return np.zeros(128, dtype=np.float32)
            tensor = torch.from_numpy(waveform).unsqueeze(0)
            if tensor.ndim == 2:
                tensor = tensor.unsqueeze(0)
            with torch.no_grad():
                embedding = self._vggish(tensor)
            return embedding.squeeze().cpu().numpy().astype(np.float32)

        return self._cached_embedding("vggish", fingerprint, _run)

    def _compute_openl3(self, waveform: np.ndarray, sample_rate: int, fingerprint: str) -> np.ndarray:
        def _run():
            if openl3 is None:
                return np.zeros(512, dtype=np.float32)
            embedding, _ = openl3.get_audio_embedding(
                waveform,
                sample_rate,
                embedding_size=512,
                content_type="speech",
                center=True,
            )
            return np.mean(embedding, axis=0).astype(np.float32)

        return self._cached_embedding("openl3", fingerprint, _run)

    def extract(self, audio_path: str | Path, identifier: Optional[str] = None, persist: bool = True) -> FeatureExtractionResult:
        waveform, sample_rate = self.preprocessor.run(audio_path)
        fingerprint = self._hash_waveform(waveform)

        embeddings: Dict[str, np.ndarray] = {}
        embeddings["wav2vec2"] = self._compute_wav2vec2(waveform, sample_rate, fingerprint)
        embeddings["hubert"] = self._compute_hubert(waveform, sample_rate, fingerprint)
        embeddings["whisper"] = self._compute_whisper(waveform, sample_rate, fingerprint)
        embeddings["ecapa"] = self._compute_ecapa(waveform, sample_rate, fingerprint)
        embeddings["vggish"] = self._compute_vggish(waveform, sample_rate, fingerprint)
        embeddings["openl3"] = self._compute_openl3(waveform, sample_rate, fingerprint)

        feature_map = compute_audio_features(waveform, sample_rate, embedding=embeddings["ecapa"])

        wav2vec_stats = self._embedding_stats(embeddings["wav2vec2"])
        hubert_stats = self._embedding_stats(embeddings["hubert"])
        whisper_stats = self._embedding_stats(embeddings["whisper"])
        ecapa_stats = self._embedding_stats(embeddings["ecapa"])
        vggish_stats = self._embedding_stats(embeddings["vggish"])
        openl3_stats = self._embedding_stats(embeddings["openl3"])

        feature_map.update(
            {
                "embedding_wav2vec2_proxy": wav2vec_stats["norm"],
                "embedding_hubert_proxy": hubert_stats["std"],
                "embedding_whisper_proxy": whisper_stats["mean"],
                "embedding_speaker_proxy": ecapa_stats["p90"],
                "embedding_vggish_proxy": vggish_stats["skew"],
                "embedding_openl3_proxy": openl3_stats["kurtosis"],
            }
        )

        feature_vector = np.array([feature_map[name] for name in FEATURE_ORDER], dtype=np.float32)
        metadata = {
            "sample_rate": sample_rate,
            "fingerprint": fingerprint,
            "identifier": identifier or Path(audio_path).stem,
            "duration_seconds": len(waveform) / max(sample_rate, 1),
        }

        if persist and identifier:
            self.feature_store.save_numpy(identifier, feature_vector)
            self.feature_store.save_csv(identifier, feature_map)
            self.feature_store.save_metadata(identifier, metadata)

        return FeatureExtractionResult(
            feature_map=feature_map,
            feature_vector=feature_vector,
            embeddings=embeddings,
            metadata=metadata,
        )

