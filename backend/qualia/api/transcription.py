"""Transcription endpoints — Whisper-based audio → text with timestamps.

POST /api/transcription/{doc_id}         — transcribe an audio document
GET  /api/transcription/{doc_id}/status  — check if transcription is available
GET  /api/transcription/whisper-status   — check if Whisper is installed
"""
from __future__ import annotations

import hashlib
import json
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import Document
from qualia.services.whisper_service import (
    is_whisper_available,
    transcribe,
)

router = APIRouter(prefix="/api/transcription", tags=["transcription"])


# ── Pydantic schemas ──────────────────────────────────────────────

class TranscribeRequest(BaseModel):
    language: Optional[str] = None  # 'es', 'en', None for auto-detect
    model_size: str = "medium"       # tiny, base, small, medium, large


class SegmentOut(BaseModel):
    start: float
    end: float
    text: str


class TranscriptionOut(BaseModel):
    document_id: str
    text: str
    segments: List[SegmentOut]
    language: str
    duration: float


class WhisperStatus(BaseModel):
    available: bool
    message: str


# ── Endpoints ─────────────────────────────────────────────────────

@router.get("/whisper-status", response_model=WhisperStatus)
def whisper_status():
    """Check if Whisper is installed and available."""
    available = is_whisper_available()
    return WhisperStatus(
        available=available,
        message="Whisper disponible" if available else
                "faster-whisper no instalado. Ejecuta: pip install faster-whisper",
    )


@router.post("/{doc_id}", response_model=TranscriptionOut)
def transcribe_document(
    doc_id: str,
    data: TranscribeRequest = TranscribeRequest(),
    db: Session = Depends(get_db),
):
    """Transcribe an audio document with Whisper.

    - Updates the document's `content` field with the full transcript
    - Stores timestamped segments in `metadata_`
    - The transcript becomes codeable like any text document
    """
    if not is_whisper_available():
        raise HTTPException(
            status_code=503,
            detail="faster-whisper no esta instalado. Ejecuta: pip install faster-whisper",
        )

    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.doc_type != "audio":
        raise HTTPException(status_code=400, detail="Document is not an audio file")

    if not doc.file_path:
        raise HTTPException(status_code=400, detail="Audio file path not found")

    # Transcribe
    result = transcribe(
        doc.file_path,
        model_size=data.model_size,
        language=data.language,
    )

    # Build timestamped text: [MM:SS] text
    lines = []
    for seg in result.segments:
        mins = int(seg.start // 60)
        secs = int(seg.start % 60)
        lines.append(f"[{mins:02d}:{secs:02d}] {seg.text}")
    timestamped_text = "\n".join(lines)

    # Update document with transcript
    doc.content = timestamped_text
    doc.doc_hash = hashlib.sha256(timestamped_text.encode("utf-8")).hexdigest()
    doc.metadata_ = {
        "duration": result.duration,
        "language": result.language,
        "segments": [
            {"start": s.start, "end": s.end, "text": s.text}
            for s in result.segments
        ],
        "whisper_model": data.model_size,
    }
    db.flush()

    return TranscriptionOut(
        document_id=doc.id,
        text=timestamped_text,
        segments=[
            SegmentOut(start=s.start, end=s.end, text=s.text)
            for s in result.segments
        ],
        language=result.language,
        duration=result.duration,
    )


@router.get("/{doc_id}/segments", response_model=List[SegmentOut])
def get_segments(doc_id: str, db: Session = Depends(get_db)):
    """Get timestamped segments for a transcribed audio document."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not doc.metadata_ or "segments" not in doc.metadata_:
        raise HTTPException(status_code=404, detail="No transcription segments found")

    segments = doc.metadata_["segments"]
    return [SegmentOut(**s) for s in segments]
