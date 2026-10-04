from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np

from utils.config import AppConfig, load_config
from .feature_extractor import FeatureExtractor
from .voice_comparison import VoiceComparator
from utils.io import FeatureStore
from ml.model_training import ModelManager


def _percentage_difference(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 100.0
    return float(np.linalg.norm(a - b) / ((norm_a + norm_b) / 2.0) * 100.0)


def compare_voice_versions(
    original_path: str | Path,
    test_path: str | Path,
    config: Optional[AppConfig] = None,
    *,
    persist: bool = False,
) -> Dict[str, Any]:
    app_config = config or load_config()
    extractor = FeatureExtractor(app_config)

    original_result = extractor.extract(original_path, identifier="original_temp", persist=persist)
    test_result = extractor.extract(test_path, identifier="test_temp", persist=persist)

    feature_store: FeatureStore = extractor.feature_store
    comparator = VoiceComparator(app_config, feature_store)
    comparison = comparator.compare(original_result.feature_vector, test_result.feature_vector)

    model_manager = ModelManager(app_config)
    ml_prediction = model_manager.predict(original_result.feature_vector, test_result.feature_vector)

    difference_percent = _percentage_difference(original_result.feature_vector, test_result.feature_vector)

    return {
        "features_original": original_result.feature_map,
        "features_test": test_result.feature_map,
        "difference_percent": difference_percent,
        "similarity_metrics": comparison.metrics,
        "is_potentially_ai": comparison.is_potentially_ai or (ml_prediction["label"] == "AI"),
        "ml_prediction": ml_prediction,
    }


