from __future__ import annotations
from typing import Optional

import uuid
import hashlib
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db, get_active_db_path
from qualia.models import Document

router = APIRouter(prefix="/api/documents", tags=["documents"])


class DocumentOut(BaseModel):
    id: str
    name: str
    doc_type: str
    page_count: Optional[int]
    content_length: Optional[int]
    created_at: str


class DocumentContent(BaseModel):
    id: str
    name: str
    doc_type: str
    content: Optional[str]
    page_count: Optional[int]
    total_length: Optional[int]


def _files_dir() -> Path:
    db_path = get_active_db_path()
    if db_path is None:
        raise HTTPException(status_code=400, detail="No project open")
    files_dir = db_path.parent / (db_path.stem + "_files")
    files_dir.mkdir(exist_ok=True)
    return files_dir


def _detect_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    type_map = {
        ".txt": "text",
        ".md": "markdown",
        ".markdown": "markdown",
        ".pdf": "pdf",
        ".jpg": "image",
        ".jpeg": "image",
        ".png": "image",
        ".gif": "image",
        ".webp": "image",
        ".mp3": "audio",
        ".wav": "audio",
        ".m4a": "audio",
        ".ogg": "audio",
    }
    return type_map.get(ext, "text")


def _extract_text_from_pdf(file_path: Path) -> tuple[str, int]:
    """Extract text from PDF, return (full_text, page_count)."""
    import fitz  # pymupdf
    doc = fitz.open(str(file_path))
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    # Join with page separator for pagination
    full_text = "\n\n--- PAGE_BREAK ---\n\n".join(pages)
    return full_text, len(pages)


@router.get("/", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)):
    docs = db.query(Document).all()
    return [
        DocumentOut(
            id=d.id,
            name=d.name,
            doc_type=d.doc_type,
            page_count=d.page_count,
            content_length=len(d.content) if d.content else None,
            created_at=d.created_at.isoformat(),
        )
        for d in docs
    ]


@router.post("/upload", response_model=DocumentOut)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a document (txt, md, pdf, image)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    doc_type = _detect_type(file.filename)
    doc_id = str(uuid.uuid4())
    content = None
    page_count = None
    file_path = None

    doc_hash = None
    if doc_type in ("text", "markdown"):
        raw = await file.read()
        content = raw.decode("utf-8", errors="replace")
        doc_hash = hashlib.sha256(raw).hexdigest()
    elif doc_type == "pdf":
        files_dir = _files_dir()
        dest = files_dir / f"{doc_id}{Path(file.filename).suffix}"
        raw = await file.read()
        with open(dest, "wb") as f:
            f.write(raw)
        file_path = str(dest)
        doc_hash = hashlib.sha256(raw).hexdigest()
        content, page_count = _extract_text_from_pdf(dest)
    elif doc_type in ("image", "audio"):
        files_dir = _files_dir()
        dest = files_dir / f"{doc_id}{Path(file.filename).suffix}"
        raw = await file.read()
        with open(dest, "wb") as f:
            f.write(raw)
        file_path = str(dest)
        doc_hash = hashlib.sha256(raw).hexdigest()

    doc = Document(
        id=doc_id,
        project_id=db.query(Document).first().project_id if db.query(Document).first() else _get_project_id(db),
        name=file.filename,
        doc_type=doc_type,
        content=content,
        file_path=file_path,
        page_count=page_count,
        doc_hash=doc_hash,
    )
    db.add(doc)
    db.flush()

    return DocumentOut(
        id=doc.id,
        name=doc.name,
        doc_type=doc.doc_type,
        page_count=doc.page_count,
        content_length=len(doc.content) if doc.content else None,
        created_at=doc.created_at.isoformat(),
    )


def _get_project_id(db: Session) -> str:
    from qualia.models import Project
    proj = db.query(Project).first()
    if not proj:
        raise HTTPException(status_code=400, detail="No project found in database")
    return proj.id


@router.get("/{doc_id}", response_model=DocumentContent)
def get_document(doc_id: str, page: Optional[int] = None, db: Session = Depends(get_db)):
    """Get document content. For PDFs, optionally pass ?page=N for a specific page."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    content = doc.content
    if doc.doc_type == "pdf" and page is not None and content:
        pages = content.split("\n\n--- PAGE_BREAK ---\n\n")
        if 1 <= page <= len(pages):
            content = pages[page - 1]
        else:
            raise HTTPException(status_code=400, detail=f"Page {page} out of range (1-{len(pages)})")

    return DocumentContent(
        id=doc.id,
        name=doc.name,
        doc_type=doc.doc_type,
        content=content,
        page_count=doc.page_count,
        total_length=len(doc.content) if doc.content else None,
    )


@router.delete("/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    # Delete associated file if exists
    if doc.file_path:
        p = Path(doc.file_path)
        if p.exists():
            p.unlink()
    db.delete(doc)
    return {"ok": True}


@router.get("/{doc_id}/image")
def get_document_image(doc_id: str, db: Session = Depends(get_db)):
    """Serve image/audio file for binary documents."""
    from fastapi.responses import FileResponse
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc or not doc.file_path:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(doc.file_path)
