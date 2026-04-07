# QualiaQDA

QualiaQDA is an open-source qualitative data analysis tool focused on thematic analysis and mixed methods research. It combines a local-first workflow with optional AI assistance for coding suggestions, semantic search, and audio transcription.

The project is designed around a simple rule: source material, human annotations, and model suggestions must remain clearly separated.

## Status

This repository is usable as a local development project and research prototype.

- Frontend: React 18 + TypeScript + Vite
- Backend: FastAPI + SQLAlchemy + SQLite
- Project format: one `.qualia` file per project
- Optional AI: Claude CLI, Codex CLI, Ollama
- Optional audio transcription: `faster-whisper`

The current codebase is intended for local use and development. It is not presented as a hardened internet-facing deployment.

## Core ideas

- Excerpts are first-class entities and can be linked to multiple codes without duplicating text.
- Human annotations are the source of truth for analysis.
- AI suggestions stay separate until explicitly accepted.
- Projects remain portable through a single SQLite-backed `.qualia` file plus associated local assets.

## Features

### Implemented

- Project create/open/delete
- Document import for text, Markdown, PDF, image, and audio files
- Hierarchical codebook with colors and groups
- Excerpt-based coding with overlapping codes
- Typed memos with polymorphic links
- CSV export for codebook, codings, and memos
- Analysis views such as code networks, co-occurrence, document-by-code matrices, and timelines
- AI suggestion review flow
- Local audio transcription workflow

### Planned or evolving

- Deeper PDF and image annotation workflows
- Richer export formats
- More advanced semantic clustering and reporting
- Additional interoperability and visualization features

## Architecture

```text
frontend/   React application and UI state
backend/    FastAPI app, SQLAlchemy models, services, API routes
qualia.sh   Local startup helper for backend + frontend
```

Key backend areas:

- `backend/qualia/api/`: HTTP endpoints
- `backend/qualia/models/`: SQLAlchemy models
- `backend/qualia/services/`: LLM and transcription helpers
- `backend/qualia/core/`: configuration and database plumbing

## Data model

QualiaQDA follows a three-layer model:

1. Source data: imported documents and files.
2. Human annotations: excerpts, codings, memos, tags, relationships.
3. Model artifacts: suggestions and derived AI outputs pending review.

That separation is deliberate. Pending AI output should never be treated as accepted analysis.

## Quick start

### Prerequisites

- Python 3.11+
- Node.js 18+
- `npm`

Optional integrations:

- `claude` CLI
- `codex` CLI
- Ollama with a local model
- `faster-whisper`

### One-command local startup

```bash
./qualia.sh
```

This launches the backend on port `8001` and a preview server for the frontend on port `5173`.

### Manual startup

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn qualia.main:app --reload --port 8001
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Configuration

The backend reads configuration from environment variables with the `QUALIA_` prefix. Relevant settings include:

- `QUALIA_PORT`
- `QUALIA_DATA_DIR`
- `QUALIA_CORS_ORIGINS`
- `QUALIA_CLAUDE_CODE_CLI_PATH`
- `QUALIA_CODEX_CLI_PATH`
- `QUALIA_OLLAMA_URL`
- `QUALIA_OLLAMA_CHAT_MODEL`

By default, local project files are stored under `~/.qualia/projects`.

## Repository hygiene

The repository is set up to ignore local project databases, local env files, generated exports, runtime artifacts, and zip files. Do not commit:

- `.env` files
- `.qualia` project files
- local SQLite databases
- ChromaDB data
- exports or temporary runtime artifacts

## Notes for contributors

- Keep the three-layer data separation intact.
- Avoid hardcoding machine-specific paths.
- Treat local-only development assumptions as local-only.
- Do not commit real research data, credentials, or generated local state.

## License

MIT. See [LICENSE](LICENSE).
