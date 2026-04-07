from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import CodeRelationship, Code

router = APIRouter(prefix="/api/relationships", tags=["relationships"])

REL_TYPES = [
    "causa_de", "conduce_a", "contradice", "co_ocurre_con",
    "ejemplo_de", "condicion_para", "parte_de", "custom",
]

REL_LABELS: dict[str, str] = {
    "causa_de": "causa de",
    "conduce_a": "conduce a",
    "contradice": "contradice",
    "co_ocurre_con": "co-ocurre con",
    "ejemplo_de": "ejemplo de",
    "condicion_para": "condición para",
    "parte_de": "parte de",
    "custom": "relación libre",
}


class RelationshipIn(BaseModel):
    source_code_id: str
    target_code_id: str
    rel_type: str
    label: Optional[str] = None


class RelationshipOut(BaseModel):
    id: str
    project_id: str
    source_code_id: str
    target_code_id: str
    source_code_name: str
    target_code_name: str
    source_code_color: str
    target_code_color: str
    rel_type: str
    rel_label_display: str
    label: Optional[str]
    created_at: str


def _to_out(rel: CodeRelationship, src: Code, tgt: Code) -> RelationshipOut:
    return RelationshipOut(
        id=rel.id,
        project_id=rel.project_id,
        source_code_id=rel.source_code_id,
        target_code_id=rel.target_code_id,
        source_code_name=src.name if src else "?",
        target_code_name=tgt.name if tgt else "?",
        source_code_color=src.color if src else "#888",
        target_code_color=tgt.color if tgt else "#888",
        rel_type=rel.rel_type,
        rel_label_display=rel.label if rel.rel_type == "custom" and rel.label else REL_LABELS.get(rel.rel_type, rel.rel_type),
        label=rel.label,
        created_at=rel.created_at.isoformat(),
    )


@router.get("/types", response_model=dict)
def list_rel_types():
    """Available relationship types."""
    return {"types": REL_TYPES, "labels": REL_LABELS}


@router.get("/", response_model=list[RelationshipOut])
def list_relationships(db: Session = Depends(get_db)):
    rels = db.query(CodeRelationship).all()
    result = []
    for r in rels:
        src = db.query(Code).filter(Code.id == r.source_code_id).first()
        tgt = db.query(Code).filter(Code.id == r.target_code_id).first()
        result.append(_to_out(r, src, tgt))
    return result


@router.post("/", response_model=RelationshipOut, status_code=201)
def create_relationship(data: RelationshipIn, db: Session = Depends(get_db)):
    if data.rel_type not in REL_TYPES:
        raise HTTPException(400, f"rel_type inválido. Válidos: {REL_TYPES}")

    src = db.query(Code).filter(Code.id == data.source_code_id).first()
    tgt = db.query(Code).filter(Code.id == data.target_code_id).first()
    if not src or not tgt:
        raise HTTPException(404, "Código origen o destino no encontrado")
    if src.project_id != tgt.project_id:
        raise HTTPException(400, "Los códigos deben pertenecer al mismo proyecto")

    rel = CodeRelationship(
        project_id=src.project_id,
        source_code_id=data.source_code_id,
        target_code_id=data.target_code_id,
        rel_type=data.rel_type,
        label=data.label,
    )
    db.add(rel)
    db.flush()
    return _to_out(rel, src, tgt)


@router.delete("/{rel_id}", status_code=204)
def delete_relationship(rel_id: str, db: Session = Depends(get_db)):
    rel = db.query(CodeRelationship).filter(CodeRelationship.id == rel_id).first()
    if not rel:
        raise HTTPException(404, "Relación no encontrada")
    db.delete(rel)
    return None
