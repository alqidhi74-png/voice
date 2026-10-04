from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def load_or_create_key(key_path: Path, *, key_length: int = 32, env_var: Optional[str] = None) -> bytes:
    """
    Load an AES key from the environment or disk. Generates a new key if not present.
    """
    if env_var:
        env_value = os.getenv(env_var)
        if env_value:
            try:
                key_bytes = base64.urlsafe_b64decode(env_value.encode("utf-8"))
                if len(key_bytes) not in (16, 24, 32):
                    raise ValueError("Environment-provided AES key must be 16, 24, or 32 bytes.")
                return key_bytes
            except Exception as exc:  # pragma: no cover - defensive
                raise ValueError(f"Invalid AES key in environment variable {env_var}: {exc}") from exc

    if key_path.exists():
        return key_path.read_bytes()

    key_path.parent.mkdir(parents=True, exist_ok=True)
    key = AESGCM.generate_key(bit_length=key_length * 8)
    key_path.write_bytes(key)
    return key


def encrypt_bytes(data: bytes, key: bytes, *, associated_data: Optional[bytes] = None) -> bytes:
    """
    Encrypt data with AES-GCM. Nonce is prepended to the ciphertext.
    """
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, data, associated_data)
    return nonce + ciphertext


def decrypt_bytes(payload: bytes, key: bytes, *, associated_data: Optional[bytes] = None) -> bytes:
    """
    Decrypt AES-GCM payload that includes the nonce prefix.
    """
    if len(payload) < 13:
        raise ValueError("Ciphertext too short for AES-GCM.")
    nonce, ciphertext = payload[:12], payload[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, associated_data)


