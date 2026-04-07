# QualiaQDA

Herramienta de analisis cualitativo asistido por IA para investigacion. Reemplazo open-source de MAXQDA/NVivo, enfocado en analisis tematico (Braun & Clarke) y metodos mixtos.

## Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: FastAPI (Python) + SQLAlchemy + SQLite
- **IA**: Claude Code CLI (auto-codificacion) + Codex CLI (fallback)
- **Audio**: faster-whisper (transcripcion local)
- **Visualizaciones**: D3.js (redes, heatmaps, timelines)

## Arranque rapido

```bash
# Todo de una vez:
./qualia.sh

# → Frontend en http://localhost:5173
# → Backend  en http://localhost:8001
# → API docs en http://localhost:8001/docs
```

### Virtual environment

El venv vive en `/tmp/qualia_venv/` (fuera del proyecto). El script `qualia.sh` lo crea automaticamente si no existe.

```bash
# Instalar dependencias manualmente:
/tmp/qualia_venv/bin/pip install -r backend/requirements.txt

# Instalar Whisper (para transcripcion de audio):
/tmp/qualia_venv/bin/pip install faster-whisper
```

### Frontend (si no usas qualia.sh)

```bash
cd frontend
npm install
npm run dev
```

## Estructura

```
backend/
  qualia/
    api/           Endpoints FastAPI (projects, documents, codes, coding, memos, ai, transcription, analysis, export)
    models/        SQLAlchemy models (15 modelos, 3 capas semanticas)
    services/      LLM CLI runner, Whisper service
    core/          Config, database session factory
frontend/
  src/
    components/    React components (DocumentViewer, CodeBook, AiReviewPanel, AudioPlayer, AnalysisPanel, ...)
    contexts/      ProjectContext (estado global)
    api.ts         Cliente HTTP tipado
    types/         TypeScript interfaces
qualia.sh          Script de arranque (backend + frontend)
```

## Funcionalidades

### Fase 1 — Core QDA (completa)
- Proyectos `.qualia` (crear/abrir/eliminar)
- Documentos: txt, md, pdf (paginado), imagen, audio
- Codigos jerarquicos con colores + grupos + drag-drop
- Codificacion basada en excerpts (entidad de primera clase)
- In-vivo coding, highlighting multicolor, codigos superpuestos
- Memos tipados (7 tipos) con enlaces polimorficos
- Exportacion CSV (codebook, codings, memos)

### Fase 2 — Analisis y visualizaciones (completa)
- Red de codigos (D3 force-directed graph)
- Co-ocurrencia de codigos (heatmap)
- Matriz documentos x codigos (heatmap)
- Linea temporal de codificaciones y memos
- Red de evidencias (bipartito codigos-documentos)

### Fase 3 — IA y audio (completa)
- Auto-codificacion con Claude Code CLI
- Panel de revision de sugerencias IA (aceptar/rechazar)
- Separacion estricta: sugerencias IA en capa 3 hasta aceptacion
- Transcripcion de audio con Whisper (local)
- Reproductor sincronizado con timestamps

## Arquitectura de datos (3 capas)

1. **Capa 1 — Datos fuente**: Documentos importados (inmutables)
2. **Capa 2 — Anotaciones humanas**: Excerpts, codigos, codings, memos
3. **Capa 3 — Artefactos IA**: Sugerencias pendientes de revision

Las sugerencias IA nunca se mezclan con anotaciones humanas hasta que el investigador las acepta explicitamente.

## Notas

- Un proyecto = un archivo `.qualia` (SQLite renombrado)
- Los `.qualia` se guardan en `~/.qualia/projects/`
- La IA usa `claude -p` (CLI print mode) — requiere estar logueado con cuenta Max
- Whisper corre local (CPU por defecto, configurable a CUDA/MPS)
