#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Command line interface for preparing audio corpora used by the Voice Identity Shield
microservices. The tool normalises audio, optionally segments it for embedding
training, and caches feature representations for faster experimentation.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional

try:
    import torch
    import torchaudio
except ImportError as exc:  # pragma: no cover - handled at runtime
    raise SystemExit(
        "torchaudio and torch are required for the preprocessing CLI. "
        "Install them with the appropriate CUDA build before running this script."
    ) from exc


SUPPORTED_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}


@dataclass
class ProcessingSummary:
    input_path: str
    output_path: str
    task: str
    processed_files: int
    skipped_files: int
    segments_created: int
    feature_type: Optional[str]
    segment_ms: Optional[int]
    hop_ms: Optional[int]
    sample_rate: int = 16000


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audio preprocessing toolkit")
    parser.add_argument("input_root", type=Path, help="Directory containing raw audio organised by speaker.")
    parser.add_argument("output_root", type=Path, help="Directory to store processed outputs and metadata.")

    parser.add_argument(
        "--task",
        choices=["embed", "antispoof"],
        default="embed",
        help="Embedding pipeline segments audio; antispoof preserves original length.",
    )
    parser.add_argument("--segment-ms", type=int, default=1600, help="Segment length in milliseconds (embed only).")
    parser.add_argument(
        "--hop-ms",
        type=int,
        default=800,
        help="Hop length between segments in milliseconds (embed only). Defaults to 50%% overlap.",
    )
    parser.add_argument(
        "--max-speakers",
        type=int,
        default=None,
        help="Limit the number of speaker folders processed. Useful for smoke tests.",
    )
    parser.add_argument(
        "--max-files-per-speaker",
        type=int,
        default=None,
        help="Limit number of utterances processed per speaker.",
    )
    parser.add_argument(
        "--feature-type",
        choices=["none", "logmel"],
        default="logmel",
        help="Optional feature cache to generate alongside waveforms.",
    )
    parser.add_argument(
        "--n-mels", type=int, default=64, help="Number of mel bins when computing log-mel features."
    )
    parser.add_argument(
        "--metadata-name",
        type=str,
        default="manifest.json",
        help="Name of the manifest file written under the output root.",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=16000,
        help="Target sample rate used for normalisation. Defaults to 16 kHz.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List files that would be processed without generating outputs.",
    )
    return parser.parse_args(argv)


def discover_audio_files(root: Path) -> Dict[str, List[Path]]:
    speakers: Dict[str, List[Path]] = defaultdict(list)
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        speaker_id = path.parent.parts[-2] if len(path.parent.parts) >= 2 else path.parent.name
        speakers[speaker_id].append(path)
    return speakers


def _resample_if_needed(waveform: torch.Tensor, sample_rate: int, target_rate: int) -> torch.Tensor:
    if sample_rate == target_rate:
        return waveform
    resampler = torchaudio.transforms.Resample(sample_rate, target_rate)
    return resampler(waveform)


def _to_mono(waveform: torch.Tensor) -> torch.Tensor:
    if waveform.size(0) == 1:
        return waveform
    return waveform.mean(dim=0, keepdim=True)


def _segment_waveform(
    waveform: torch.Tensor, sample_rate: int, segment_ms: int, hop_ms: int
) -> Iterable[torch.Tensor]:
    segment_samples = int(sample_rate * (segment_ms / 1000.0))
    hop_samples = int(sample_rate * (hop_ms / 1000.0))
    if segment_samples <= 0:
        raise ValueError("segment_ms must be > 0")
    if hop_samples <= 0:
        hop_samples = segment_samples

    length = waveform.size(1)
    if length < segment_samples:
        return []

    segments: List[torch.Tensor] = []
    for start in range(0, length - segment_samples + 1, hop_samples):
        end = start + segment_samples
        segments.append(waveform[:, start:end])
    return segments


def _compute_logmel(
    waveform: torch.Tensor, sample_rate: int, n_mels: int, eps: float = 1e-6
) -> torch.Tensor:
    spectrogram = torchaudio.transforms.MelSpectrogram(
        sample_rate=sample_rate, n_mels=n_mels, n_fft=1024, hop_length=256, power=2.0
    )(waveform)
    return torch.log(spectrogram + eps)


def process_corpus(args: argparse.Namespace) -> ProcessingSummary:
    speaker_map = discover_audio_files(args.input_root)
    if args.max_speakers is not None:
        speaker_ids = sorted(speaker_map.keys())[: args.max_speakers]
        speaker_map = {spk: speaker_map[spk][: args.max_files_per_speaker] if args.max_files_per_speaker else speaker_map[spk] for spk in speaker_ids}
    elif args.max_files_per_speaker is not None:
        speaker_map = {
            spk: files[: args.max_files_per_speaker]
            for spk, files in speaker_map.items()
        }

    output_audio = args.output_root / "audio"
    output_features = args.output_root / "features" if args.feature_type != "none" else None
    manifest_path = args.output_root / args.metadata_name

    if not args.dry_run:
        output_audio.mkdir(parents=True, exist_ok=True)
        if output_features is not None:
            output_features.mkdir(parents=True, exist_ok=True)

    metadata: List[Dict[str, object]] = []
    processed_files = 0
    skipped_files = 0
    segments_created = 0

    for speaker_id, files in speaker_map.items():
        for file_path in files:
            try:
                waveform, sample_rate = torchaudio.load(str(file_path))
            except Exception as exc:  # pragma: no cover - depends on codec availability
                skipped_files += 1
                print(f"[WARN] Failed to load {file_path}: {exc}", file=sys.stderr)
                continue

            waveform = _to_mono(waveform)
            waveform = _resample_if_needed(waveform, sample_rate, args.sample_rate)

            segments: Iterable[torch.Tensor]
            if args.task == "embed":
                segments = _segment_waveform(waveform, args.sample_rate, args.segment_ms, args.hop_ms)
                if not segments:
                    skipped_files += 1
                    continue
            else:
                segments = [waveform]

            for idx, segment in enumerate(segments):
                segments_created += 1
                relative_segment = (
                    Path(speaker_id) / f"{file_path.stem}_seg{idx:03d}.pt"
                    if args.task == "embed"
                    else Path(speaker_id) / f"{file_path.stem}.pt"
                )
                audio_path = output_audio / relative_segment

                if args.dry_run:
                    print(f"[DRY-RUN] Would write {audio_path}")
                else:
                    audio_path.parent.mkdir(parents=True, exist_ok=True)
                    torch.save({"waveform": segment, "sample_rate": args.sample_rate}, audio_path)

                feature_path = None
                if args.feature_type == "logmel":
                    feature_tensor = _compute_logmel(segment, args.sample_rate, args.n_mels)
                    relative_feature = relative_segment.with_suffix(".logmel.pt")
                    feature_path = output_features / relative_feature if output_features else None
                    if feature_path is not None:
                        if args.dry_run:
                            print(f"[DRY-RUN] Would write {feature_path}")
                        else:
                            feature_path.parent.mkdir(parents=True, exist_ok=True)
                            torch.save(
                                {
                                    "feature": feature_tensor,
                                    "sample_rate": args.sample_rate,
                                    "n_mels": args.n_mels,
                                },
                                feature_path,
                            )

                metadata.append(
                    {
                        "speaker_id": speaker_id,
                        "source": str(file_path),
                        "audio": str(audio_path) if not args.dry_run else str(audio_path),
                        "feature": str(feature_path) if feature_path else None,
                        "segment_index": idx,
                        "segment_ms": args.segment_ms if args.task == "embed" else None,
                    }
                )

            processed_files += 1

    if not args.dry_run:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        with manifest_path.open("w", encoding="utf-8") as fp:
            json.dump(metadata, fp, indent=2)

    return ProcessingSummary(
        input_path=str(args.input_root),
        output_path=str(args.output_root),
        task=args.task,
        processed_files=processed_files,
        skipped_files=skipped_files,
        segments_created=segments_created,
        feature_type=None if args.feature_type == "none" else args.feature_type,
        segment_ms=args.segment_ms if args.task == "embed" else None,
        hop_ms=args.hop_ms if args.task == "embed" else None,
        sample_rate=args.sample_rate,
    )


def main(argv: Optional[List[str]] = None) -> None:
    args = parse_args(argv)
    summary = process_corpus(args)
    print(json.dumps(asdict(summary), indent=2))


if __name__ == "__main__":  # pragma: no cover
    main(sys.argv[1:])

