"""
Utility functions to fuse embedding and anti-spoof scores and search for
thresholds that satisfy Accept/Challenge/Reject policies.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Tuple

import numpy as np


@dataclass
class FusionResult:
    accept_threshold: float
    challenge_threshold: float
    weights: Tuple[float, float]
    eer: float


def fuse_scores(
    embed_scores: Iterable[float],
    antispoof_scores: Iterable[float],
    weights: Tuple[float, float],
) -> np.ndarray:
    embed = np.asarray(list(embed_scores), dtype=np.float32)
    spoof = np.asarray(list(antispoof_scores), dtype=np.float32)
    if embed.shape != spoof.shape:
        raise ValueError("Score arrays must be the same length.")
    w_embed, w_spoof = weights
    return (w_embed * embed) + (w_spoof * (1.0 - spoof))


def save_calibration(result: FusionResult, output_path: Path) -> None:
    payload = {
        "acceptThreshold": result.accept_threshold,
        "challengeThreshold": result.challenge_threshold,
        "weights": {
            "embedding": result.weights[0],
            "antispoof": result.weights[1],
        },
        "eer": result.eer,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)

