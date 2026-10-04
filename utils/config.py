from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

import yaml


@dataclass(frozen=True)
class AppConfig:
    raw: Dict[str, Any]

    @property
    def feature_store(self) -> Path:
        return Path(self.raw["paths"]["feature_store"]).resolve()

    @property
    def cache_dir(self) -> Path:
        return Path(self.raw["paths"]["cache_dir"]).resolve()

    @property
    def encryption_key_file(self) -> Path:
        return Path(self.raw["paths"]["encryption_key_file"]).resolve()

    @property
    def wav2vec2_model(self) -> str:
        return self.raw["paths"]["wav2vec2_model"]

    @property
    def hubert_model(self) -> str:
        return self.raw["paths"]["hubert_model"]

    @property
    def whisper_model(self) -> str:
        return self.raw["paths"]["whisper_model"]

    @property
    def ecapa_model(self) -> str:
        return self.raw["paths"]["ecapa_model"]

    @property
    def vggish_model(self) -> str:
        return self.raw["paths"]["vggish_model"]

    @property
    def openl3_model(self) -> str:
        return self.raw["paths"]["openl3_model"]

    @property
    def model_registry(self) -> Path:
        return Path(self.raw["paths"]["model_registry"]).resolve()

    @property
    def target_sample_rate(self) -> int:
        return int(self.raw["audio"]["target_sample_rate"])

    @property
    def mono(self) -> bool:
        return bool(self.raw["audio"]["mono"])

    @property
    def max_duration_seconds(self) -> float:
        return float(self.raw["audio"]["max_duration_seconds"])

    @property
    def trim_db(self) -> float:
        return float(self.raw["audio"]["trim_db"])

    @property
    def pre_emphasis(self) -> float:
        return float(self.raw["audio"]["pre_emphasis"])

    @property
    def vad_sensitivity(self) -> float:
        return float(self.raw["audio"]["vad_sensitivity"])

    @property
    def cosine_threshold(self) -> float:
        return float(self.raw["comparison"]["cosine_threshold"])

    @property
    def euclidean_threshold(self) -> float:
        return float(self.raw["comparison"]["euclidean_threshold"])

    @property
    def dtw_threshold(self) -> float:
        return float(self.raw["comparison"]["dtw_threshold"])

    @property
    def ensemble_weights(self) -> Dict[str, float]:
        return dict(self.raw["comparison"]["ensemble_weights"])

    @property
    def default_classifier(self) -> str:
        return str(self.raw["model"]["default_classifier"])

    @property
    def random_state(self) -> int:
        return int(self.raw["model"]["random_state"])

    @property
    def train_test_split(self) -> float:
        return float(self.raw["model"]["train_test_split"])

    @property
    def imbalance_strategy(self) -> str:
        return str(self.raw["model"]["imbalance_strategy"])

    @property
    def aes_key_env(self) -> str:
        return str(self.raw["security"]["aes_key_env"])

    @property
    def aes_key_length(self) -> int:
        return int(self.raw["security"]["aes_key_length"])

    @property
    def encrypt_voiceprints(self) -> bool:
        return bool(self.raw["security"]["encrypt_voiceprints"])


def load_config(path: str | Path | None = None) -> AppConfig:
    config_path = Path(path or Path(__file__).resolve().parents[1] / "config" / "config.yaml")
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found at {config_path}")

    with config_path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)

    if not isinstance(data, dict):
        raise ValueError(f"Invalid configuration structure in {config_path}")

    return AppConfig(raw=data)


