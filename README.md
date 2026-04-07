# QualiaQDA

> **Open-source qualitative data analysis — local-first, AI-assisted, researcher-owned.**

QualiaQDA is a free alternative to QDA built for researchers who want full control over their data, their codebook, and their analytical process. It runs entirely on your machine, works offline, and keeps human judgement at the centre — AI is an assistant, never the analyst.

---

## Why QualiaQDA?

| Pain with existing tools | How QualiaQDA addresses it |
|--------------------------|---------------------------|
| Expensive licences renewed yearly | Free and open-source (MIT) |
| Data lives on vendor servers | Fully local — nothing leaves your machine |
| AI features overwrite your work | AI suggestions stay separate until *you* accept them |
| Locked-in proprietary formats | One portable `.qualia` file per project (SQLite) |
| Heavyweight installers | Run with a single shell command |

---

## Features

### What works today

- **Project management** — create, open, and organise multiple research projects
- **Document import** — text, Markdown, PDF, image, and audio files
- **Hierarchical codebook** — codes with colours, groups, and nested structure
- **Excerpt-based coding** — link text segments to multiple codes without duplicating content
- **Typed memos** — analytical memos with polymorphic links to excerpts, documents, or codes
- **Analysis views** — code networks, co-occurrence matrices, document-by-code tables, timelines
- **AI suggestion workflow** — review and selectively accept AI-generated code suggestions
- **Local audio transcription** — powered by `faster-whisper`, entirely offline

### On the roadmap

- Richer PDF and image annotation
- Extended export formats (REFI-QDA, QDPX)
- Semantic clustering and automated reporting
- Additional visualisation and interoperability features

---

## The core principle

QualiaQDA enforces a strict three-layer model:

```
Layer 1 — Source data        imported documents and files
Layer 2 — Human annotations  excerpts, codings, memos, tags, relationships
Layer 3 — Model artifacts    AI suggestions pending review
```

**Layers never mix silently.** Pending AI output is never treated as accepted analysis. Every suggestion requires an explicit human decision before it becomes part of your codebook.

---

## Quick start

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | bundled with Node |

Optional (all local, none required):

- [`claude`](https://claude.ai/code) CLI — for Claude-powered coding suggestions
- [`codex`](https://github.com/openai/codex) CLI — alternative LLM assistant
- [Ollama](https://ollama.com) — run any local model
- `faster-whisper` — offline audio transcription

### One command

```bash
./qualia.sh
```

Opens the backend on `http://localhost:8001` and the frontend on `http://localhost:5173`.

### Manual setup

**Backend**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn qualia.main:app --reload --port 8001
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

---

## Configuration

The backend reads environment variables with the `QUALIA_` prefix. All settings have sensible defaults for local use.

| Variable | Purpose |
|----------|---------|
| `QUALIA_PORT` | Backend port (default `8001`) |
| `QUALIA_DATA_DIR` | Project storage directory (default `~/.qualia/projects`) |
| `QUALIA_CORS_ORIGINS` | Allowed frontend origins |
| `QUALIA_CLAUDE_CODE_CLI_PATH` | Path to the `claude` CLI binary |
| `QUALIA_CODEX_CLI_PATH` | Path to the `codex` CLI binary |
| `QUALIA_OLLAMA_URL` | Ollama server URL |
| `QUALIA_OLLAMA_CHAT_MODEL` | Ollama model name |

---

## Architecture

```text
frontend/   React 18 + TypeScript + Vite — UI and application state
backend/    FastAPI + SQLAlchemy + SQLite — API, models, services
qualia.sh   One-command local launcher
```

Key backend directories:

```text
backend/qualia/api/        HTTP endpoints
backend/qualia/models/     SQLAlchemy data models
backend/qualia/services/   LLM and transcription helpers
backend/qualia/core/       configuration and database setup
```

---

## Status

QualiaQDA is a working research prototype and local development project. It is not packaged as a hardened internet-facing service. It is used actively for qualitative research and is being developed incrementally.

Issues and feedback are welcome.
 
---

## Licence

MIT — see [LICENSE](LICENSE).
