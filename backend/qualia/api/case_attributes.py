from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import CaseAttribute, Document, Project

router = APIRouter(prefix="/api/case-attributes", tags=["case_attributes"])

ATTR_TYPES = ["text", "number", "date", "boolean"]


class CaseAttributeIn(BaseModel):
    document_id: str
    attr_name: str
    attr_value: Optional[str] = None
    attr_type: str = "text"


class CaseAttributeUpdate(BaseModel):
    attr_value: Optional[str] = None
    attr_type: Optional[str] = None


class CaseAttributeOut(BaseModel):
    id: str
    document_id: str
    document_name: str
    attr_name: str
    attr_value: Optional[str]
    attr_type: str


class CaseAttributesMatrix(BaseModel):
    attr_names: list[str]
    rows: list[dict]


@router.get("/", response_model=list[CaseAttributeOut])
def list_case_attributes(
    document_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(CaseAttribute)
    if document_id:
        q = q.filter(CaseAttribute.document_id == document_id)
    attrs = q.all()
    doc_cache: dict[str, Document] = {}
    result = []
    for a in attrs:
        if a.document_id not in doc_cache:
            doc_cache[a.document_id] = db.query(Document).filter(Document.id == a.document_id).first()
        doc = doc_cache[a.document_id]
        result.append(CaseAttributeOut(
            id=a.id,
            document_id=a.document_id,
            document_name=doc.name if doc else "?",
            attr_name=a.attr_name,
            attr_value=a.attr_value,
            attr_type=a.attr_type,
        ))
    return result


@router.post("/", response_model=CaseAttributeOut, status_code=201)
def create_case_attribute(data: CaseAttributeIn, db: Session = Depends(get_db)):
    if data.attr_type not in ATTR_TYPES:
        raise HTTPException(400, f"attr_type inválido. Válidos: {ATTR_TYPES}")

    project = db.query(Project).first()
    if not project:
        raise HTTPException(400, "Sin proyecto activo")

    doc = db.query(Document).filter(Document.id == data.document_id).first()
    if not doc:
        raise HTTPException(404, "Documento no encontrado")

    attr = CaseAttribute(
        project_id=project.id,
        document_id=data.document_id,
        attr_name=data.attr_name,
        attr_value=data.attr_value,
        attr_type=data.attr_type,
    )
    db.add(attr)
    db.flush()
    return CaseAttributeOut(
        id=attr.id,
        document_id=attr.document_id,
        document_name=doc.name,
        attr_name=attr.attr_name,
        attr_value=attr.attr_value,
        attr_type=attr.attr_type,
    )


@router.put("/{attr_id}", response_model=CaseAttributeOut)
def update_case_attribute(attr_id: str, data: CaseAttributeUpdate, db: Session = Depends(get_db)):
    attr = db.query(CaseAttribute).filter(CaseAttribute.id == attr_id).first()
    if not attr:
        raise HTTPException(404, "Atributo no encontrado")
    if data.attr_type is not None:
        if data.attr_type not in ATTR_TYPES:
            raise HTTPException(400, f"attr_type inválido. Válidos: {ATTR_TYPES}")
        attr.attr_type = data.attr_type
    if data.attr_value is not None:
        attr.attr_value = data.attr_value
    doc = db.query(Document).filter(Document.id == attr.document_id).first()
    return CaseAttributeOut(
        id=attr.id,
        document_id=attr.document_id,
        document_name=doc.name if doc else "?",
        attr_name=attr.attr_name,
        attr_value=attr.attr_value,
        attr_type=attr.attr_type,
    )


@router.delete("/{attr_id}", status_code=204)
def delete_case_attribute(attr_id: str, db: Session = Depends(get_db)):
    attr = db.query(CaseAttribute).filter(CaseAttribute.id == attr_id).first()
    if not attr:
        raise HTTPException(404, "Atributo no encontrado")
    db.delete(attr)
    return None


@router.get("/matrix", response_model=CaseAttributesMatrix)
def case_attributes_matrix(db: Session = Depends(get_db)):
    """Documents × Case Attributes matrix for mixed methods analysis."""
    docs = db.query(Document).all()
    attrs = db.query(CaseAttribute).all()

    attr_names = sorted(set(a.attr_name for a in attrs))

    doc_attrs: dict[str, dict[str, str]] = {}
    for a in attrs:
        if a.document_id not in doc_attrs:
            doc_attrs[a.document_id] = {}
        doc_attrs[a.document_id][a.attr_name] = a.attr_value or ""

    rows = []
    for doc in docs:
        row: dict = {"document_id": doc.id, "document_name": doc.name}
        for name in attr_names:
            row[name] = doc_attrs.get(doc.id, {}).get(name, "")
        rows.append(row)

    return CaseAttributesMatrix(attr_names=attr_names, rows=rows)
