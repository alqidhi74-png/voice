"""Evaluate an anti-spoof service against a labelled WAV corpus.

CSV format: path,label where label is 0/bona_fide or 1/spoof. This tool reports
EER, APCER, BPCER, accuracy, and Brier score without claiming min-tDCF (which
also requires ASV-system scores under the ASVspoof protocol).
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
from pathlib import Path
from urllib import request


def normalise_label(value: str) -> int:
    value = value.strip().lower()
    if value in {"1", "spoof", "fake", "synthetic"}:
        return 1
    if value in {"0", "bonafide", "bona_fide", "genuine", "real"}:
        return 0
    raise ValueError(f"Unsupported label: {value}")


def score_file(endpoint: str, audio_path: Path) -> float:
    payload = json.dumps({
        "audio_base64": base64.b64encode(audio_path.read_bytes()).decode("ascii"),
        "sample_rate": 16000,
    }).encode("utf-8")
    req = request.Request(endpoint, data=payload, headers={"Content-Type": "application/json"})
    with request.urlopen(req, timeout=30) as response:  # noqa: S310 - explicit operator endpoint
        data = json.load(response)
    return float(data["spoofScore"])


def rates(rows: list[tuple[int, float]], threshold: float) -> tuple[float, float]:
    genuine = [score for label, score in rows if label == 0]
    spoof = [score for label, score in rows if label == 1]
    bpcer = sum(score >= threshold for score in genuine) / len(genuine)
    apcer = sum(score < threshold for score in spoof) / len(spoof)
    return apcer, bpcer


def evaluate(rows: list[tuple[int, float]]) -> dict[str, float | int]:
    if not rows or not any(label == 0 for label, _ in rows) or not any(label == 1 for label, _ in rows):
        raise ValueError("The corpus must contain both bona-fide and spoof samples")

    thresholds = sorted({0.0, 1.0, *(score for _, score in rows)})
    candidates = [(threshold, *rates(rows, threshold)) for threshold in thresholds]
    threshold, apcer, bpcer = min(candidates, key=lambda item: abs(item[1] - item[2]))
    accuracy = sum((score >= threshold) == bool(label) for label, score in rows) / len(rows)
    brier = sum((score - label) ** 2 for label, score in rows) / len(rows)
    return {
        "samples": len(rows),
        "eer": (apcer + bpcer) / 2,
        "eerThreshold": threshold,
        "apcer": apcer,
        "bpcer": bpcer,
        "accuracy": accuracy,
        "brierScore": brier,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path, help="CSV containing path,label")
    parser.add_argument("--endpoint", default="http://127.0.0.1:8001/antispoof")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    scored: list[tuple[int, float]] = []
    with args.manifest.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            audio_path = (args.manifest.parent / row["path"]).resolve()
            scored.append((normalise_label(row["label"]), score_file(args.endpoint, audio_path)))

    report = json.dumps(evaluate(scored), indent=2)
    if args.output:
        args.output.write_text(report + "\n", encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
