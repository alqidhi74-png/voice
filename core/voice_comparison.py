from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np
import librosa
from scipy.spatial.distance import cosine, euclidean

from utils.config import AppConfig
from utils.io import FeatureStore


@dataclass
class ComparisonResult:
    cosine_similarity: float
    euclidean_distance: float
    dtw_similarity: float
    ensemble_score: float
    is_potentially_ai: bool
    metrics: Dict[str, float]


class VoiceComparator:
    def __init__(self, config: AppConfig, feature_store: FeatureStore) -> None:
        self.config = config
        self.feature_store = feature_store

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        cos_dist = cosine(a, b)
        if np.isnan(cos_dist):
            return 0.0
        return float(1.0 - cos_dist)

    def _euclidean_distance(self, a: np.ndarray, b: np.ndarray) -> float:
        return float(euclidean(a, b))

    def _dtw_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        cost_matrix, path = librosa.sequence.dtw(a.reshape(1, -1), b.reshape(1, -1))
        if cost_matrix.size == 0:
            return 1.0
        terminal_cost = float(cost_matrix[-1, -1])
        path_length = max(len(path), 1)
        norm_distance = terminal_cost / path_length
        return float(1.0 / (1.0 + norm_distance))

    def compare(self, original: np.ndarray, test: np.ndarray) -> ComparisonResult:
        cosine_sim = self._cosine_similarity(original, test)
        euclid_dist = self._euclidean_distance(original, test)
        dtw_sim = self._dtw_similarity(original, test)

        weights = self.config.ensemble_weights
        ensemble_score = (
            weights.get("cosine", 0.0) * cosine_sim
            + weights.get("euclidean", 0.0) * (1.0 / (1.0 + euclid_dist))
            + weights.get("dtw", 0.0) * dtw_sim
        )

        is_potentially_ai = any(
            [
                cosine_sim < self.config.cosine_threshold,
                euclid_dist > self.config.euclidean_threshold,
                dtw_sim < self.config.dtw_threshold,
                ensemble_score < self.config.cosine_threshold,
            ]
        )

        metrics = {
            "cosine_similarity": cosine_sim,
            "euclidean_distance": euclid_dist,
            "dtw_similarity": dtw_sim,
            "ensemble_score": ensemble_score,
        }

        return ComparisonResult(
            cosine_similarity=cosine_sim,
            euclidean_distance=euclid_dist,
            dtw_similarity=dtw_sim,
            ensemble_score=ensemble_score,
            is_potentially_ai=is_potentially_ai,
            metrics=metrics,
        )

    def compare_identifiers(self, original_id: str, test_id: str) -> ComparisonResult:
        original = self.feature_store.load_numpy(original_id)
        test = self.feature_store.load_numpy(test_id)
        return self.compare(original, test)


