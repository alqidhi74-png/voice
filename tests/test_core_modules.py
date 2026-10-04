from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Dict

import numpy as np
import soundfile as sf
import pytest

from core.feature_extractor import FeatureExtractor
from core.voice_comparison import VoiceComparator
from core.pipeline import compare_voice_versions
from ml.model_training import ModelManager
from utils.config import AppConfig, load_config
from utils.io import FeatureStore
from ml.services.embedding_service import FEATURE_ORDER


@pytest.fixture(scope="module")
def sine_wave(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("audio") / "sine.wav"
    sr = 16000
    t = np.linspace(0, 1, sr, endpoint=False)
    waveform = 0.5 * np.sin(2 * np.pi * 440 * t)
    sf.write(path, waveform, sr)
    return path


def build_test_config(tmp_path: Path) -> AppConfig:
    base = load_config().raw
    raw = deepcopy(base)
    raw["paths"]["feature_store"] = str(tmp_path / "features")
    raw["paths"]["cache_dir"] = str(tmp_path / "cache")
    raw["paths"]["encryption_key_file"] = str(tmp_path / "key.bin")
    raw["paths"]["model_registry"] = str(tmp_path / "models")
    raw["security"]["encrypt_voiceprints"] = False
    return AppConfig(raw=raw)


@pytest.fixture()
def test_config(tmp_path) -> AppConfig:
    return build_test_config(tmp_path)


def patch_embeddings(extractor: FeatureExtractor) -> None:
    def constant_vector(size: int):
        return np.linspace(0.1, 0.9, size, dtype=np.float32)

    extractor._compute_wav2vec2 = lambda *args, **kwargs: constant_vector(5)  # type: ignore[assignment]
    extractor._compute_hubert = lambda *args, **kwargs: constant_vector(6)  # type: ignore[assignment]
    extractor._compute_whisper = lambda *args, **kwargs: constant_vector(7)  # type: ignore[assignment]
    extractor._compute_ecapa = lambda *args, **kwargs: constant_vector(8)  # type: ignore[assignment]
    extractor._compute_vggish = lambda *args, **kwargs: constant_vector(9)  # type: ignore[assignment]
    extractor._compute_openl3 = lambda *args, **kwargs: constant_vector(10)  # type: ignore[assignment]


def test_feature_extraction_pipeline(sine_wave: Path, test_config: AppConfig) -> None:
    extractor = FeatureExtractor(test_config)
    patch_embeddings(extractor)

    result = extractor.extract(sine_wave, identifier="test_sample", persist=True)

    assert len(result.feature_map) == len(FEATURE_ORDER)
    assert result.feature_vector.shape[0] == len(FEATURE_ORDER)

    stored_path = test_config.feature_store / "test_sample.npy"
    assert stored_path.exists()


def test_voice_comparator_metrics(test_config: AppConfig) -> None:
    feature_store = FeatureStore(
        test_config.feature_store,
        encryption_key_path=test_config.encryption_key_file,
        use_encryption=False,
        key_length=test_config.aes_key_length,
        env_var=test_config.aes_key_env,
    )
    comparator = VoiceComparator(test_config, feature_store)

    original = np.ones(len(FEATURE_ORDER), dtype=np.float32)
    test = np.ones(len(FEATURE_ORDER), dtype=np.float32) * 0.95

    result = comparator.compare(original, test)

    assert "cosine_similarity" in result.metrics
    assert result.cosine_similarity > 0.9
    assert result.ensemble_score > 0


def test_model_manager_fallback(test_config: AppConfig) -> None:
    manager = ModelManager(test_config)
    original = np.ones(len(FEATURE_ORDER), dtype=np.float32)
    test = np.ones(len(FEATURE_ORDER), dtype=np.float32)
    prediction = manager.predict(original, test)
    assert prediction["label"] in {"AI", "Human"}


def test_compare_voice_versions(sine_wave: Path, test_config: AppConfig, monkeypatch) -> None:
    extractor = FeatureExtractor(test_config)
    patch_embeddings(extractor)

    monkeypatch.setattr("core.pipeline.FeatureExtractor", lambda config: extractor)
    monkeypatch.setattr("core.pipeline.ModelManager", lambda config: ModelManager(test_config))

    result = compare_voice_versions(sine_wave, sine_wave, config=test_config, persist=False)
    assert "similarity_metrics" in result
    assert "ml_prediction" in result


