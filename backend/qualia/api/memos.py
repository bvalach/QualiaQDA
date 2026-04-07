from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import Memo, EntityLink, Project

router = APIRouter(prefix="/api/memos", tags=["memos"])


class EntityLinkData(BaseModel):
    target_type: str  # 'document', 'excerpt', 'code', 'coding', 'memo'
    target_id: str


class MemoCreate(BaseModel):
    title: Optional[str] = None
    content: str
    memo_type: str = "free"
    # Types: 'theoretical', 'methodological', 'case', 'code', 'reflective', 'synthesis', 'free'
    links: list[EntityLinkData] = []


class MemoUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    memo_type: Optional[str] = None


class MemoOut(BaseModel):
    id: str
    title: Optional[str]
    content: str
    memo_type: str
    links: list[EntityLinkData]
    created_at: str
    updated_at: str


def _get_project_id(db: Session) -> str:
    proj = db.query(Project).first()
    if not proj:
        raise HTTPException(status_code=400, detail="No project found")
    return proj.id


def _get_memo_links(db: Session, memo_id: str) -> list[EntityLinkData]:
    links = db.query(EntityLink).filter(
        EntityLink.source_type == "memo",
        EntityLink.source_id == memo_id,
    ).all()
    return [EntityLinkData(target_type=lnk.target_type, target_id=lnk.target_id) for lnk in links]


def _memo_to_out(memo: Memo, links: list[EntityLinkData]) -> MemoOut:
    return MemoOut(
        id=memo.id,
        title=memo.title,
        content=memo.content,
        memo_type=memo.memo_type,
        links=links,
        created_at=memo.created_at.isoformat(),
        updated_at=memo.updated_at.isoformat(),
    )


@router.get("/", response_model=list[MemoOut])
def list_memos(memo_type: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Memo)
    if memo_type:
        query = query.filter(Memo.memo_type == memo_type)
    memos = query.order_by(Memo.updated_at.desc()).all()
    return [_memo_to_out(m, _get_memo_links(db, m.id)) for m in memos]


@router.post("/", response_model=MemoOut)
def create_memo(data: MemoCreate, db: Session = Depends(get_db)):
    project_id = _get_project_id(db)
    memo = Memo(
        project_id=project_id,
        title=data.title,
        content=data.content,
        memo_type=data.memo_type,
    )
    db.add(memo)
    db.flush()

    # Create entity links
    for link in data.links:
        db.add(EntityLink(
            source_type="memo",
            source_id=memo.id,
            target_type=link.target_type,
            target_id=link.target_id,
        ))
    db.flush()

    return _memo_to_out(memo, data.links)


@router.put("/{memo_id}", response_model=MemoOut)
def update_memo(memo_id: str, data: MemoUpdate, db: Session = Depends(get_db)):
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
    if data.title is not None:
        memo.title = data.title
    if data.content is not None:
        memo.content = data.content
    if data.memo_type is not None:
        memo.memo_type = data.memo_type
    db.flush()
    return _memo_to_out(memo, _get_memo_links(db, memo.id))


@router.post("/{memo_id}/links", response_model=MemoOut)
def add_memo_link(memo_id: str, link: EntityLinkData, db: Session = Depends(get_db)):
    """Add a link from a memo to any entity."""
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
    db.add(EntityLink(
        source_type="memo",
        source_id=memo_id,
        target_type=link.target_type,
        target_id=link.target_id,
    ))
    db.flush()
    return _memo_to_out(memo, _get_memo_links(db, memo_id))


@router.delete("/{memo_id}/links")
def remove_memo_link(memo_id: str, link: EntityLinkData, db: Session = Depends(get_db)):
    """Remove a specific link from a memo."""
    el = db.query(EntityLink).filter(
        EntityLink.source_type == "memo",
        EntityLink.source_id == memo_id,
        EntityLink.target_type == link.target_type,
        EntityLink.target_id == link.target_id,
    ).first()
    if el:
        db.delete(el)
    return {"ok": True}


@router.delete("/{memo_id}")
def delete_memo(memo_id: str, db: Session = Depends(get_db)):
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
    # Delete associated entity links
    db.query(EntityLink).filter(
        EntityLink.source_type == "memo",
        EntityLink.source_id == memo_id,
    ).delete()
    # Also delete links that point TO this memo
    db.query(EntityLink).filter(
        EntityLink.target_type == "memo",
        EntityLink.target_id == memo_id,
    ).delete()
    db.delete(memo)
    return {"ok": True}
