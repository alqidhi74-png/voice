#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Utility script for downloading the SpeechBrain ECAPA-TDNN checkpoint and
staging it for the embedding microservice.

Usage:
    python ml/export/embed_export.py --version 1.0.0
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Optional

from speechbrain.pretrained import EncoderClassifier

DEFAULT_SOURCE = "speechbrain/spkrec-ecapa-voxceleb"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export SpeechBrain ECAPA-TDNN checkpoint")
    parser.add_argument(
        "--version",
        required=True,
        help="Semantic version tag used to write the export directory (e.g., 1.0.0).",
    )
    parser.add_argument(
        "--source",
        default=DEFAULT_SOURCE,
        help=f"SpeechBrain model identifier (default: {DEFAULT_SOURCE}).",
    )
    parser.add_argument(
        "--device",
        default="cpu",
        help="Device to use while exporting (cpu or cuda:X).",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("models/export/embed"),
        help="Root directory where exported models are stored.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("config/model_manifest.json"),
        help="Optional manifest to update with the exported model metadata.",
    )
    return parser.parse_args()


def export_model(args: argparse.Namespace) -> Path:
    export_dir = args.output_root / f"ecapa-{args.version}"
    export_dir.mkdir(parents=True, exist_ok=True)

    classifier = EncoderClassifier.from_hparams(
        source=args.source,
        savedir=str(export_dir),
        run_opts={"device": args.device},
    )

    classifier.save_pretrained(str(export_dir))

    embedding_dim = int(classifier.mods.embedding_model.dense3.out_features)
    metadata = {
        "modelId": f"ecapa-{args.version}",
        "source": args.source,
        "exportedAt": dt.datetime.utcnow().isoformat() + "Z",
        "embeddingDim": embedding_dim,
        "artifactPath": str(export_dir),
        "sampleRate": 16000,
    }

    with (export_dir / "metadata.json").open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    return export_dir


def update_manifest(manifest_path: Path, metadata: dict) -> None:
    if not manifest_path.exists():
        manifest = {}
    else:
        with manifest_path.open("r", encoding="utf-8") as handle:
            manifest = json.load(handle)

    manifest.setdefault("embedding", {})
    manifest["embedding"].update(metadata)

    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)


def main() -> None:
    args = parse_args()
    export_dir = export_model(args)
    metadata_path = export_dir / "metadata.json"
    with metadata_path.open("r", encoding="utf-8") as handle:
        metadata = json.load(handle)

    update_manifest(args.manifest, metadata)
    print(f"Exported ECAPA-TDNN to {export_dir} and updated manifest {args.manifest}")


if __name__ == "__main__":
    main()

