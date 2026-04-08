from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import Code, CodeGroup, CodeGroupMember, Project

router = APIRouter(prefix="/api/codes", tags=["codes"])


class CodeCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None
    description: Optional[str] = None
    color: str = "#FFD700"
    sort_order: int = 0


class CodeUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class CodeOut(BaseModel):
    id: str
    parent_id: Optional[str]
    name: str
    description: Optional[str]
    color: str
    sort_order: int
    children: list["CodeOut"] = []


class CodeGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None


class CodeGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class CodeGroupOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    color: Optional[str]
    code_ids: list[str]


def _get_project_id(db: Session) -> str:
    proj = db.query(Project).first()
    if not proj:
        raise HTTPException(status_code=400, detail="No project found")
    return proj.id


def _build_tree(codes: list[Code], parent_id: Optional[str] = None) -> list[CodeOut]:
    result = []
    for c in sorted(codes, key=lambda x: x.sort_order):
        if c.parent_id == parent_id:
            children = _build_tree(codes, c.id)
            result.append(CodeOut(
                id=c.id,
                parent_id=c.parent_id,
                name=c.name,
                description=c.description,
                color=c.color,
                sort_order=c.sort_order,
                children=children,
            ))
    return result


@router.get("/", response_model=list[CodeOut])
def list_codes(db: Session = Depends(get_db)):
    """Get all codes as a tree structure."""
    codes = db.query(Code).all()
    return _build_tree(codes)


@router.get("/flat", response_model=list[CodeOut])
def list_codes_flat(db: Session = Depends(get_db)):
    """Get all codes as a flat list (no nesting)."""
    codes = db.query(Code).order_by(Code.sort_order).all()
    return [
        CodeOut(
            id=c.id, parent_id=c.parent_id, name=c.name,
            description=c.description, color=c.color, sort_order=c.sort_order,
        )
        for c in codes
    ]


@router.post("/", response_model=CodeOut)
def create_code(data: CodeCreate, db: Session = Depends(get_db)):
    project_id = _get_project_id(db)
    if data.parent_id:
        parent = db.query(Code).filter(Code.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent code not found")
    code = Code(
        project_id=project_id,
        parent_id=data.parent_id,
        name=data.name,
        description=data.description,
        color=data.color,
        sort_order=data.sort_order,
    )
    db.add(code)
    db.flush()
    return CodeOut(
        id=code.id, parent_id=code.parent_id, name=code.name,
        description=code.description, color=code.color, sort_order=code.sort_order,
    )


@router.put("/{code_id}", response_model=CodeOut)
def update_code(code_id: str, data: CodeUpdate, db: Session = Depends(get_db)):
    code = db.query(Code).filter(Code.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    if data.name is not None:
        code.name = data.name
    if data.parent_id is not None:
        code.parent_id = data.parent_id if data.parent_id != "" else None
    if data.description is not None:
        code.description = data.description
    if data.color is not None:
        code.color = data.color
    if data.sort_order is not None:
        code.sort_order = data.sort_order
    db.flush()
    return CodeOut(
        id=code.id, parent_id=code.parent_id, name=code.name,
        description=code.description, color=code.color, sort_order=code.sort_order,
    )


@router.delete("/{code_id}")
def delete_code(code_id: str, db: Session = Depends(get_db)):
    code = db.query(Code).filter(Code.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    db.delete(code)
    return {"ok": True}


# --- Code Groups ---

@router.get("/groups", response_model=list[CodeGroupOut])
def list_code_groups(db: Session = Depends(get_db)):
    groups = db.query(CodeGroup).order_by(CodeGroup.name.asc()).all()
    result = []
    for g in groups:
        members = db.query(CodeGroupMember).filter(CodeGroupMember.code_group_id == g.id).all()
        result.append(CodeGroupOut(
            id=g.id, name=g.name, description=g.description,
            color=g.color, code_ids=[m.code_id for m in members],
        ))
    return result


@router.post("/groups", response_model=CodeGroupOut)
def create_code_group(data: CodeGroupCreate, db: Session = Depends(get_db)):
    project_id = _get_project_id(db)
    group = CodeGroup(
        project_id=project_id,
        name=data.name,
        description=(data.description or None),
        color=data.color,
    )
    db.add(group)
    db.flush()
    return CodeGroupOut(id=group.id, name=group.name, description=group.description, color=group.color, code_ids=[])


@router.put("/groups/{group_id}", response_model=CodeGroupOut)
def update_code_group(group_id: str, data: CodeGroupUpdate, db: Session = Depends(get_db)):
    group = db.query(CodeGroup).filter(CodeGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Code group not found")
    if data.name is not None:
        group.name = data.name
    if data.description is not None:
        group.description = data.description or None
    if data.color is not None:
        group.color = data.color
    db.flush()
    members = db.query(CodeGroupMember).filter(CodeGroupMember.code_group_id == group.id).all()
    return CodeGroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        color=group.color,
        code_ids=[m.code_id for m in members],
    )


@router.delete("/groups/{group_id}")
def delete_code_group(group_id: str, db: Session = Depends(get_db)):
    group = db.query(CodeGroup).filter(CodeGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Code group not found")
    db.delete(group)
    return {"ok": True}


@router.post("/groups/{group_id}/codes/{code_id}")
def add_code_to_group(group_id: str, code_id: str, db: Session = Depends(get_db)):
    group = db.query(CodeGroup).filter(CodeGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Code group not found")
    code = db.query(Code).filter(Code.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    existing = db.query(CodeGroupMember).filter(
        CodeGroupMember.code_group_id == group_id, CodeGroupMember.code_id == code_id
    ).first()
    if existing:
        return {"ok": True}
    member = CodeGroupMember(code_group_id=group_id, code_id=code_id)
    db.add(member)
    return {"ok": True}


@router.delete("/groups/{group_id}/codes/{code_id}")
def remove_code_from_group(group_id: str, code_id: str, db: Session = Depends(get_db)):
    group = db.query(CodeGroup).filter(CodeGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Code group not found")
    member = db.query(CodeGroupMember).filter(
        CodeGroupMember.code_group_id == group_id, CodeGroupMember.code_id == code_id
    ).first()
    if member:
        db.delete(member)
    return {"ok": True}
