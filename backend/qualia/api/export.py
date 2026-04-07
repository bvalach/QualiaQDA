from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import Code, Coding, Memo, Document, Excerpt, EntityLink

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/codebook")
def export_codebook(db: Session = Depends(get_db)):
    """Export codebook as CSV."""
    codes = db.query(Code).order_by(Code.sort_order).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "name", "parent_id", "description", "color", "sort_order"])
    for c in codes:
        writer.writerow([c.id, c.name, c.parent_id or "", c.description or "", c.color, c.sort_order])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=codebook.csv"},
    )


@router.get("/codings")
def export_codings(db: Session = Depends(get_db)):
    """Export all coded segments as CSV (joins through excerpts)."""
    codings = (
        db.query(Coding, Code, Excerpt, Document)
        .join(Excerpt, Coding.excerpt_id == Excerpt.id)
        .join(Code, Coding.code_id == Code.id)
        .join(Document, Excerpt.document_id == Document.id)
        .all()
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "coding_id", "excerpt_id", "document_name", "code_name", "code_color",
        "start_pos", "end_pos", "page_number", "text", "created_by", "created_at",
    ])
    for coding, code, excerpt, doc in codings:
        writer.writerow([
            coding.id, excerpt.id, doc.name, code.name, code.color,
            excerpt.start_pos, excerpt.end_pos, excerpt.page_number or "",
            excerpt.text or "", coding.created_by, coding.created_at.isoformat(),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=codings.csv"},
    )


@router.get("/memos")
def export_memos(db: Session = Depends(get_db)):
    """Export memos as CSV (with entity links)."""
    memos = db.query(Memo).order_by(Memo.updated_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "title", "content", "memo_type", "links", "created_at", "updated_at",
    ])
    for m in memos:
        links = db.query(EntityLink).filter(
            EntityLink.source_type == "memo",
            EntityLink.source_id == m.id,
        ).all()
        links_str = "; ".join(f"{lnk.target_type}:{lnk.target_id}" for lnk in links)
        writer.writerow([
            m.id, m.title or "", m.content, m.memo_type,
            links_str, m.created_at.isoformat(), m.updated_at.isoformat(),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=memos.csv"},
    )
