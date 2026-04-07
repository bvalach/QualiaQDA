from __future__ import annotations
import json
import math
import urllib.request
import urllib.error
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import Document
from qualia.models.embedding_segment import EmbeddingSegment

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])

OLLAMA_URL = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text-v2-moe"
CHUNK_SIZE = 500   # characters per chunk
CHUNK_OVERLAP = 80  # overlap between consecutive chunks


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_embedding(text: str) -> Optional[list[float]]:
    payload = json.dumps({"model": EMBED_MODEL, "prompt": text}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read()).get("embedding")
    except Exception:
        return None


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _chunk_text(text: str) -> list[tuple[int, int, str]]:
    chunks: list[tuple[int, int, str]] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append((start, end, chunk))
        if end >= len(text):
            break
        start = end - CHUNK_OVERLAP
    return chunks


def _ollama_available() -> bool:
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


# ── schemas ──────────────────────────────────────────────────────────────────

class EmbedStatus(BaseModel):
    ollama_available: bool
    model: str
    embedded_documents: int
    total_segments: int


class EmbedResult(BaseModel):
    document_id: str
    document_name: str
    segments_created: int


class SearchQuery(BaseModel):
    query: str
    top_k: int = 5


class SimilarSegment(BaseModel):
    id: str
    document_id: str
    document_name: str
    chunk_text: str
    start_pos: Optional[int]
    end_pos: Optional[int]
    score: float


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status", response_model=EmbedStatus)
def embeddings_status(db: Session = Depends(get_db)):
    segments = db.query(EmbeddingSegment).all()
    embedded_doc_ids = set(s.document_id for s in segments)
    return EmbedStatus(
        ollama_available=_ollama_available(),
        model=EMBED_MODEL,
        embedded_documents=len(embedded_doc_ids),
        total_segments=len(segments),
    )


@router.post("/generate/{doc_id}", response_model=EmbedResult)
def generate_embeddings(doc_id: str, db: Session = Depends(get_db)):
    """Chunk a document and generate Ollama embeddings. Replaces any existing segments."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    if not doc.content:
        raise HTTPException(400, "El documento no tiene contenido de texto")

    if not _ollama_available():
        raise HTTPException(503, f"Ollama no disponible en {OLLAMA_URL}")

    # Delete existing segments
    db.query(EmbeddingSegment).filter(EmbeddingSegment.document_id == doc_id).delete()

    chunks = _chunk_text(doc.content)
    created = 0
    for start, end, chunk_text in chunks:
        vector = _get_embedding(chunk_text)
        seg = EmbeddingSegment(
            document_id=doc_id,
            chunk_text=chunk_text,
            start_pos=start,
            end_pos=end,
            vector=json.dumps(vector) if vector else None,
        )
        db.add(seg)
        created += 1

    db.flush()
    return EmbedResult(document_id=doc_id, document_name=doc.name, segments_created=created)


@router.post("/search", response_model=list[SimilarSegment])
def semantic_search(query: SearchQuery, db: Session = Depends(get_db)):
    """Find semantically similar segments to a query text."""
    query_vec = _get_embedding(query.query)
    if not query_vec:
        raise HTTPException(503, "Ollama no disponible o fallo al generar embedding")

    segments = db.query(EmbeddingSegment).filter(EmbeddingSegment.vector.isnot(None)).all()
    if not segments:
        return []

    doc_cache: dict[str, Document] = {}
    results: list[SimilarSegment] = []

    for seg in segments:
        try:
            vec = json.loads(seg.vector)
            score = _cosine_similarity(query_vec, vec)
        except Exception:
            continue

        if seg.document_id not in doc_cache:
            doc_cache[seg.document_id] = db.query(Document).filter(Document.id == seg.document_id).first()
        doc = doc_cache[seg.document_id]

        results.append(SimilarSegment(
            id=seg.id,
            document_id=seg.document_id,
            document_name=doc.name if doc else "?",
            chunk_text=seg.chunk_text,
            start_pos=seg.start_pos,
            end_pos=seg.end_pos,
            score=round(score, 4),
        ))

    results.sort(key=lambda r: r.score, reverse=True)
    return results[: query.top_k]


@router.delete("/document/{doc_id}", status_code=204)
def delete_document_embeddings(doc_id: str, db: Session = Depends(get_db)):
    """Remove all embedding segments for a document."""
    db.query(EmbeddingSegment).filter(EmbeddingSegment.document_id == doc_id).delete()
    return None
