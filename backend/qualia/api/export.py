from __future__ import annotations

import csv
import io
import re
import zipfile
from collections import defaultdict
from datetime import datetime
from itertools import combinations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from qualia.core.database import get_db
from qualia.models import (
    CaseAttribute,
    Code,
    CodeRelationship,
    Coding,
    Document,
    EntityLink,
    Excerpt,
    Memo,
    Project,
)

router = APIRouter(prefix="/api/export", tags=["export"])

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


class ReportRequest(BaseModel):
    document_ids: list[str] = Field(default_factory=list)
    code_ids: list[str] = Field(default_factory=list)
    include_memos: bool = True
    include_relationships: bool = True
    include_case_attributes: bool = True
    co_occurrence_level: str = "excerpt"
    max_co_occurrences: int = 20
    max_relationship_evidence: int = 3


class ReportPreview(BaseModel):
    title: str
    generated_at: str
    summary: dict[str, int]
    markdown: str
    csv_files: list[str]


def _sanitize_filename(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "informe"


def _resolve_documents(db: Session, document_ids: list[str]) -> list[Document]:
    q = db.query(Document).order_by(Document.name.asc())
    if document_ids:
        docs = q.filter(Document.id.in_(document_ids)).all()
        missing = sorted(set(document_ids) - {doc.id for doc in docs})
        if missing:
            raise HTTPException(404, f"Documentos no encontrados: {', '.join(missing)}")
        return docs
    return q.all()


def _resolve_codes(db: Session, code_ids: list[str]) -> list[Code]:
    q = db.query(Code).order_by(Code.sort_order.asc(), Code.name.asc())
    if code_ids:
        codes = q.filter(Code.id.in_(code_ids)).all()
        missing = sorted(set(code_ids) - {code.id for code in codes})
        if missing:
            raise HTTPException(404, f"Códigos no encontrados: {', '.join(missing)}")
        return codes
    return q.all()


def _build_code_path_map(codes: list[Code]) -> dict[str, str]:
    code_by_id = {code.id: code for code in codes}
    cache: dict[str, str] = {}

    def walk(code_id: str) -> str:
        if code_id in cache:
            return cache[code_id]
        code = code_by_id[code_id]
        names = [code.name]
        seen = {code_id}
        parent_id = code.parent_id
        while parent_id and parent_id in code_by_id and parent_id not in seen:
            parent = code_by_id[parent_id]
            names.append(parent.name)
            seen.add(parent_id)
            parent_id = parent.parent_id
        names.reverse()
        cache[code_id] = " > ".join(names)
        return cache[code_id]

    return {code.id: walk(code.id) for code in codes}


def _format_excerpt_source(excerpt: Excerpt, document: Document) -> str:
    parts = [document.name]
    if excerpt.page_number is not None:
        parts.append(f"p. {excerpt.page_number}")
    parts.append(f"{excerpt.start_pos}-{excerpt.end_pos}")
    return " · ".join(parts)


def _ascii_bar(value: int, max_value: int, width: int = 12) -> str:
    if value <= 0 or max_value <= 0:
        return ""
    filled = max(1, round((value / max_value) * width))
    return "#" * min(width, filled)


def _escape_md(value: object) -> str:
    return str(value or "").replace("|", "\\|")


def _collect_scoped_codings(
    db: Session,
    *,
    document_ids: set[str],
    code_ids: set[str],
) -> list[dict]:
    rows = (
        db.query(Coding, Excerpt, Code, Document)
        .join(Excerpt, Coding.excerpt_id == Excerpt.id)
        .join(Code, Coding.code_id == Code.id)
        .join(Document, Excerpt.document_id == Document.id)
        .filter(Document.id.in_(document_ids), Code.id.in_(code_ids))
        .order_by(Document.name.asc(), Excerpt.page_number.asc(), Excerpt.start_pos.asc(), Code.name.asc())
        .all()
    )

    scoped = []
    for coding, excerpt, code, document in rows:
        scoped.append(
            {
                "coding": coding,
                "excerpt": excerpt,
                "code": code,
                "document": document,
            }
        )
    return scoped


def _build_co_occurrence_rows(
    scoped_codings: list[dict],
    *,
    code_path_map: dict[str, str],
    relationships: list[dict],
    primary_level: str,
) -> list[dict]:
    excerpt_units: dict[str, set[str]] = defaultdict(set)
    document_units: dict[str, set[str]] = defaultdict(set)
    code_meta: dict[str, dict] = {}

    for row in scoped_codings:
        coding = row["coding"]
        excerpt = row["excerpt"]
        code = row["code"]
        code_meta[code.id] = {
            "id": code.id,
            "name": code.name,
            "color": code.color,
            "path": code_path_map.get(code.id, code.name),
        }
        excerpt_units[excerpt.id].add(coding.code_id)
        document_units[excerpt.document_id].add(coding.code_id)

    excerpt_counts: dict[tuple[str, str], int] = defaultdict(int)
    document_counts: dict[tuple[str, str], int] = defaultdict(int)

    for codes_in_excerpt in excerpt_units.values():
        for code_a_id, code_b_id in combinations(sorted(codes_in_excerpt), 2):
            excerpt_counts[(code_a_id, code_b_id)] += 1

    for codes_in_document in document_units.values():
        for code_a_id, code_b_id in combinations(sorted(codes_in_document), 2):
            document_counts[(code_a_id, code_b_id)] += 1

    relationships_by_pair: dict[tuple[str, str], list[str]] = defaultdict(list)
    for rel in relationships:
        pair = tuple(sorted((rel["source_code_id"], rel["target_code_id"])))
        label = rel["rel_label_display"]
        relationships_by_pair[pair].append(label)

    pairs = set(excerpt_counts) | set(document_counts) | set(relationships_by_pair)
    def pair_sort_key(pair: tuple[str, str]) -> tuple[int, int, str, str]:
        primary = excerpt_counts.get(pair, 0) if primary_level == "excerpt" else document_counts.get(pair, 0)
        secondary = document_counts.get(pair, 0) if primary_level == "excerpt" else excerpt_counts.get(pair, 0)
        return (
            -primary,
            -secondary,
            code_meta.get(pair[0], {}).get("name", ""),
            code_meta.get(pair[1], {}).get("name", ""),
        )

    rows = []
    for code_a_id, code_b_id in sorted(pairs, key=pair_sort_key):
        code_a = code_meta.get(code_a_id)
        code_b = code_meta.get(code_b_id)
        if not code_a or not code_b:
            continue
        excerpt_count = excerpt_counts.get((code_a_id, code_b_id), 0)
        document_count = document_counts.get((code_a_id, code_b_id), 0)
        rows.append(
            {
                "code_a_id": code_a_id,
                "code_a_name": code_a["name"],
                "code_a_path": code_a["path"],
                "code_b_id": code_b_id,
                "code_b_name": code_b["name"],
                "code_b_path": code_b["path"],
                "excerpt_count": excerpt_count,
                "document_count": document_count,
                "relationship_labels": " · ".join(relationships_by_pair.get((code_a_id, code_b_id), [])),
            }
        )
    return rows


def _collect_case_attribute_rows(db: Session, *, document_ids: set[str]) -> tuple[list[str], list[dict]]:
    attrs = (
        db.query(CaseAttribute, Document)
        .join(Document, CaseAttribute.document_id == Document.id)
        .filter(Document.id.in_(document_ids))
        .order_by(Document.name.asc(), CaseAttribute.attr_name.asc())
        .all()
    )

    attr_names = sorted({attr.attr_name for attr, _ in attrs})
    by_doc: dict[str, dict] = {}
    for attr, document in attrs:
        if document.id not in by_doc:
            by_doc[document.id] = {
                "document_id": document.id,
                "document_name": document.name,
            }
        by_doc[document.id][attr.attr_name] = attr.attr_value or ""

    rows = []
    for document_id in sorted(by_doc, key=lambda doc_id: by_doc[doc_id]["document_name"]):
        row = by_doc[document_id]
        for attr_name in attr_names:
            row.setdefault(attr_name, "")
        rows.append(row)
    return attr_names, rows


def _collect_memo_rows(
    db: Session,
    *,
    document_ids: set[str],
    code_ids: set[str],
    excerpt_ids: set[str],
    coding_ids: set[str],
    code_path_map: dict[str, str],
) -> list[dict]:
    memos = db.query(Memo).order_by(Memo.updated_at.desc()).all()
    links = db.query(EntityLink).filter(EntityLink.source_type == "memo").all()

    links_by_memo: dict[str, list[EntityLink]] = defaultdict(list)
    for link in links:
        links_by_memo[link.source_id].append(link)

    document_map = {
        doc.id: doc.name
        for doc in db.query(Document).filter(Document.id.in_(document_ids)).all()
    }

    memo_rows: list[dict] = []
    for memo in memos:
        memo_links = links_by_memo.get(memo.id, [])
        if not memo_links:
            continue

        scoped_links = []
        for link in memo_links:
            in_scope = (
                (link.target_type == "document" and link.target_id in document_ids)
                or (link.target_type == "code" and link.target_id in code_ids)
                or (link.target_type == "excerpt" and link.target_id in excerpt_ids)
                or (link.target_type == "coding" and link.target_id in coding_ids)
            )
            if not in_scope:
                continue

            target_label = link.target_id
            if link.target_type == "document":
                target_label = document_map.get(link.target_id, link.target_id)
            elif link.target_type == "code":
                target_label = code_path_map.get(link.target_id, link.target_id)
            scoped_links.append(f"{link.target_type}:{target_label}")

        if not scoped_links:
            continue

        memo_rows.append(
            {
                "memo_id": memo.id,
                "title": memo.title or "(sin título)",
                "memo_type": memo.memo_type,
                "content": memo.content,
                "links": scoped_links,
                "created_at": memo.created_at.isoformat(),
                "updated_at": memo.updated_at.isoformat(),
            }
        )

    return memo_rows


def _collect_relationship_rows(
    db: Session,
    *,
    document_ids: set[str],
    code_ids: set[str],
    code_path_map: dict[str, str],
    max_evidence: int,
) -> tuple[list[dict], list[dict]]:
    relationships = (
        db.query(CodeRelationship)
        .filter(CodeRelationship.source_code_id.in_(code_ids), CodeRelationship.target_code_id.in_(code_ids))
        .all()
    )

    relationship_rows: list[dict] = []
    evidence_rows: list[dict] = []

    for rel in relationships:
        rel_label = rel.label if rel.rel_type == "custom" and rel.label else REL_LABELS.get(rel.rel_type, rel.rel_type)
        relationship_rows.append(
            {
                "relationship_id": rel.id,
                "source_code_id": rel.source_code_id,
                "source_code_path": code_path_map.get(rel.source_code_id, rel.source_code_id),
                "target_code_id": rel.target_code_id,
                "target_code_path": code_path_map.get(rel.target_code_id, rel.target_code_id),
                "rel_type": rel.rel_type,
                "rel_label_display": rel_label,
                "created_at": rel.created_at.isoformat(),
            }
        )

        shared_rows = (
            db.query(Excerpt, Document)
            .join(Coding, Coding.excerpt_id == Excerpt.id)
            .join(Document, Excerpt.document_id == Document.id)
            .filter(
                Coding.code_id == rel.target_code_id,
                Excerpt.document_id.in_(document_ids),
                Excerpt.id.in_(
                    db.query(Coding.excerpt_id)
                    .join(Excerpt, Coding.excerpt_id == Excerpt.id)
                    .filter(Coding.code_id == rel.source_code_id, Excerpt.document_id.in_(document_ids))
                    .subquery()
                ),
            )
            .distinct()
            .order_by(Document.name.asc(), Excerpt.page_number.asc(), Excerpt.start_pos.asc())
            .limit(max_evidence)
            .all()
        )

        if shared_rows:
            for excerpt, document in shared_rows:
                evidence_rows.append(
                    {
                        "relationship_id": rel.id,
                        "source_code_path": code_path_map.get(rel.source_code_id, rel.source_code_id),
                        "target_code_path": code_path_map.get(rel.target_code_id, rel.target_code_id),
                        "rel_label_display": rel_label,
                        "evidence_mode": "shared_excerpt",
                        "excerpt_role": "shared",
                        "document_id": document.id,
                        "document_name": document.name,
                        "excerpt_id": excerpt.id,
                        "page_number": excerpt.page_number,
                        "start_pos": excerpt.start_pos,
                        "end_pos": excerpt.end_pos,
                        "source": _format_excerpt_source(excerpt, document),
                        "excerpt_text": excerpt.text or "",
                    }
                )
            continue

        shared_document_ids = (
            db.query(Excerpt.document_id)
            .join(Coding, Coding.excerpt_id == Excerpt.id)
            .filter(Coding.code_id == rel.source_code_id, Excerpt.document_id.in_(document_ids))
            .intersect(
                db.query(Excerpt.document_id)
                .join(Coding, Coding.excerpt_id == Excerpt.id)
                .filter(Coding.code_id == rel.target_code_id, Excerpt.document_id.in_(document_ids))
            )
            .all()
        )

        for (document_id,) in shared_document_ids[:max_evidence]:
            source_row = (
                db.query(Excerpt, Document)
                .join(Coding, Coding.excerpt_id == Excerpt.id)
                .join(Document, Excerpt.document_id == Document.id)
                .filter(Coding.code_id == rel.source_code_id, Excerpt.document_id == document_id)
                .order_by(Excerpt.page_number.asc(), Excerpt.start_pos.asc())
                .first()
            )
            target_row = (
                db.query(Excerpt, Document)
                .join(Coding, Coding.excerpt_id == Excerpt.id)
                .join(Document, Excerpt.document_id == Document.id)
                .filter(Coding.code_id == rel.target_code_id, Excerpt.document_id == document_id)
                .order_by(Excerpt.page_number.asc(), Excerpt.start_pos.asc())
                .first()
            )

            for role, row in (("source", source_row), ("target", target_row)):
                if not row:
                    continue
                excerpt, document = row
                evidence_rows.append(
                    {
                        "relationship_id": rel.id,
                        "source_code_path": code_path_map.get(rel.source_code_id, rel.source_code_id),
                        "target_code_path": code_path_map.get(rel.target_code_id, rel.target_code_id),
                        "rel_label_display": rel_label,
                        "evidence_mode": "paired_document_excerpts",
                        "excerpt_role": role,
                        "document_id": document.id,
                        "document_name": document.name,
                        "excerpt_id": excerpt.id,
                        "page_number": excerpt.page_number,
                        "start_pos": excerpt.start_pos,
                        "end_pos": excerpt.end_pos,
                        "source": _format_excerpt_source(excerpt, document),
                        "excerpt_text": excerpt.text or "",
                    }
                )

    relationship_rows.sort(
        key=lambda row: (row["source_code_path"], row["target_code_path"], row["rel_label_display"])
    )
    evidence_rows.sort(
        key=lambda row: (
            row["source_code_path"],
            row["target_code_path"],
            row["document_name"],
            row["page_number"] or 0,
            row["start_pos"],
            row["excerpt_role"],
        )
    )
    return relationship_rows, evidence_rows


def _render_markdown_report(
    *,
    project: Optional[Project],
    generated_at: datetime,
    documents: list[Document],
    codes: list[Code],
    code_path_map: dict[str, str],
    scoped_codings: list[dict],
    co_occurrence_rows: list[dict],
    case_attr_names: list[str],
    case_attr_rows: list[dict],
    memo_rows: list[dict],
    relationship_rows: list[dict],
    relationship_evidence_rows: list[dict],
    request: ReportRequest,
) -> str:
    project_name = project.name if project else "Proyecto"
    lines = [
        f"# Informe analítico — {project_name}",
        "",
        f"_Generado el {generated_at.strftime('%Y-%m-%d %H:%M')}_",
        "",
        "## Alcance",
        "",
        f"- Documentos incluidos: {len(documents)}",
        f"- Códigos incluidos: {len(codes)}",
        f"- Codificaciones en alcance: {len(scoped_codings)}",
        f"- Memos incluidos: {'sí' if request.include_memos else 'no'}",
        f"- Relaciones entre códigos incluidas: {'sí' if request.include_relationships else 'no'}",
        f"- Atributos de caso incluidos: {'sí' if request.include_case_attributes else 'no'}",
        "",
        "## Documentos seleccionados",
        "",
        "| Documento | Tipo | Páginas |",
        "| --- | --- | ---: |",
    ]
    for document in documents:
        lines.append(f"| {document.name} | {document.doc_type} | {document.page_count or ''} |")

    lines.extend(
        [
            "",
            "## Códigos seleccionados",
            "",
            "| Código | Descripción | Color |",
            "| --- | --- | --- |",
        ]
    )
    for code in codes:
        lines.append(
            f"| {_escape_md(code_path_map.get(code.id, code.name))} | {_escape_md(code.description or '')} | {code.color} |"
        )

    code_counts: dict[str, int] = defaultdict(int)
    doc_counts_by_code: dict[str, set[str]] = defaultdict(set)
    excerpt_ids = set()
    for row in scoped_codings:
        code = row["code"]
        excerpt = row["excerpt"]
        code_counts[code.id] += 1
        doc_counts_by_code[code.id].add(excerpt.document_id)
        excerpt_ids.add(excerpt.id)

    lines.extend(
        [
            "",
            "## Resumen de codificación",
            "",
            f"- Excerpts distintos en alcance: {len(excerpt_ids)}",
            "",
            "| Código | Codificaciones | Documentos |",
            "| --- | ---: | ---: |",
        ]
    )
    for code in sorted(codes, key=lambda item: (-code_counts.get(item.id, 0), code_path_map.get(item.id, item.name))):
        lines.append(
            f"| {code_path_map.get(code.id, code.name)} | {code_counts.get(code.id, 0)} | {len(doc_counts_by_code.get(code.id, set()))} |"
        )

    lines.extend(
        [
            "",
            "## Co-ocurrencias clave",
            "",
            "Visualización tabular ordenada por fragmentos compartidos.",
            "",
            "| Par de códigos | Fragmentos compartidos | Documentos compartidos | Relación explícita | Intensidad |",
            "| --- | ---: | ---: | --- | --- |",
        ]
    )
    max_excerpt_count = max((row["excerpt_count"] for row in co_occurrence_rows), default=0)
    for row in co_occurrence_rows[: max(1, request.max_co_occurrences)]:
        pair_label = f"{row['code_a_path']} ↔ {row['code_b_path']}"
        rel_label = row["relationship_labels"] or ""
        intensity = _ascii_bar(row["excerpt_count"], max_excerpt_count)
        lines.append(
            f"| {pair_label} | {row['excerpt_count']} | {row['document_count']} | {rel_label} | {intensity} |"
        )

    if request.include_case_attributes:
        lines.extend(["", "## Atributos de caso", ""])
        if case_attr_rows and case_attr_names:
            header = "| Documento | " + " | ".join(case_attr_names) + " |"
            separator = "| --- | " + " | ".join("---" for _ in case_attr_names) + " |"
            lines.extend([header, separator])
            for row in case_attr_rows:
                values = " | ".join(str(row.get(attr_name, "")).replace("|", "\\|") for attr_name in case_attr_names)
                lines.append(f"| {row['document_name']} | {values} |")
        else:
            lines.append("Sin atributos de caso en la selección actual.")

    if request.include_relationships:
        lines.extend(["", "## Relaciones entre códigos y fragmentos ilustrativos", ""])
        if relationship_rows:
            evidence_by_relationship: dict[str, list[dict]] = defaultdict(list)
            for evidence in relationship_evidence_rows:
                evidence_by_relationship[evidence["relationship_id"]].append(evidence)

            for relationship in relationship_rows:
                lines.extend(
                    [
                        f"### {relationship['source_code_path']} {relationship['rel_label_display']} {relationship['target_code_path']}",
                        "",
                    ]
                )
                evidence = evidence_by_relationship.get(relationship["relationship_id"], [])
                if not evidence:
                    lines.append("- Sin fragmentos ilustrativos en la selección actual.")
                    lines.append("")
                    continue
                for item in evidence:
                    role_suffix = ""
                    if item["evidence_mode"] == "paired_document_excerpts":
                        role_suffix = f" ({'origen' if item['excerpt_role'] == 'source' else 'destino'})"
                    lines.append(
                        f"- {item['source']}{role_suffix}: \"{(item['excerpt_text'] or '').replace(chr(10), ' ').strip()}\""
                    )
                lines.append("")
        else:
            lines.append("Sin relaciones explícitas entre los códigos seleccionados.")

    if request.include_memos:
        lines.extend(["", "## Memos vinculados", ""])
        if memo_rows:
            lines.extend(
                [
                    "| Memo | Tipo | Enlaces | Actualizado |",
                    "| --- | --- | --- | --- |",
                ]
            )
            for memo in memo_rows:
                links = ", ".join(memo["links"]).replace("|", "\\|")
                lines.append(
                    f"| {_escape_md(memo['title'])} | {memo['memo_type']} | {links} | {memo['updated_at'][:10]} |"
                )
                excerpt = memo["content"].strip().replace("\n", " ")
                if excerpt:
                    lines.append(f"|  |  | {_escape_md(excerpt[:220])}{'...' if len(excerpt) > 220 else ''} |  |")
        else:
            lines.append("Sin memos vinculados en la selección actual.")

    lines.append("")
    return "\n".join(lines)


def _write_csv(zip_file: zipfile.ZipFile, filename: str, headers: list[str], rows: list[list[object]]) -> None:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    zip_file.writestr(filename, output.getvalue().encode("utf-8"))


def _build_report_payload(db: Session, request: ReportRequest) -> dict:
    if request.co_occurrence_level not in {"excerpt", "document"}:
        raise HTTPException(400, "co_occurrence_level debe ser 'excerpt' o 'document'")

    project = db.query(Project).first()
    documents = _resolve_documents(db, request.document_ids)
    codes = _resolve_codes(db, request.code_ids)

    if not documents:
        raise HTTPException(400, "No hay documentos en el alcance seleccionado")
    if not codes:
        raise HTTPException(400, "No hay códigos en el alcance seleccionado")

    document_ids = {document.id for document in documents}
    code_ids = {code.id for code in codes}
    code_path_map = _build_code_path_map(codes)

    scoped_codings = _collect_scoped_codings(db, document_ids=document_ids, code_ids=code_ids)
    scoped_excerpt_ids = {row["excerpt"].id for row in scoped_codings}
    scoped_coding_ids = {row["coding"].id for row in scoped_codings}

    relationship_rows: list[dict] = []
    relationship_evidence_rows: list[dict] = []
    if request.include_relationships:
        relationship_rows, relationship_evidence_rows = _collect_relationship_rows(
            db,
            document_ids=document_ids,
            code_ids=code_ids,
            code_path_map=code_path_map,
            max_evidence=max(1, request.max_relationship_evidence),
        )

    co_occurrence_rows = _build_co_occurrence_rows(
        scoped_codings,
        code_path_map=code_path_map,
        relationships=relationship_rows,
        primary_level=request.co_occurrence_level,
    )

    case_attr_names: list[str] = []
    case_attr_rows: list[dict] = []
    if request.include_case_attributes:
        case_attr_names, case_attr_rows = _collect_case_attribute_rows(db, document_ids=document_ids)

    memo_rows: list[dict] = []
    if request.include_memos:
        memo_rows = _collect_memo_rows(
            db,
            document_ids=document_ids,
            code_ids=code_ids,
            excerpt_ids=scoped_excerpt_ids,
            coding_ids=scoped_coding_ids,
            code_path_map=code_path_map,
        )

    generated_at = datetime.now()
    markdown = _render_markdown_report(
        project=project,
        generated_at=generated_at,
        documents=documents,
        codes=codes,
        code_path_map=code_path_map,
        scoped_codings=scoped_codings,
        co_occurrence_rows=co_occurrence_rows,
        case_attr_names=case_attr_names,
        case_attr_rows=case_attr_rows,
        memo_rows=memo_rows,
        relationship_rows=relationship_rows,
        relationship_evidence_rows=relationship_evidence_rows,
        request=request,
    )

    return {
        "project": project,
        "generated_at": generated_at,
        "documents": documents,
        "codes": codes,
        "code_path_map": code_path_map,
        "scoped_codings": scoped_codings,
        "co_occurrence_rows": co_occurrence_rows,
        "case_attr_names": case_attr_names,
        "case_attr_rows": case_attr_rows,
        "memo_rows": memo_rows,
        "relationship_rows": relationship_rows,
        "relationship_evidence_rows": relationship_evidence_rows,
        "markdown": markdown,
    }


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


@router.post("/report/preview", response_model=ReportPreview)
def preview_report(request: ReportRequest, db: Session = Depends(get_db)):
    payload = _build_report_payload(db, request)
    project = payload["project"]
    title = f"Informe — {project.name if project else 'Proyecto'}"
    return ReportPreview(
        title=title,
        generated_at=payload["generated_at"].isoformat(),
        summary={
            "documents": len(payload["documents"]),
            "codes": len(payload["codes"]),
            "codings": len(payload["scoped_codings"]),
            "memos": len(payload["memo_rows"]),
            "relationships": len(payload["relationship_rows"]),
            "co_occurrences": len(payload["co_occurrence_rows"]),
        },
        markdown=payload["markdown"],
        csv_files=[
            "documentos.csv",
            "codigos.csv",
            "codificaciones.csv",
            "coocurrencias.csv",
        ]
        + (["atributos_caso.csv"] if request.include_case_attributes else [])
        + (["memos.csv"] if request.include_memos else [])
        + (["relaciones_codigos.csv", "fragmentos_relaciones.csv"] if request.include_relationships else []),
    )


@router.post("/report/markdown")
def export_report_markdown(request: ReportRequest, db: Session = Depends(get_db)):
    payload = _build_report_payload(db, request)
    project = payload["project"]
    filename = f"{_sanitize_filename(project.name if project else 'proyecto')}-informe.md"
    return Response(
        content=payload["markdown"],
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/report/csv-bundle")
def export_report_csv_bundle(request: ReportRequest, db: Session = Depends(get_db)):
    payload = _build_report_payload(db, request)
    project = payload["project"]
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        _write_csv(
            zip_file,
            "documentos.csv",
            ["document_id", "document_name", "doc_type", "page_count", "created_at"],
            [
                [document.id, document.name, document.doc_type, document.page_count or "", document.created_at.isoformat()]
                for document in payload["documents"]
            ],
        )
        _write_csv(
            zip_file,
            "codigos.csv",
            ["code_id", "code_name", "code_path", "parent_id", "description", "color", "sort_order"],
            [
                [
                    code.id,
                    code.name,
                    payload["code_path_map"].get(code.id, code.name),
                    code.parent_id or "",
                    code.description or "",
                    code.color,
                    code.sort_order,
                ]
                for code in payload["codes"]
            ],
        )
        _write_csv(
            zip_file,
            "codificaciones.csv",
            [
                "coding_id",
                "excerpt_id",
                "document_id",
                "document_name",
                "code_id",
                "code_name",
                "code_path",
                "page_number",
                "start_pos",
                "end_pos",
                "source",
                "excerpt_text",
                "created_by",
                "created_at",
            ],
            [
                [
                    row["coding"].id,
                    row["excerpt"].id,
                    row["document"].id,
                    row["document"].name,
                    row["code"].id,
                    row["code"].name,
                    payload["code_path_map"].get(row["code"].id, row["code"].name),
                    row["excerpt"].page_number or "",
                    row["excerpt"].start_pos,
                    row["excerpt"].end_pos,
                    _format_excerpt_source(row["excerpt"], row["document"]),
                    row["excerpt"].text or "",
                    row["coding"].created_by,
                    row["coding"].created_at.isoformat(),
                ]
                for row in payload["scoped_codings"]
            ],
        )
        _write_csv(
            zip_file,
            "coocurrencias.csv",
            [
                "code_a_id",
                "code_a_name",
                "code_a_path",
                "code_b_id",
                "code_b_name",
                "code_b_path",
                "excerpt_count",
                "document_count",
                "relationship_labels",
            ],
            [
                [
                    row["code_a_id"],
                    row["code_a_name"],
                    row["code_a_path"],
                    row["code_b_id"],
                    row["code_b_name"],
                    row["code_b_path"],
                    row["excerpt_count"],
                    row["document_count"],
                    row["relationship_labels"],
                ]
                for row in payload["co_occurrence_rows"]
            ],
        )

        if request.include_case_attributes:
            _write_csv(
                zip_file,
                "atributos_caso.csv",
                ["document_id", "document_name", *payload["case_attr_names"]],
                [
                    [row["document_id"], row["document_name"], *[row.get(attr_name, "") for attr_name in payload["case_attr_names"]]]
                    for row in payload["case_attr_rows"]
                ],
            )

        if request.include_memos:
            _write_csv(
                zip_file,
                "memos.csv",
                ["memo_id", "title", "memo_type", "links", "content", "created_at", "updated_at"],
                [
                    [
                        row["memo_id"],
                        row["title"],
                        row["memo_type"],
                        " | ".join(row["links"]),
                        row["content"],
                        row["created_at"],
                        row["updated_at"],
                    ]
                    for row in payload["memo_rows"]
                ],
            )

        if request.include_relationships:
            _write_csv(
                zip_file,
                "relaciones_codigos.csv",
                [
                    "relationship_id",
                    "source_code_id",
                    "source_code_path",
                    "target_code_id",
                    "target_code_path",
                    "rel_type",
                    "rel_label_display",
                    "created_at",
                ],
                [
                    [
                        row["relationship_id"],
                        row["source_code_id"],
                        row["source_code_path"],
                        row["target_code_id"],
                        row["target_code_path"],
                        row["rel_type"],
                        row["rel_label_display"],
                        row["created_at"],
                    ]
                    for row in payload["relationship_rows"]
                ],
            )
            _write_csv(
                zip_file,
                "fragmentos_relaciones.csv",
                [
                    "relationship_id",
                    "source_code_path",
                    "target_code_path",
                    "rel_label_display",
                    "evidence_mode",
                    "excerpt_role",
                    "document_id",
                    "document_name",
                    "excerpt_id",
                    "page_number",
                    "start_pos",
                    "end_pos",
                    "source",
                    "excerpt_text",
                ],
                [
                    [
                        row["relationship_id"],
                        row["source_code_path"],
                        row["target_code_path"],
                        row["rel_label_display"],
                        row["evidence_mode"],
                        row["excerpt_role"],
                        row["document_id"],
                        row["document_name"],
                        row["excerpt_id"],
                        row["page_number"] or "",
                        row["start_pos"],
                        row["end_pos"],
                        row["source"],
                        row["excerpt_text"],
                    ]
                    for row in payload["relationship_evidence_rows"]
                ],
            )

    buffer.seek(0)
    filename = f"{_sanitize_filename(project.name if project else 'proyecto')}-informe-csv.zip"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
