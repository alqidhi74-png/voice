from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from utils.config import AppConfig, load_config
from utils.io import FeatureStore


MODEL_FILENAME = "voice_auth_classifier.joblib"


def _feature_engineering(original: np.ndarray, test: np.ndarray) -> np.ndarray:
    diff = test - original
    abs_diff = np.abs(diff)
    concat = np.concatenate([original, test, diff, abs_diff])
    return concat.astype(np.float32)


@dataclass
class TrainingSample:
    features: np.ndarray
    label: int


class DatasetBuilder:
    def __init__(self, feature_store: FeatureStore) -> None:
        self.feature_store = feature_store

    def load_manifest(self, manifest_path: Path) -> List[TrainingSample]:
        if not manifest_path.exists():
            raise FileNotFoundError(f"Manifest not found: {manifest_path}")

        with manifest_path.open("r", encoding="utf-8") as handle:
            manifest = json.load(handle)

        samples: List[TrainingSample] = []
        for entry in manifest:
            original_id = entry["original_id"]
            test_id = entry["test_id"]
            label = entry["label"]

            original_vec = self.feature_store.load_numpy(original_id)
            test_vec = self.feature_store.load_numpy(test_id)

            features = _feature_engineering(original_vec, test_vec)
            samples.append(TrainingSample(features=features, label=int(label)))
        return samples


class ModelTrainer:
    def __init__(self, config: Optional[AppConfig] = None) -> None:
        self.config = config or load_config()
        self.feature_store = FeatureStore(
            self.config.feature_store,
            encryption_key_path=self.config.encryption_key_file,
            use_encryption=self.config.encrypt_voiceprints,
            key_length=self.config.aes_key_length,
            env_var=self.config.aes_key_env,
        )
        self.dataset_builder = DatasetBuilder(self.feature_store)

    def _build_model(self, model_type: str) -> Pipeline:
        if model_type == "svm":
            classifier = SVC(
                probability=True,
                class_weight="balanced" if self.config.imbalance_strategy == "class_weight" else None,
                random_state=self.config.random_state,
            )
        else:
            classifier = RandomForestClassifier(
                n_estimators=300,
                random_state=self.config.random_state,
                class_weight="balanced" if self.config.imbalance_strategy == "class_weight" else None,
            )
        return Pipeline(
            steps=[
                ("scaler", StandardScaler()),
                ("classifier", classifier),
            ]
        )

    def train_from_manifest(self, manifest_path: Path, *, model_type: Optional[str] = None) -> Dict[str, float]:
        samples = self.dataset_builder.load_manifest(manifest_path)
        if not samples:
            raise ValueError("Training manifest is empty.")

        X = np.vstack([sample.features for sample in samples])
        y = np.array([sample.label for sample in samples], dtype=int)

        X_train, X_val, y_train, y_val = train_test_split(
            X,
            y,
            test_size=self.config.train_test_split,
            random_state=self.config.random_state,
            stratify=y if len(np.unique(y)) > 1 else None,
        )

        pipeline = self._build_model(model_type or self.config.default_classifier)
        pipeline.fit(X_train, y_train)

        y_pred = pipeline.predict(X_val)
        y_proba = pipeline.predict_proba(X_val)[:, 1]
        report = classification_report(y_val, y_pred, output_dict=True)
        auc = roc_auc_score(y_val, y_proba) if len(np.unique(y_val)) > 1 else float("nan")

        model_dir = self.config.model_registry
        model_dir.mkdir(parents=True, exist_ok=True)
        model_path = model_dir / MODEL_FILENAME
        joblib.dump(pipeline, model_path)

        return {
            "precision_human": report.get("0", {}).get("precision", 0.0),
            "precision_ai": report.get("1", {}).get("precision", 0.0),
            "recall_human": report.get("0", {}).get("recall", 0.0),
            "recall_ai": report.get("1", {}).get("recall", 0.0),
            "f1_human": report.get("0", {}).get("f1-score", 0.0),
            "f1_ai": report.get("1", {}).get("f1-score", 0.0),
            "roc_auc": auc,
        }


class ModelManager:
    def __init__(self, config: Optional[AppConfig] = None) -> None:
        self.config = config or load_config()
        self.model_path = self.config.model_registry / MODEL_FILENAME
        self.model: Optional[Pipeline] = None
        if self.model_path.exists():
            self.model = joblib.load(self.model_path)

    def _fallback_probability(self, cosine_similarity: float, euclidean_distance: float) -> float:
        cosine_component = 1.0 - cosine_similarity
        euclidean_component = np.tanh(euclidean_distance)
        return min(1.0, max(0.0, 0.5 * cosine_component + 0.5 * euclidean_component))

    def predict(self, original: np.ndarray, test: np.ndarray) -> Dict[str, float | str]:
        features = _feature_engineering(original, test)

        if self.model is not None:
            probabilities = self.model.predict_proba(features.reshape(1, -1))[0]
            ai_prob = float(probabilities[1])
        else:
            cosine_similarity = float(np.dot(original, test) / ((np.linalg.norm(original) * np.linalg.norm(test)) + 1e-9))
            euclidean_distance = float(np.linalg.norm(original - test))
            ai_prob = self._fallback_probability(cosine_similarity, euclidean_distance)

        label = "AI" if ai_prob >= 0.5 else "Human"
        confidence = ai_prob if label == "AI" else 1.0 - ai_prob

        return {
            "label": label,
            "confidence": float(confidence),
            "probability_ai": ai_prob,
            "model_loaded": self.model is not None,
        }


