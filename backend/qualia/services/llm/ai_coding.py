"""AI-assisted coding service — prompt engineering for qualitative analysis.

Generates structured suggestions by calling Claude/Codex via CLI runner.
Suggestions are stored in ai_suggestions (Layer 3) — never directly as codings.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from qualia.services.llm.cli_runner import run_llm, extract_json_from_response

logger = logging.getLogger(__name__)


@dataclass
class CodeSuggestion:
    """A single code suggestion from the LLM."""
    code_name: str
    code_id: Optional[str]  # None if suggesting a new code
    confidence: float
    rationale: str


def _build_codebook_text(codes: list[dict]) -> str:
    """Format the codebook for the prompt."""
    if not codes:
        return "(No hay codigos definidos todavia)"

    lines = []
    for c in codes:
        desc = f" — {c['description']}" if c.get("description") else ""
        lines.append(f"- [{c['id']}] {c['name']}{desc}")
    return "\n".join(lines)


def _build_suggest_prompt(
    excerpt_text: str,
    codebook: list[dict],
    document_context: Optional[str] = None,
) -> str:
    """Build the prompt for suggesting codes for a specific excerpt."""
    codebook_text = _build_codebook_text(codebook)

    context_section = ""
    if document_context:
        context_section = f"""
CONTEXTO DEL DOCUMENTO (fragmento alrededor del excerpt):
\"\"\"
{document_context[:1500]}
\"\"\"
"""

    return f"""Eres un asistente de investigación cualitativa experto en análisis temático (Braun & Clarke).

Tu tarea: analizar el siguiente EXCERPT (fragmento de texto) y sugerir qué CÓDIGOS del codebook existente aplican. También puedes sugerir códigos nuevos si ninguno existente captura el significado.

CODEBOOK EXISTENTE:
{codebook_text}
{context_section}
EXCERPT A CODIFICAR:
\"\"\"{excerpt_text}\"\"\"

INSTRUCCIONES:
1. Analiza el contenido semántico del excerpt
2. Sugiere entre 1 y 5 códigos que apliquen (preferiblemente del codebook existente)
3. Para cada sugerencia, indica:
   - Si es un código existente: usa su ID exacto
   - Si es nuevo: pon code_id como null y sugiere un nombre descriptivo
   - Confidence: 0.0 a 1.0 (qué tan seguro estás)
   - Rationale: explicación breve de por qué aplica este código

Responde SOLO con un JSON array, sin texto adicional:
[
  {{
    "code_name": "nombre del código",
    "code_id": "uuid-del-codigo-existente o null",
    "confidence": 0.85,
    "rationale": "explicación breve"
  }}
]"""


def _build_autocode_prompt(
    document_text: str,
    codebook: list[dict],
    doc_name: str = "",
) -> str:
    """Build the prompt for auto-coding an entire document."""
    codebook_text = _build_codebook_text(codebook)

    return f"""Eres un asistente de investigación cualitativa experto en análisis temático (Braun & Clarke).

Tu tarea: analizar el siguiente DOCUMENTO completo e identificar fragmentos relevantes que deberían ser codificados. Para cada fragmento, sugiere qué código(s) del codebook aplican.

CODEBOOK EXISTENTE:
{codebook_text}

DOCUMENTO "{doc_name}":
\"\"\"{document_text[:8000]}\"\"\"

INSTRUCCIONES:
1. Identifica fragmentos relevantes para el análisis cualitativo
2. Para cada fragmento, indica:
   - El texto exacto del excerpt (copiado literalmente del documento)
   - Los códigos que aplican
   - Confidence y rationale
3. No codifiques fragmentos triviales (saludos, muletillas, conectores sin contenido)
4. Prefiere usar códigos existentes; sugiere nuevos solo si necesario

Responde SOLO con un JSON array:
[
  {{
    "excerpt_text": "texto exacto del fragmento",
    "suggestions": [
      {{
        "code_name": "nombre del código",
        "code_id": "uuid o null",
        "confidence": 0.85,
        "rationale": "explicación breve"
      }}
    ]
  }}
]"""


def _build_themes_prompt(
    coded_excerpts: list[dict],
    codebook: list[dict],
) -> str:
    """Build the prompt for suggesting emerging themes."""
    codebook_text = _build_codebook_text(codebook)

    excerpts_text = ""
    for i, ex in enumerate(coded_excerpts[:30], 1):
        codes_str = ", ".join(ex.get("code_names", []))
        excerpts_text += f"\n{i}. [{codes_str}]: \"{ex['text'][:200]}\""

    return f"""Eres un asistente de investigación cualitativa experto en análisis temático (Braun & Clarke).

Tu tarea: a partir de los datos codificados, identifica TEMAS EMERGENTES — patrones de significado que atraviesan los datos.

CODEBOOK ACTUAL:
{codebook_text}

EXCERPTS CODIFICADOS:
{excerpts_text}

INSTRUCCIONES:
1. Identifica 2-5 temas emergentes que conecten los códigos y datos
2. Para cada tema, indica:
   - Nombre del tema
   - Descripción (1-2 frases)
   - Qué códigos del codebook se relacionan
   - Evidencia: qué excerpts soportan este tema
3. Los temas deben ser de nivel superior (no repetir códigos individuales)

Responde SOLO con un JSON array:
[
  {{
    "theme_name": "nombre del tema",
    "description": "descripción breve",
    "related_codes": ["nombre_código_1", "nombre_código_2"],
    "evidence_summary": "resumen de la evidencia"
  }}
]"""


async def suggest_codes_for_excerpt(
    excerpt_text: str,
    codebook: list[dict],
    document_context: Optional[str] = None,
    provider: Optional[str] = None,
) -> tuple[list[CodeSuggestion], Optional[str]]:
    """Ask LLM to suggest codes for a specific excerpt."""
    prompt = _build_suggest_prompt(excerpt_text, codebook, document_context)
    result = await run_llm(prompt, provider=provider, timeout=90)

    if not result.success:
        logger.error("LLM call failed: %s", result.error)
        return [], None

    parsed = extract_json_from_response(result.text)
    if not isinstance(parsed, list):
        logger.error("LLM returned non-list: %s", result.text[:200])
        return [], result.model

    suggestions = []
    for item in parsed:
        try:
            suggestions.append(CodeSuggestion(
                code_name=item["code_name"],
                code_id=item.get("code_id"),
                confidence=float(item.get("confidence", 0.5)),
                rationale=item.get("rationale", ""),
            ))
        except (KeyError, ValueError, TypeError) as e:
            logger.warning("Skipping malformed suggestion: %s", e)
            continue

    return suggestions, result.model


async def auto_code_document(
    document_text: str,
    codebook: list[dict],
    doc_name: str = "",
    provider: Optional[str] = None,
) -> tuple[list[dict], Optional[str]]:
    """Ask LLM to auto-code an entire document.

    Returns list of dicts: [{"excerpt_text": ..., "suggestions": [CodeSuggestion, ...]}]
    """
    prompt = _build_autocode_prompt(document_text, codebook, doc_name)
    result = await run_llm(prompt, provider=provider, timeout=180)

    if not result.success:
        logger.error("LLM call failed: %s", result.error)
        return [], None

    parsed = extract_json_from_response(result.text)
    if not isinstance(parsed, list):
        logger.error("LLM returned non-list: %s", result.text[:200])
        return [], result.model

    results = []
    for item in parsed:
        try:
            excerpt_text = item["excerpt_text"]
            suggestions = []
            for s in item.get("suggestions", []):
                suggestions.append(CodeSuggestion(
                    code_name=s["code_name"],
                    code_id=s.get("code_id"),
                    confidence=float(s.get("confidence", 0.5)),
                    rationale=s.get("rationale", ""),
                ))
            if suggestions:
                results.append({
                    "excerpt_text": excerpt_text,
                    "suggestions": suggestions,
                })
        except (KeyError, ValueError, TypeError) as e:
            logger.warning("Skipping malformed auto-code item: %s", e)
            continue

    return results, result.model


async def suggest_themes(
    coded_excerpts: list[dict],
    codebook: list[dict],
    provider: Optional[str] = None,
) -> tuple[list[dict], Optional[str]]:
    """Ask LLM to identify emerging themes from coded data."""
    prompt = _build_themes_prompt(coded_excerpts, codebook)
    result = await run_llm(prompt, provider=provider, timeout=120)

    if not result.success:
        logger.error("LLM call failed: %s", result.error)
        return [], None

    parsed = extract_json_from_response(result.text)
    if not isinstance(parsed, list):
        logger.error("LLM returned non-list: %s", result.text[:200])
        return [], result.model

    return parsed, result.model
