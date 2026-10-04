"""
Core audio processing pipeline for Voice Identity Shield.

Exports:
    FeatureExtractor: High-level feature extraction orchestrator.
    VoiceComparator: Similarity metric engine for enrolled vs test voices.
    compare_voice_versions: End-to-end comparison helper.
"""

from .feature_extractor import FeatureExtractor, FeatureExtractionResult  # noqa: F401
from .voice_comparison import VoiceComparator, ComparisonResult  # noqa: F401
from .pipeline import compare_voice_versions  # noqa: F401


