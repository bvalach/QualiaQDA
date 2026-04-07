from __future__ import annotations
from typing import Optional

import hashlib

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import Coding, Code, Document, Excerpt

router = APIRouter(prefix="/api/codings", tags=["codings"])


class CodingCreate(BaseModel):
    document_id: str
    code_id: str
    start_pos: int
    end_pos: int
    page_number: Optional[int] = None
    text: Optional[str] = None
    created_by: str = "user"


class CodingOut(BaseModel):
    id: str
    excerpt_id: str
    document_id: str
    document_name: Optional[str] = None
    code_id: str
    code_name: str
    code_color: str
    start_pos: int
    end_pos: int
    page_number: Optional[int]
    text: Optional[str]
    created_by: str
    created_at: str


def _find_or_create_excerpt(
    db: Session, doc: Document, start_pos: int, end_pos: int,
    page_number: Optional[int], text: Optional[str],
) -> Excerpt:
    """Find an existing excerpt at the same position or create a new one."""
    existing = (
        db.query(Excerpt)
        .filter(
            Excerpt.document_id == doc.id,
            Excerpt.start_pos == start_pos,
            Excerpt.end_pos == end_pos,
        )
        .first()
    )
    if existing:
        return existing

    # Auto-extract text if not provided
    if text is None and doc.content:
        text = doc.content[start_pos:end_pos]
    if not text:
        text = ""

    # Build context for hybrid anchoring
    content = doc.content or ""
    context_before = content[max(0, start_pos - 50):start_pos] if content else None
    context_after = content[end_pos:end_pos + 50] if content else None
    doc_hash = doc.doc_hash

    excerpt = Excerpt(
        document_id=doc.id,
        start_pos=start_pos,
        end_pos=end_pos,
        page_number=page_number,
        text=text,
        context_before=context_before,
        context_after=context_after,
        doc_hash=doc_hash,
    )
    db.add(excerpt)
    db.flush()
    return excerpt


def _coding_to_out(coding: Coding, code: Code, doc_name: Optional[str] = None) -> CodingOut:
    excerpt = coding.excerpt
    return CodingOut(
        id=coding.id,
        excerpt_id=excerpt.id,
        document_id=excerpt.document_id,
        document_name=doc_name,
        code_id=coding.code_id,
        code_name=code.name,
        code_color=code.color,
        start_pos=excerpt.start_pos,
        end_pos=excerpt.end_pos,
        page_number=excerpt.page_number,
        text=excerpt.text,
        created_by=coding.created_by,
        created_at=coding.created_at.isoformat(),
    )


@router.get("/document/{doc_id}", response_model=list[CodingOut])
def get_codings_for_document(doc_id: str, db: Session = Depends(get_db)):
    """Get all codings for a specific document (via excerpts)."""
    codings = (
        db.query(Coding, Code)
        .join(Excerpt, Coding.excerpt_id == Excerpt.id)
        .join(Code, Coding.code_id == Code.id)
        .filter(Excerpt.document_id == doc_id)
        .all()
    )
    return [_coding_to_out(c, code) for c, code in codings]


@router.get("/code/{code_id}", response_model=list[CodingOut])
def get_codings_for_code(code_id: str, db: Session = Depends(get_db)):
    """Get all codings for a specific code (across all documents)."""
    codings = (
        db.query(Coding, Code, Document.name)
        .join(Excerpt, Coding.excerpt_id == Excerpt.id)
        .join(Code, Coding.code_id == Code.id)
        .join(Document, Excerpt.document_id == Document.id)
        .filter(Coding.code_id == code_id)
        .all()
    )
    return [_coding_to_out(c, code, doc_name) for c, code, doc_name in codings]


@router.post("/", response_model=CodingOut)
def create_coding(data: CodingCreate, db: Session = Depends(get_db)):
    """Assign a code to a text segment. Creates excerpt automatically."""
    doc = db.query(Document).filter(Document.id == data.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    code = db.query(Code).filter(Code.id == data.code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")

    excerpt = _find_or_create_excerpt(
        db, doc, data.start_pos, data.end_pos, data.page_number, data.text,
    )

    coding = Coding(
        excerpt_id=excerpt.id,
        code_id=data.code_id,
        created_by=data.created_by,
    )
    db.add(coding)
    db.flush()

    return _coding_to_out(coding, code)


@router.delete("/{coding_id}")
def delete_coding(coding_id: str, db: Session = Depends(get_db)):
    """Remove a coding. Orphaned excerpts (no remaining codings) are also cleaned up."""
    coding = db.query(Coding).filter(Coding.id == coding_id).first()
    if not coding:
        raise HTTPException(status_code=404, detail="Coding not found")

    excerpt_id = coding.excerpt_id
    db.delete(coding)
    db.flush()

    # Clean up orphaned excerpt (no codings left)
    remaining = db.query(Coding).filter(Coding.excerpt_id == excerpt_id).count()
    if remaining == 0:
        excerpt = db.query(Excerpt).filter(Excerpt.id == excerpt_id).first()
        if excerpt:
            db.delete(excerpt)

    return {"ok": True}
