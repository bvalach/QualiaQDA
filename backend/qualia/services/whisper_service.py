"""Whisper transcription service using faster-whisper.

Transcribes audio files to text with word-level timestamps.
Gracefully handles missing faster-whisper installation.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List

logger = logging.getLogger(__name__)

# Try importing faster-whisper — graceful fallback if not installed
_whisper_available = False
try:
    from faster_whisper import WhisperModel
    _whisper_available = True
except ImportError:
    logger.info("faster-whisper not installed — transcription unavailable")
    WhisperModel = None  # type: ignore

# Singleton model instance (loaded on first use)
_model_instance: Optional[object] = None


@dataclass
class TranscriptSegment:
    """A timestamped segment of transcribed text."""
    start: float  # seconds
    end: float    # seconds
    text: str


@dataclass
class TranscriptionResult:
    """Complete transcription result."""
    text: str  # full text
    segments: List[TranscriptSegment]
    language: str
    duration: float  # total audio duration in seconds


def is_whisper_available() -> bool:
    """Check if faster-whisper is installed."""
    return _whisper_available


def _get_model(model_size: str = "medium", device: str = "cpu") -> object:
    """Get or create the Whisper model (singleton)."""
    global _model_instance
    if _model_instance is None:
        if not _whisper_available:
            raise RuntimeError(
                "faster-whisper no esta instalado. "
                "Instala con: pip install faster-whisper"
            )
        compute_type = "int8" if device == "cpu" else "float16"
        logger.info("Loading Whisper model '%s' on %s...", model_size, device)
        _model_instance = WhisperModel(model_size, device=device, compute_type=compute_type)
        logger.info("Whisper model loaded.")
    return _model_instance


def transcribe(
    audio_path: str,
    *,
    model_size: str = "medium",
    device: str = "cpu",
    language: Optional[str] = None,
) -> TranscriptionResult:
    """Transcribe an audio file to text with timestamps.

    Args:
        audio_path: Path to the audio file (.mp3, .wav, .m4a, .ogg)
        model_size: Whisper model size (tiny, base, small, medium, large)
        device: Computation device (cpu, cuda, mps)
        language: Language code (e.g. 'es', 'en'). None for auto-detect.

    Returns:
        TranscriptionResult with full text and timestamped segments.
    """
    if not Path(audio_path).exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    model = _get_model(model_size, device)

    kwargs = {}
    if language:
        kwargs["language"] = language

    segments_iter, info = model.transcribe(  # type: ignore
        audio_path,
        beam_size=5,
        vad_filter=True,
        **kwargs,
    )

    segments = []
    full_text_parts = []

    for segment in segments_iter:
        seg = TranscriptSegment(
            start=round(segment.start, 2),
            end=round(segment.end, 2),
            text=segment.text.strip(),
        )
        segments.append(seg)
        full_text_parts.append(seg.text)

    full_text = " ".join(full_text_parts)
    detected_language = info.language if hasattr(info, "language") else "unknown"
    duration = info.duration if hasattr(info, "duration") else 0.0

    logger.info(
        "Transcribed %s: %d segments, %.1fs, language=%s",
        audio_path, len(segments), duration, detected_language,
    )

    return TranscriptionResult(
        text=full_text,
        segments=segments,
        language=detected_language,
        duration=round(duration, 2),
    )
