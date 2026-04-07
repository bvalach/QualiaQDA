from __future__ import annotations
from typing import Optional
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import ProjectSnapshot, Project, Code, Coding, Memo

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


class SnapshotIn(BaseModel):
    label: str
    description: Optional[str] = None


class SnapshotOut(BaseModel):
    id: str
    project_id: str
    label: str
    description: Optional[str]
    created_at: str
    n_codes: int
    n_codings: int
    n_memos: int


def _parse_snap(s: ProjectSnapshot) -> SnapshotOut:
    data = json.loads(s.snapshot_data) if s.snapshot_data else {}
    return SnapshotOut(
        id=s.id,
        project_id=s.project_id,
        label=s.label,
        description=s.description,
        created_at=s.created_at.isoformat(),
        n_codes=data.get("n_codes", 0),
        n_codings=data.get("n_codings", 0),
        n_memos=data.get("n_memos", 0),
    )


@router.get("/", response_model=list[SnapshotOut])
def list_snapshots(db: Session = Depends(get_db)):
    snaps = db.query(ProjectSnapshot).order_by(ProjectSnapshot.created_at.desc()).all()
    return [_parse_snap(s) for s in snaps]


@router.post("/", response_model=SnapshotOut, status_code=201)
def create_snapshot(data: SnapshotIn, db: Session = Depends(get_db)):
    project = db.query(Project).first()
    if not project:
        raise HTTPException(400, "Sin proyecto activo")

    codes = db.query(Code).all()
    codings = db.query(Coding).all()
    memos = db.query(Memo).all()

    snapshot_data = json.dumps({
        "n_codes": len(codes),
        "n_codings": len(codings),
        "n_memos": len(memos),
        "codes": [
            {"id": c.id, "name": c.name, "parent_id": c.parent_id, "color": c.color}
            for c in codes
        ],
    })

    snap = ProjectSnapshot(
        project_id=project.id,
        label=data.label,
        description=data.description,
        snapshot_data=snapshot_data,
    )
    db.add(snap)
    db.flush()
    return _parse_snap(snap)


@router.delete("/{snap_id}", status_code=204)
def delete_snapshot(snap_id: str, db: Session = Depends(get_db)):
    snap = db.query(ProjectSnapshot).filter(ProjectSnapshot.id == snap_id).first()
    if not snap:
        raise HTTPException(404, "Snapshot no encontrado")
    db.delete(snap)
    return None
