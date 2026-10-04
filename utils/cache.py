from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Callable, Optional, Tuple


class DiskCache:
    """
    Minimal disk-backed cache for expensive computations (e.g., deep embeddings).
    """

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _hash_key(self, key_data: Tuple[Any, ...]) -> str:
        serialized = json.dumps(key_data, sort_keys=True, default=str).encode("utf-8")
        return hashlib.sha256(serialized).hexdigest()

    def _path_for(self, key_data: Tuple[Any, ...]) -> Path:
        hashed = self._hash_key(key_data)
        return self.root / f"{hashed}.npy"

    def get(self, key_data: Tuple[Any, ...]) -> Optional[Path]:
        path = self._path_for(key_data)
        if path.exists():
            return path
        return None

    def store(self, key_data: Tuple[Any, ...], temp_file: Path) -> Path:
        destination = self._path_for(key_data)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_file.replace(destination)
        return destination


def cached_compute(
    cache: DiskCache,
    key_data: Tuple[Any, ...],
    compute_fn: Callable[[Path], Path],
) -> Path:
    cached = cache.get(key_data)
    if cached:
        return cached
    temp_path = compute_fn(cache.root)
    return cache.store(key_data, temp_path)


