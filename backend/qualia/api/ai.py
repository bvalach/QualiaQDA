"""AI assistance endpoints — Layer 3 (suggestions separate from human codings).

Endpoints:
  POST /api/ai/suggest-codes          — suggest codes for an excerpt
  POST /api/ai/auto-code/{doc_id}     — auto-code entire document
  POST /api/ai/suggest-themes         — suggest emerging themes
  GET  /api/ai/suggestions            — list suggestions (filterable by status)
  POST /api/ai/suggestions/{id}/accept — accept suggestion → creates real coding
  POST /api/ai/suggestions/{id}/reject — reject suggestion
  GET  /api/ai/suggestions/stats       — count by status
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.config import settings
from qualia.core.database import get_db
from qualia.models import (
    AiSuggestion, Code, Coding, Document, Excerpt,
)
from qualia.services.llm.ai_coding import (
    suggest_codes_for_excerpt,
    auto_code_document,
    suggest_themes,
)
from qualia.services.llm.cli_runner import get_llm_provider_statuses

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ── Pydantic schemas ──────────────────────────────────────────────

class SuggestCodesRequest(BaseModel):
    excerpt_id: str
    document_context_chars: int = 500  # chars of context around excerpt
    provider: Optional[str] = None


class AutoCodeRequest(BaseModel):
    provider: Optional[str] = None


class ThemeRequest(BaseModel):
    provider: Optional[str] = None


class AiSuggestionOut(BaseModel):
    id: str
    excerpt_id: str
    excerpt_text: str
    document_name: Optional[str] = None
    code_id: Optional[str] = None
    code_name: Optional[str] = None
    suggested_code_name: Optional[str] = None
    confidence: Optional[float] = None
    model_name: str
    rationale: Optional[str] = None
    status: str
    reviewed_at: Optional[str] = None
    created_at: str


class ThemeOut(BaseModel):
    theme_name: str
    description: str
    related_codes: list[str]
    evidence_summary: str


class SuggestionsStats(BaseModel):
    pending: int
    accepted: int
    rejected: int
    total: int


class LlmProviderOut(BaseModel):
    id: str
    label: str
    transport: str
    available: bool
    detail: Optional[str] = None


class LlmProvidersResponse(BaseModel):
    default_provider: str
    providers: list[LlmProviderOut]


# ── Helpers ───────────────────────────────────────────────────────

def _get_codebook_flat(db: Session) -> list[dict]:
    """Get all codes as flat list of dicts for prompt building."""
    codes = db.query(Code).all()
    return [
        {"id": c.id, "name": c.name, "description": c.description}
        for c in codes
    ]


def _find_code_by_name(db: Session, name: str) -> Optional[Code]:
    """Find a code by exact name match (case-insensitive)."""
    return db.query(Code).filter(Code.name.ilike(name)).first()


def _suggestion_to_out(s: AiSuggestion) -> AiSuggestionOut:
    excerpt = s.excerpt
    code_name = s.code.name if s.code else None
    doc_name = excerpt.document.name if excerpt.document else None
    return AiSuggestionOut(
        id=s.id,
        excerpt_id=s.excerpt_id,
        excerpt_text=excerpt.text or "",
        document_name=doc_name,
        code_id=s.code_id,
        code_name=code_name,
        suggested_code_name=s.suggested_code_name,
        confidence=s.confidence,
        model_name=s.model_name,
        rationale=s.rationale,
        status=s.status,
        reviewed_at=s.reviewed_at.isoformat() if s.reviewed_at else None,
        created_at=s.created_at.isoformat(),
    )


def _find_or_create_excerpt_for_autocode(
    db: Session, doc: Document, excerpt_text: str,
) -> Optional[Excerpt]:
    """Find the excerpt text position in the document and create an excerpt."""
    content = doc.content or ""
    start = content.find(excerpt_text)
    if start == -1:
        # Try partial match (first 80 chars)
        partial = excerpt_text[:80]
        start = content.find(partial)
        if start == -1:
            return None
        end = start + len(excerpt_text)
    else:
        end = start + len(excerpt_text)

    # Check for existing excerpt at same position
    existing = (
        db.query(Excerpt)
        .filter(
            Excerpt.document_id == doc.id,
            Excerpt.start_pos == start,
            Excerpt.end_pos == end,
        )
        .first()
    )
    if existing:
        return existing

    context_before = content[max(0, start - 50):start]
    context_after = content[end:end + 50]

    excerpt = Excerpt(
        document_id=doc.id,
        start_pos=start,
        end_pos=end,
        text=excerpt_text,
        context_before=context_before,
        context_after=context_after,
        doc_hash=doc.doc_hash,
    )
    db.add(excerpt)
    db.flush()
    return excerpt


# ── Endpoints ─────────────────────────────────────────────────────

@router.get("/providers", response_model=LlmProvidersResponse)
def list_ai_providers():
    providers = [
        LlmProviderOut(
            id=provider.id,
            label=provider.label,
            transport=provider.transport,
            available=provider.available,
            detail=provider.detail,
        )
        for provider in get_llm_provider_statuses()
    ]
    return LlmProvidersResponse(
        default_provider=settings.llm_default_provider,
        providers=providers,
    )

@router.post("/suggest-codes", response_model=list[AiSuggestionOut])
async def suggest_codes_endpoint(
    data: SuggestCodesRequest,
    db: Session = Depends(get_db),
):
    """Suggest codes for an existing excerpt using LLM."""
    excerpt = db.query(Excerpt).filter(Excerpt.id == data.excerpt_id).first()
    if not excerpt:
        raise HTTPException(status_code=404, detail="Excerpt not found")

    # Build document context
    doc = excerpt.document
    content = doc.content or ""
    ctx_start = max(0, excerpt.start_pos - data.document_context_chars)
    ctx_end = min(len(content), excerpt.end_pos + data.document_context_chars)
    document_context = content[ctx_start:ctx_end]

    codebook = _get_codebook_flat(db)
    suggestions, model_name = await suggest_codes_for_excerpt(
        excerpt.text, codebook, document_context, provider=data.provider,
    )

    created = []
    for s in suggestions:
        # Resolve code_id: match by ID or by name
        code_id = None
        if s.code_id:
            exists = db.query(Code).filter(Code.id == s.code_id).first()
            if exists:
                code_id = exists.id
        if not code_id and s.code_name:
            found = _find_code_by_name(db, s.code_name)
            if found:
                code_id = found.id

        ai_sugg = AiSuggestion(
            excerpt_id=excerpt.id,
            code_id=code_id,
            suggested_code_name=s.code_name if not code_id else None,
            confidence=s.confidence,
            model_name=model_name or "unknown",
            rationale=s.rationale,
            status="pending",
        )
        db.add(ai_sugg)
        db.flush()
        created.append(ai_sugg)

    return [_suggestion_to_out(s) for s in created]


@router.post("/auto-code/{doc_id}", response_model=list[AiSuggestionOut])
async def auto_code_endpoint(
    doc_id: str,
    data: Optional[AutoCodeRequest] = None,
    db: Session = Depends(get_db),
):
    """Auto-code an entire document — LLM identifies excerpts and suggests codes."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.content:
        raise HTTPException(status_code=400, detail="Document has no text content")

    codebook = _get_codebook_flat(db)
    results, model_name = await auto_code_document(
        doc.content,
        codebook,
        doc.name,
        provider=data.provider if data else None,
    )

    created = []
    for item in results:
        excerpt = _find_or_create_excerpt_for_autocode(db, doc, item["excerpt_text"])
        if not excerpt:
            continue

        for s in item["suggestions"]:
            code_id = None
            if s.code_id:
                exists = db.query(Code).filter(Code.id == s.code_id).first()
                if exists:
                    code_id = exists.id
            if not code_id and s.code_name:
                found = _find_code_by_name(db, s.code_name)
                if found:
                    code_id = found.id

            ai_sugg = AiSuggestion(
                excerpt_id=excerpt.id,
                code_id=code_id,
                suggested_code_name=s.code_name if not code_id else None,
                confidence=s.confidence,
                model_name=model_name or "unknown",
                rationale=s.rationale,
                status="pending",
            )
            db.add(ai_sugg)
            db.flush()
            created.append(ai_sugg)

    return [_suggestion_to_out(s) for s in created]


@router.post("/suggest-themes", response_model=list[ThemeOut])
async def suggest_themes_endpoint(
    data: Optional[ThemeRequest] = None,
    db: Session = Depends(get_db),
):
    """Suggest emerging themes from all coded data."""
    # Gather coded excerpts with their code names
    codings = (
        db.query(Coding, Code, Excerpt)
        .join(Excerpt, Coding.excerpt_id == Excerpt.id)
        .join(Code, Coding.code_id == Code.id)
        .all()
    )

    if not codings:
        raise HTTPException(status_code=400, detail="No coded data to analyze")

    # Group by excerpt
    excerpt_map: dict[str, dict] = {}
    for coding, code, excerpt in codings:
        if excerpt.id not in excerpt_map:
            excerpt_map[excerpt.id] = {
                "text": excerpt.text,
                "code_names": [],
            }
        excerpt_map[excerpt.id]["code_names"].append(code.name)

    coded_excerpts = list(excerpt_map.values())
    codebook = _get_codebook_flat(db)

    themes, _model_name = await suggest_themes(
        coded_excerpts,
        codebook,
        provider=data.provider if data else None,
    )

    return [
        ThemeOut(
            theme_name=t.get("theme_name", ""),
            description=t.get("description", ""),
            related_codes=t.get("related_codes", []),
            evidence_summary=t.get("evidence_summary", ""),
        )
        for t in themes
    ]


@router.get("/suggestions", response_model=list[AiSuggestionOut])
def list_suggestions(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List AI suggestions, optionally filtered by status."""
    q = db.query(AiSuggestion)
    if status:
        q = q.filter(AiSuggestion.status == status)
    q = q.order_by(AiSuggestion.created_at.desc())

    return [_suggestion_to_out(s) for s in q.all()]


@router.get("/suggestions/stats", response_model=SuggestionsStats)
def suggestions_stats(db: Session = Depends(get_db)):
    """Count suggestions by status."""
    pending = db.query(AiSuggestion).filter(AiSuggestion.status == "pending").count()
    accepted = db.query(AiSuggestion).filter(AiSuggestion.status == "accepted").count()
    rejected = db.query(AiSuggestion).filter(AiSuggestion.status == "rejected").count()
    return SuggestionsStats(
        pending=pending,
        accepted=accepted,
        rejected=rejected,
        total=pending + accepted + rejected,
    )


@router.post("/suggestions/{suggestion_id}/accept", response_model=AiSuggestionOut)
def accept_suggestion(suggestion_id: str, db: Session = Depends(get_db)):
    """Accept an AI suggestion — creates a real coding (Layer 2) with created_by='ai_accepted'."""
    sugg = db.query(AiSuggestion).filter(AiSuggestion.id == suggestion_id).first()
    if not sugg:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if sugg.status != "pending":
        raise HTTPException(status_code=400, detail=f"Suggestion already {sugg.status}")

    # Resolve code: use existing code_id, or create new code from suggested_code_name
    code_id = sugg.code_id
    if not code_id and sugg.suggested_code_name:
        # Try to find by name first
        found = _find_code_by_name(db, sugg.suggested_code_name)
        if found:
            code_id = found.id
        else:
            # Create new code from suggestion
            excerpt = sugg.excerpt
            doc = excerpt.document
            new_code = Code(
                project_id=doc.project_id,
                name=sugg.suggested_code_name,
                color="#" + format(hash(sugg.suggested_code_name) % 0xFFFFFF, "06x"),
            )
            db.add(new_code)
            db.flush()
            code_id = new_code.id

    if not code_id:
        raise HTTPException(status_code=400, detail="Cannot resolve code for suggestion")

    # Check for duplicate coding
    existing_coding = (
        db.query(Coding)
        .filter(Coding.excerpt_id == sugg.excerpt_id, Coding.code_id == code_id)
        .first()
    )
    if not existing_coding:
        coding = Coding(
            excerpt_id=sugg.excerpt_id,
            code_id=code_id,
            created_by="ai_accepted",
        )
        db.add(coding)

    # Update suggestion status
    sugg.status = "accepted"
    sugg.code_id = code_id
    sugg.reviewed_at = datetime.now(timezone.utc)
    db.flush()

    return _suggestion_to_out(sugg)


@router.post("/suggestions/{suggestion_id}/reject", response_model=AiSuggestionOut)
def reject_suggestion(suggestion_id: str, db: Session = Depends(get_db)):
    """Reject an AI suggestion."""
    sugg = db.query(AiSuggestion).filter(AiSuggestion.id == suggestion_id).first()
    if not sugg:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if sugg.status != "pending":
        raise HTTPException(status_code=400, detail=f"Suggestion already {sugg.status}")

    sugg.status = "rejected"
    sugg.reviewed_at = datetime.now(timezone.utc)
    db.flush()

    return _suggestion_to_out(sugg)
