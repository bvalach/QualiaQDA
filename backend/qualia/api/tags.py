from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import Tag, EntityTag, Project

router = APIRouter(prefix="/api/tags", tags=["tags"])

TAG_TYPES = ["analytical", "methodological", "status", "custom"]
ENTITY_TYPES = ["document", "excerpt", "code", "coding", "memo"]


class TagIn(BaseModel):
    name: str
    color: Optional[str] = None
    tag_type: str = "analytical"


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    tag_type: Optional[str] = None


class TagOut(BaseModel):
    id: str
    name: str
    color: Optional[str]
    tag_type: str


class EntityTagIn(BaseModel):
    entity_type: str
    entity_id: str


class EntityTagOut(BaseModel):
    tag_id: str
    tag_name: str
    tag_color: Optional[str]
    entity_type: str
    entity_id: str


def _project_id(db: Session) -> str:
    project = db.query(Project).first()
    if not project:
        raise HTTPException(400, "Sin proyecto activo")
    return project.id


@router.get("/", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    return [TagOut(id=t.id, name=t.name, color=t.color, tag_type=t.tag_type)
            for t in db.query(Tag).all()]


@router.post("/", response_model=TagOut, status_code=201)
def create_tag(data: TagIn, db: Session = Depends(get_db)):
    if data.tag_type not in TAG_TYPES:
        raise HTTPException(400, f"tag_type inválido. Válidos: {TAG_TYPES}")
    tag = Tag(project_id=_project_id(db), name=data.name, color=data.color, tag_type=data.tag_type)
    db.add(tag)
    db.flush()
    return TagOut(id=tag.id, name=tag.name, color=tag.color, tag_type=tag.tag_type)


@router.put("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: str, data: TagUpdate, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(404, "Tag no encontrado")
    if data.name is not None:
        tag.name = data.name
    if data.color is not None:
        tag.color = data.color
    if data.tag_type is not None:
        if data.tag_type not in TAG_TYPES:
            raise HTTPException(400, f"tag_type inválido. Válidos: {TAG_TYPES}")
        tag.tag_type = data.tag_type
    return TagOut(id=tag.id, name=tag.name, color=tag.color, tag_type=tag.tag_type)


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: str, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(404, "Tag no encontrado")
    db.delete(tag)
    return None


@router.get("/{tag_id}/entities", response_model=list[EntityTagOut])
def list_tag_entities(tag_id: str, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(404, "Tag no encontrado")
    ets = db.query(EntityTag).filter(EntityTag.tag_id == tag_id).all()
    return [EntityTagOut(tag_id=et.tag_id, tag_name=tag.name, tag_color=tag.color,
                         entity_type=et.entity_type, entity_id=et.entity_id)
            for et in ets]


@router.post("/{tag_id}/entities", response_model=EntityTagOut, status_code=201)
def attach_tag(tag_id: str, data: EntityTagIn, db: Session = Depends(get_db)):
    if data.entity_type not in ENTITY_TYPES:
        raise HTTPException(400, f"entity_type inválido. Válidos: {ENTITY_TYPES}")
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(404, "Tag no encontrado")

    existing = db.query(EntityTag).filter(
        EntityTag.tag_id == tag_id,
        EntityTag.entity_type == data.entity_type,
        EntityTag.entity_id == data.entity_id,
    ).first()
    if existing:
        return EntityTagOut(tag_id=existing.tag_id, tag_name=tag.name, tag_color=tag.color,
                            entity_type=existing.entity_type, entity_id=existing.entity_id)

    et = EntityTag(tag_id=tag_id, entity_type=data.entity_type, entity_id=data.entity_id)
    db.add(et)
    db.flush()
    return EntityTagOut(tag_id=et.tag_id, tag_name=tag.name, tag_color=tag.color,
                        entity_type=et.entity_type, entity_id=et.entity_id)


@router.delete("/{tag_id}/entities", status_code=204)
def detach_tag(tag_id: str, data: EntityTagIn, db: Session = Depends(get_db)):
    et = db.query(EntityTag).filter(
        EntityTag.tag_id == tag_id,
        EntityTag.entity_type == data.entity_type,
        EntityTag.entity_id == data.entity_id,
    ).first()
    if not et:
        raise HTTPException(404, "Entity tag no encontrado")
    db.delete(et)
    return None


@router.get("/entity/{entity_type}/{entity_id}", response_model=list[TagOut])
def get_entity_tags(entity_type: str, entity_id: str, db: Session = Depends(get_db)):
    """Tags attached to a specific entity."""
    if entity_type not in ENTITY_TYPES:
        raise HTTPException(400, f"entity_type inválido. Válidos: {ENTITY_TYPES}")
    ets = db.query(EntityTag).filter(
        EntityTag.entity_type == entity_type,
        EntityTag.entity_id == entity_id,
    ).all()
    tags = []
    for et in ets:
        tag = db.query(Tag).filter(Tag.id == et.tag_id).first()
        if tag:
            tags.append(TagOut(id=tag.id, name=tag.name, color=tag.color, tag_type=tag.tag_type))
    return tags
