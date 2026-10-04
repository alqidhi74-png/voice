from __future__ import annotations

import csv
import json
import tempfile
from pathlib import Path
from typing import Dict, Iterable, Sequence

import numpy as np

from .encryption import decrypt_bytes, encrypt_bytes, load_or_create_key


class FeatureStore:
    """
    Handles persistence of feature vectors with optional AES encryption.
    """

    def __init__(self, root: Path, *, encryption_key_path: Path, use_encryption: bool, key_length: int, env_var: str) -> None:
        self.root = root
        self.use_encryption = use_encryption
        self.root.mkdir(parents=True, exist_ok=True)
        self.key = load_or_create_key(encryption_key_path, key_length=key_length, env_var=env_var if use_encryption else None)

    def _resolve_path(self, identifier: str, extension: str) -> Path:
        safe_identifier = identifier.replace(" ", "_")
        return self.root / f"{safe_identifier}.{extension}"

    def save_numpy(self, identifier: str, vector: np.ndarray) -> Path:
        path = self._resolve_path(identifier, "npy.enc" if self.use_encryption else "npy")
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix="tmp_", suffix=".npy", delete=False) as handle:
            np.save(handle, vector, allow_pickle=False)
            temp_path = Path(handle.name)
        if self.use_encryption:
            payload = encrypt_bytes(temp_path.read_bytes(), self.key, associated_data=identifier.encode("utf-8"))
            path.write_bytes(payload)
            temp_path.unlink(missing_ok=True)
        else:
            temp_path.replace(path)
        return path

    def load_numpy(self, identifier: str) -> np.ndarray:
        path = self._resolve_path(identifier, "npy.enc" if self.use_encryption else "npy")
        if not path.exists():
            raise FileNotFoundError(f"Feature vector not found for {identifier}")
        if self.use_encryption:
            decrypted = decrypt_bytes(path.read_bytes(), self.key, associated_data=identifier.encode("utf-8"))
            temp = path.with_suffix(".dec")
            temp.write_bytes(decrypted)
            vector = np.load(temp, allow_pickle=False)
            temp.unlink(missing_ok=True)
            return vector
        return np.load(path, allow_pickle=False)

    def save_csv(self, identifier: str, feature_map: Dict[str, float]) -> Path:
        path = self._resolve_path(identifier, "csv.enc" if self.use_encryption else "csv")
        temp = path.with_suffix(".tmp")
        with temp.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["feature", "value"])
            for key, value in feature_map.items():
                writer.writerow([key, value])
        if self.use_encryption:
            payload = encrypt_bytes(temp.read_bytes(), self.key, associated_data=identifier.encode("utf-8"))
            path.write_bytes(payload)
            temp.unlink(missing_ok=True)
        else:
            temp.replace(path)
        return path

    def load_csv(self, identifier: str) -> Dict[str, float]:
        path = self._resolve_path(identifier, "csv.enc" if self.use_encryption else "csv")
        if not path.exists():
            raise FileNotFoundError(f"Feature CSV not found for {identifier}")
        if self.use_encryption:
            decrypted = decrypt_bytes(path.read_bytes(), self.key, associated_data=identifier.encode("utf-8"))
            temp = path.with_suffix(".dec")
            temp.write_bytes(decrypted)
            data = self._read_csv(temp)
            temp.unlink(missing_ok=True)
            return data
        return self._read_csv(path)

    def save_metadata(self, identifier: str, metadata: Dict[str, float], extension: str = "json") -> Path:
        path = self._resolve_path(identifier, f"{extension}.enc" if self.use_encryption else extension)
        payload = json.dumps(metadata, indent=2).encode("utf-8")
        if self.use_encryption:
            encrypted = encrypt_bytes(payload, self.key, associated_data=identifier.encode("utf-8"))
            path.write_bytes(encrypted)
        else:
            path.write_bytes(payload)
        return path

    def load_metadata(self, identifier: str, extension: str = "json") -> Dict[str, float]:
        path = self._resolve_path(identifier, f"{extension}.enc" if self.use_encryption else extension)
        if not path.exists():
            raise FileNotFoundError(f"Metadata not found for {identifier}")
        payload = path.read_bytes()
        if self.use_encryption:
            payload = decrypt_bytes(payload, self.key, associated_data=identifier.encode("utf-8"))
        return json.loads(payload.decode("utf-8"))

    @staticmethod
    def _read_csv(path: Path) -> Dict[str, float]:
        with path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            return {row["feature"]: float(row["value"]) for row in reader}


def stack_feature_vectors(vectors: Iterable[Sequence[float]]) -> np.ndarray:
    return np.vstack([np.asarray(vec, dtype=float) for vec in vectors])


