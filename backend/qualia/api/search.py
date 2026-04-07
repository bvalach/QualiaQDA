from __future__ import annotations
import re
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import Document

router = APIRouter(prefix="/api/search", tags=["search"])


class KwicResult(BaseModel):
    document_id: str
    document_name: str
    match_text: str
    context_before: str
    context_after: str
    start_pos: int
    end_pos: int


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[KwicResult]


@router.get("/text", response_model=SearchResponse)
def search_text(
    q: str = Query(..., min_length=1),
    context_chars: int = Query(80, ge=10, le=500),
    use_regex: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Full-text KWIC (Key Word In Context) search across all documents."""
    docs = db.query(Document).filter(Document.content.isnot(None)).all()
    results: list[KwicResult] = []

    try:
        if use_regex:
            pattern = re.compile(q, re.IGNORECASE | re.MULTILINE)
        else:
            pattern = re.compile(re.escape(q), re.IGNORECASE)
    except re.error as e:
        raise HTTPException(400, f"Regex inválido: {e}")

    for doc in docs:
        content = doc.content or ""
        if not content:
            continue

        for m in pattern.finditer(content):
            start = m.start()
            end = m.end()
            ctx_start = max(0, start - context_chars)
            ctx_end = min(len(content), end + context_chars)

            before = content[ctx_start:start]
            after = content[end:ctx_end]

            if ctx_start > 0:
                before = "…" + before
            if ctx_end < len(content):
                after = after + "…"

            results.append(KwicResult(
                document_id=doc.id,
                document_name=doc.name,
                match_text=content[start:end],
                context_before=before,
                context_after=after,
                start_pos=start,
                end_pos=end,
            ))

    return SearchResponse(query=q, total=len(results), results=results)
