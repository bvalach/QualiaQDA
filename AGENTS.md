# AGENTS.md - QualiaQDA

This file gives repository-specific guidance for coding agents and contributors working in this project.

## Project scope

QualiaQDA is a local-first qualitative data analysis application for thematic analysis and mixed methods workflows.

Primary stack:

- Frontend: React 18 + TypeScript + Vite
- Backend: FastAPI + SQLAlchemy + SQLite
- Optional local AI integrations: Claude CLI, Codex CLI, Ollama
- Optional local transcription: `faster-whisper`

The codebase should be treated as a local application and development project, not as an internet-hardened SaaS backend unless the user explicitly asks for that work.

## Non-negotiable data rules

Preserve the semantic separation between these three layers:

1. Source data
2. Human annotations
3. Model artifacts

Pending AI suggestions must remain separate from accepted human annotations until an explicit acceptance step promotes them.

## Core domain rules

- Excerpts are first-class entities.
- A single excerpt may have multiple code assignments.
- Do not duplicate excerpt text inside codings when the excerpt entity already holds the anchor.
- Preserve robust anchoring where possible: offsets, selected text, surrounding context, and document hash.
- Maintain project portability: one `.qualia` SQLite-backed project per research project.

## What to optimize for

- Correctness and traceability over novelty
- Stable local workflows over cloud dependencies
- Clear analytical provenance over convenience shortcuts
- Minimal schema contamination between human work and AI-generated artifacts

## Repository structure

```text
backend/
  qualia/
    api/        FastAPI routes
    core/       settings and database helpers
    models/     SQLAlchemy models
    services/   LLM, transcription, and support services
frontend/
  src/
    components/
    contexts/
    types/
qualia.sh       local startup helper
```

## Coding conventions

### Frontend

- TypeScript strict mode
- Functional React components with hooks
- Follow the existing component and context structure
- Keep UI text in Spanish unless the surrounding UI already uses English

### Backend

- Python 3.11+
- Type hints expected
- Pydantic v2 models for validation
- SQLAlchemy 2 style patterns where already used
- Prefer small, explicit API handlers and service helpers

### General

- Code identifiers in English
- UI copy in Spanish
- IDs as UUID strings
- Dates serialized in ISO 8601 for API responses
- Colors represented as `#RRGGBB`

## Local development assumptions

Reasonable defaults in this repo:

- Backend port: `8001`
- Frontend port: `5173`
- Local project directory: `~/.qualia/projects`

Keep these configurable. Do not introduce hardcoded personal directories or machine-specific paths.

## Public repo hygiene

Never commit:

- `.env` files
- `.qualia` project files
- SQLite databases with local data
- ChromaDB runtime data
- exports, temp files, or local caches
- credentials, tokens, or research material not meant for publication

If you add new tooling that creates local state, update `.gitignore`.

## AI integration guidance

- AI is an assistive layer, not the source of truth.
- Suggestions should include enough metadata for review and traceability.
- Avoid designing flows that silently create accepted annotations from model output.
- Prefer graceful degradation when local AI tooling is missing.

## Change guidance

When making changes:

- Preserve excerpt-centric modeling.
- Preserve the human-vs-AI review boundary.
- Prefer incremental changes over schema churn.
- Avoid introducing product claims in docs that the implementation does not support.
- If a feature is local-only or optional, say so explicitly in docs.

## Documentation guidance

For public-facing documentation:

- Prefer concise, product-oriented language.
- Avoid personal notes, machine-specific setup details, and internal workflow commentary.
- Keep README focused on what the project is, how to run it, and its current maturity.

## Validation

Before finishing meaningful changes, check at least the relevant subset of:

- backend imports and API wiring
- frontend build or typecheck if frontend files changed
- basic repo hygiene for secrets or generated artifacts

If validation is skipped, say so explicitly.
