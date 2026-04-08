from __future__ import annotations
import csv
import io
import re
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from qualia.core.csv_utils import sanitize_csv_row
from qualia.core.database import get_db
from qualia.models import (
    Code, Coding, Excerpt, Document, Memo, EntityLink, CodeRelationship,
)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


# === Document × Code matrix ===

class MatrixCell(BaseModel):
    count: int


class DocCodeMatrix(BaseModel):
    documents: list[dict]  # [{id, name}]
    codes: list[dict]      # [{id, name, color}]
    matrix: list[list[int]]  # matrix[doc_idx][code_idx] = count


@router.get("/doc-code-matrix", response_model=DocCodeMatrix)
def doc_code_matrix(db: Session = Depends(get_db)):
    """Document × Code frequency matrix."""
    docs = db.query(Document).filter(Document.content.isnot(None)).all()
    codes = db.query(Code).order_by(Code.sort_order).all()

    doc_list = [{"id": d.id, "name": d.name} for d in docs]
    code_list = [{"id": c.id, "name": c.name, "color": c.color} for c in codes]

    doc_idx = {d.id: i for i, d in enumerate(docs)}
    code_idx = {c.id: i for i, c in enumerate(codes)}

    matrix = [[0] * len(codes) for _ in range(len(docs))]

    codings = (
        db.query(Coding, Excerpt)
        .join(Excerpt, Coding.excerpt_id == Excerpt.id)
        .all()
    )
    for coding, excerpt in codings:
        di = doc_idx.get(excerpt.document_id)
        ci = code_idx.get(coding.code_id)
        if di is not None and ci is not None:
            matrix[di][ci] += 1

    return DocCodeMatrix(documents=doc_list, codes=code_list, matrix=matrix)


# === Co-occurrence matrix ===

class CoOccurrenceMatrix(BaseModel):
    codes: list[dict]       # [{id, name, color}]
    matrix: list[list[int]]  # symmetric matrix


@router.get("/co-occurrence", response_model=CoOccurrenceMatrix)
def co_occurrence(
    level: str = Query("excerpt", description="Co-occurrence level: excerpt or document"),
    db: Session = Depends(get_db),
):
    """Code co-occurrence matrix. Two codes co-occur when they share an excerpt (or document)."""
    codes = db.query(Code).order_by(Code.sort_order).all()
    code_list = [{"id": c.id, "name": c.name, "color": c.color} for c in codes]
    code_idx = {c.id: i for i, c in enumerate(codes)}
    n = len(codes)
    matrix = [[0] * n for _ in range(n)]

    codings = (
        db.query(Coding.code_id, Excerpt.id, Excerpt.document_id)
        .join(Excerpt, Coding.excerpt_id == Excerpt.id)
        .all()
    )

    # Group codes by unit (excerpt or document)
    unit_codes: dict[str, set[str]] = defaultdict(set)
    for code_id, excerpt_id, doc_id in codings:
        key = excerpt_id if level == "excerpt" else doc_id
        unit_codes[key].add(code_id)

    # Count co-occurrences
    for codes_in_unit in unit_codes.values():
        code_list_in_unit = list(codes_in_unit)
        for i in range(len(code_list_in_unit)):
            for j in range(i + 1, len(code_list_in_unit)):
                ci = code_idx.get(code_list_in_unit[i])
                cj = code_idx.get(code_list_in_unit[j])
                if ci is not None and cj is not None:
                    matrix[ci][cj] += 1
                    matrix[cj][ci] += 1

    # Diagonal = self-count (total codings per code)
    code_counts = defaultdict(int)
    for code_id, _, _ in codings:
        code_counts[code_id] += 1
    for code_id, count in code_counts.items():
        ci = code_idx.get(code_id)
        if ci is not None:
            matrix[ci][ci] = count

    return CoOccurrenceMatrix(codes=code_list, matrix=matrix)


class CoOccurrenceDetail(BaseModel):
    code_a: dict  # {id, name, color}
    code_b: dict  # {id, name, color}
    count: int
    excerpts: list[dict]  # [{id, text, document_name}]


def _co_occurrence_filename(code_a_name: str, code_b_name: str) -> str:
    def slugify(value: str) -> str:
        value = value.strip().lower()
        value = re.sub(r"[^a-z0-9]+", "-", value)
        return value.strip("-") or "codigo"

    return f"co-ocurrencia-{slugify(code_a_name)}-{slugify(code_b_name)}.csv"


def _get_co_occurrence_excerpts(
    db: Session,
    *,
    code_a_id: str,
    code_b_id: str,
    level: str,
) -> list[dict]:
    if code_a_id == code_b_id:
        rows = (
            db.query(Excerpt, Document)
            .join(Coding, Coding.excerpt_id == Excerpt.id)
            .join(Document, Excerpt.document_id == Document.id)
            .filter(Coding.code_id == code_a_id)
            .distinct()
            .order_by(Document.name.asc(), Excerpt.page_number.asc(), Excerpt.start_pos.asc())
            .all()
        )
    elif level == "excerpt":
        excerpt_ids_for_code_a = (
            db.query(Coding.excerpt_id)
            .filter(Coding.code_id == code_a_id)
            .subquery()
        )
        rows = (
            db.query(Excerpt, Document)
            .join(Coding, Coding.excerpt_id == Excerpt.id)
            .join(Document, Excerpt.document_id == Document.id)
            .filter(
                Coding.code_id == code_b_id,
                Excerpt.id.in_(excerpt_ids_for_code_a),
            )
            .distinct()
            .order_by(Document.name.asc(), Excerpt.page_number.asc(), Excerpt.start_pos.asc())
            .all()
        )
    else:
        document_ids_for_code_a = (
            db.query(Excerpt.document_id)
            .join(Coding, Coding.excerpt_id == Excerpt.id)
            .filter(Coding.code_id == code_a_id)
            .subquery()
        )
        rows = (
            db.query(Excerpt, Document)
            .join(Coding, Coding.excerpt_id == Excerpt.id)
            .join(Document, Excerpt.document_id == Document.id)
            .filter(
                Coding.code_id == code_b_id,
                Excerpt.document_id.in_(document_ids_for_code_a),
            )
            .distinct()
            .order_by(Document.name.asc(), Excerpt.page_number.asc(), Excerpt.start_pos.asc())
            .all()
        )

    return [
        {
            "id": excerpt.id,
            "text": excerpt.text,
            "document_id": document.id,
            "document_name": document.name,
            "page_number": excerpt.page_number,
            "start_pos": excerpt.start_pos,
            "end_pos": excerpt.end_pos,
        }
        for excerpt, document in rows
    ]


@router.get("/co-occurrence/detail", response_model=CoOccurrenceDetail)
def co_occurrence_detail(
    code_a_id: str = Query(...),
    code_b_id: str = Query(...),
    level: str = Query("excerpt"),
    db: Session = Depends(get_db),
):
    """Get shared excerpts between two co-occurring codes."""
    code_a = db.query(Code).filter(Code.id == code_a_id).first()
    code_b = db.query(Code).filter(Code.id == code_b_id).first()
    if not code_a or not code_b:
        from fastapi import HTTPException
        raise HTTPException(404, "Code not found")

    excerpts = _get_co_occurrence_excerpts(
        db,
        code_a_id=code_a_id,
        code_b_id=code_b_id,
        level=level,
    )

    return CoOccurrenceDetail(
        code_a={"id": code_a.id, "name": code_a.name, "color": code_a.color},
        code_b={"id": code_b.id, "name": code_b.name, "color": code_b.color},
        count=len(excerpts),
        excerpts=excerpts,
    )


@router.get("/co-occurrence/export")
def export_co_occurrence_detail(
    code_a_id: str = Query(...),
    code_b_id: str = Query(...),
    level: str = Query("excerpt"),
    db: Session = Depends(get_db),
):
    """Export shared excerpts for a co-occurrence pair as tabular CSV."""
    code_a = db.query(Code).filter(Code.id == code_a_id).first()
    code_b = db.query(Code).filter(Code.id == code_b_id).first()
    if not code_a or not code_b:
        from fastapi import HTTPException
        raise HTTPException(404, "Code not found")

    excerpts = _get_co_occurrence_excerpts(
        db,
        code_a_id=code_a_id,
        code_b_id=code_b_id,
        level=level,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(sanitize_csv_row([
        "level",
        "code_a_id",
        "code_a_name",
        "code_b_id",
        "code_b_name",
        "document_id",
        "document_name",
        "excerpt_id",
        "page_number",
        "start_pos",
        "end_pos",
        "source",
        "excerpt_text",
    ]))
    for excerpt in excerpts:
        source = excerpt["document_name"]
        if excerpt["page_number"] is not None:
            source += f" · p. {excerpt['page_number']}"
        source += f" · {excerpt['start_pos']}-{excerpt['end_pos']}"
        writer.writerow(sanitize_csv_row([
            level,
            code_a.id,
            code_a.name,
            code_b.id,
            code_b.name,
            excerpt["document_id"],
            excerpt["document_name"],
            excerpt["id"],
            excerpt["page_number"] or "",
            excerpt["start_pos"],
            excerpt["end_pos"],
            source,
            excerpt["text"] or "",
        ]))
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f"attachment; filename={_co_occurrence_filename(code_a.name, code_b.name)}"
            )
        },
    )


# === Code network ===

class NetworkNode(BaseModel):
    id: str
    name: str
    color: str
    size: int  # number of codings


class NetworkEdge(BaseModel):
    source: str
    target: str
    rel_type: str
    label: Optional[str] = None


class CodeNetwork(BaseModel):
    nodes: list[NetworkNode]
    edges: list[NetworkEdge]


@router.get("/code-network", response_model=CodeNetwork)
def code_network(db: Session = Depends(get_db)):
    """Code relationship network for D3 force-directed graph."""
    codes = db.query(Code).all()
    rels = db.query(CodeRelationship).all()

    # Count codings per code
    coding_counts = defaultdict(int)
    for coding in db.query(Coding).all():
        coding_counts[coding.code_id] += 1

    nodes = [
        NetworkNode(
            id=c.id, name=c.name, color=c.color,
            size=max(5, coding_counts.get(c.id, 0)),
        )
        for c in codes
    ]

    edges = [
        NetworkEdge(
            source=r.source_code_id, target=r.target_code_id,
            rel_type=r.rel_type, label=r.label,
        )
        for r in rels
    ]

    return CodeNetwork(nodes=nodes, edges=edges)


# === Evidence network (bipartite: codes ↔ excerpts ↔ documents) ===

class EvidenceNode(BaseModel):
    id: str
    name: str
    node_type: str  # 'code', 'document'
    color: str
    size: int


class EvidenceEdge(BaseModel):
    source: str
    target: str
    weight: int  # number of excerpts linking them


class EvidenceNetwork(BaseModel):
    nodes: list[EvidenceNode]
    edges: list[EvidenceEdge]


@router.get("/evidence-network", response_model=EvidenceNetwork)
def evidence_network(db: Session = Depends(get_db)):
    """Bipartite graph: codes ↔ documents connected by excerpts."""
    codes = db.query(Code).all()
    docs = db.query(Document).filter(Document.content.isnot(None)).all()

    codings = (
        db.query(Coding.code_id, Excerpt.document_id)
        .join(Excerpt, Coding.excerpt_id == Excerpt.id)
        .all()
    )

    # Count edges between code and document
    edge_counts: dict[tuple[str, str], int] = defaultdict(int)
    for code_id, doc_id in codings:
        edge_counts[(code_id, doc_id)] += 1

    # Only include codes/docs that have at least one coding
    active_codes = {code_id for code_id, _ in edge_counts.keys()}
    active_docs = {doc_id for _, doc_id in edge_counts.keys()}

    code_map = {c.id: c for c in codes}
    doc_map = {d.id: d for d in docs}

    nodes: list[EvidenceNode] = []
    for cid in active_codes:
        c = code_map.get(cid)
        if c:
            nodes.append(EvidenceNode(
                id=c.id, name=c.name, node_type="code",
                color=c.color, size=sum(v for (k, _), v in edge_counts.items() if k == cid),
            ))
    for did in active_docs:
        d = doc_map.get(did)
        if d:
            nodes.append(EvidenceNode(
                id=d.id, name=d.name, node_type="document",
                color="#6e6e73", size=sum(v for (_, k), v in edge_counts.items() if k == did),
            ))

    edges = [
        EvidenceEdge(source=code_id, target=doc_id, weight=count)
        for (code_id, doc_id), count in edge_counts.items()
    ]

    return EvidenceNetwork(nodes=nodes, edges=edges)


# === Timeline ===

class TimelineEvent(BaseModel):
    id: str
    event_type: str  # 'coding', 'memo'
    name: str
    color: str
    created_at: str
    document_name: Optional[str] = None


@router.get("/timeline", response_model=list[TimelineEvent])
def timeline(db: Session = Depends(get_db)):
    """Chronological timeline of codings and memos."""
    events: list[TimelineEvent] = []

    codings = (
        db.query(Coding, Code, Excerpt, Document)
        .join(Excerpt, Coding.excerpt_id == Excerpt.id)
        .join(Code, Coding.code_id == Code.id)
        .join(Document, Excerpt.document_id == Document.id)
        .order_by(Coding.created_at)
        .all()
    )
    for coding, code, excerpt, doc in codings:
        events.append(TimelineEvent(
            id=coding.id, event_type="coding",
            name=code.name, color=code.color,
            created_at=coding.created_at.isoformat(),
            document_name=doc.name,
        ))

    memos = db.query(Memo).order_by(Memo.created_at).all()
    for m in memos:
        events.append(TimelineEvent(
            id=m.id, event_type="memo",
            name=m.title or "Memo",
            color="#007aff",
            created_at=m.created_at.isoformat(),
        ))

    events.sort(key=lambda e: e.created_at)
    return events
