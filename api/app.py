from __future__ import annotations

import base64
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from core.feature_extractor import FeatureExtractor
from core.voice_comparison import VoiceComparator
from core.pipeline import compare_voice_versions
from ml.model_training import ModelManager
from utils.config import AppConfig, load_config


def get_app_config() -> AppConfig:
    return load_config()


def get_feature_extractor(config: AppConfig = Depends(get_app_config)) -> FeatureExtractor:
    if not hasattr(get_feature_extractor, "_instance"):
        get_feature_extractor._instance = FeatureExtractor(config)  # type: ignore[attr-defined]
    return get_feature_extractor._instance  # type: ignore[attr-defined]


def get_voice_comparator(config: AppConfig = Depends(get_app_config), extractor: FeatureExtractor = Depends(get_feature_extractor)) -> VoiceComparator:
    if not hasattr(get_voice_comparator, "_instance"):
        get_voice_comparator._instance = VoiceComparator(config, extractor.feature_store)  # type: ignore[attr-defined]
    return get_voice_comparator._instance  # type: ignore[attr-defined]


def get_model_manager(config: AppConfig = Depends(get_app_config)) -> ModelManager:
    if not hasattr(get_model_manager, "_instance"):
        get_model_manager._instance = ModelManager(config)  # type: ignore[attr-defined]
    return get_model_manager._instance  # type: ignore[attr-defined]


app = FastAPI(
    title="Voice Identity Shield",
    version="1.0.0",
    description="Voice authenticity verification API.",
)


@app.get("/health")
async def health(config: AppConfig = Depends(get_app_config)) -> dict:
    return {
        "status": "ok",
        "feature_store": str(config.feature_store),
        "model_registry": str(config.model_registry),
    }


def _decode_to_tempfile(file: UploadFile | None, base64_payload: Optional[str]) -> Path:
    if file is not None:
        suffix = Path(file.filename or "audio.wav").suffix or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file.file.read())
            return Path(tmp.name)
    if base64_payload:
        audio_bytes = base64.b64decode(base64_payload)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_bytes)
            return Path(tmp.name)
    raise HTTPException(status_code=400, detail="No audio payload provided.")


@app.post("/verify-voice")
async def verify_voice(
    user_identifier: str = Form(...),
    test_audio_base64: Optional[str] = Form(default=None),
    file: UploadFile | None = File(default=None),
    extractor: FeatureExtractor = Depends(get_feature_extractor),
    comparator: VoiceComparator = Depends(get_voice_comparator),
    model_manager: ModelManager = Depends(get_model_manager),
) -> JSONResponse:
    identifier = user_identifier
    try:
        original_vector = extractor.feature_store.load_numpy(identifier)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Voiceprint not found for {identifier}") from exc

    temp_path = _decode_to_tempfile(file, test_audio_base64)
    try:
        test_result = extractor.extract(temp_path, identifier=f"{identifier}_session", persist=False)
        comparison = comparator.compare(original_vector, test_result.feature_vector)
        ml_prediction = model_manager.predict(original_vector, test_result.feature_vector)

        response = {
            "user_identifier": identifier,
            "similarity_metrics": comparison.metrics,
            "ml_prediction": ml_prediction,
            "is_potentially_ai": comparison.is_potentially_ai or ml_prediction["label"] == "AI",
        }
        return JSONResponse(response)
    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/compare")
async def compare_endpoint(
    original_path: str,
    test_path: str,
    config: AppConfig = Depends(get_app_config),
) -> dict:
    result = compare_voice_versions(original_path, test_path, config=config, persist=False)
    return result

