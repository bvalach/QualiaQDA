# CLAUDE.md — QualiaQDA

> Qualitative Data Analysis tool — open-source, AI-augmented, para investigación con análisis temático y métodos mixtos.

## Visión

 Enfocado en **análisis temático** (Braun & Clarke) y **métodos mixtos**. Con IA integrada (Claude + Codex) para asistencia en codificación, y procesamiento local de audio (Whisper) y embeddings semánticos (nomic-embed-text-v2-moe).

---

## Stack técnico

| Capa | Tecnología | Notas |
|------|-----------|-------|
| **Frontend** | React 18 + TypeScript + Vite | Consistente con DataChat |
| **Backend** | FastAPI (Python 3.11+) | API REST, puerto 8001 |
| **Base de datos proyecto** | SQLite (vía SQLAlchemy) | Un archivo `.qualia` por proyecto |
| **Embeddings store** | ChromaDB (persistent) | Búsqueda semántica de segmentos |
| **LLM primario** | Claude (OAuth via Anthropic SDK) | Auto-codificación, sugerencias temáticas |
| **LLM fallback** | Codex CLI + Claude Code CLI | Cuando Claude API no disponible |
| **Transcripción** | Whisper (local, `faster-whisper`) | Audio → texto con timestamps. **Pendiente instalar** |
| **Embeddings** | Nomic Embed v2 MoE (Ollama local, `nomic-embed-text-v2-moe`) | Similitud semántica entre segmentos. **Instalado** |
| **Visualización grafos** | D3.js o vis-network | Redes de códigos, co-ocurrencias |
| **Export** | CSV, XLSX (exceljs), PDF (jspdf/pdfmake) | Todo exportable |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React/TS/Vite)                │
│                                                              │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │  LEFT PANEL   │  │          RIGHT PANEL                  │ │
│  │              │  │                                        │ │
│  │  Codebook    │  │  Document Viewer                      │ │
│  │  (tree view) │  │  ┌──────────────────────────────────┐ │ │
│  │  - Códigos   │  │  │ Tabs: Doc1 | Doc2 | Audio1 | ... │ │ │
│  │  - Subcódigos│  │  ├──────────────────────────────────┤ │ │
│  │  - Grupos    │  │  │                                  │ │ │
│  │  - Colores   │  │  │  Texto con highlighting          │ │ │
│  │              │  │  │  multicolor por código            │ │ │
│  │  ──────────  │  │  │                                  │ │ │
│  │  Memos       │  │  │  Margen: etiquetas de códigos    │ │ │
│  │  - Por código│  │  │                                  │ │ │
│  │  - Por doc   │  │  │  [Paginación para docs largos]   │ │ │
│  │  - Por segm. │  │  │                                  │ │ │
│  │  - Libres    │  │  └──────────────────────────────────┘ │ │
│  │              │  │                                        │ │
│  │  ──────────  │  │  Toolbar: buscar | stats | AI assist  │ │
│  │  Queries     │  │                                        │ │
│  └──────────────┘  └──────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  BOTTOM PANEL (collapsible)                               ││
│  │  Code Network / Co-occurrence Matrix / Word Freq          ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
         ↕ (axios HTTP)
┌─────────────────────────────────────────────────────────────┐
│                  BACKEND (FastAPI / Python)                   │
│                                                              │
│  ├─ api/                                                     │
│  │  ├─ projects.py        (CRUD proyectos)                   │
│  │  ├─ documents.py       (upload, parse, paginar, hash)     │
│  │  ├─ excerpts.py        (CRUD excerpts con anclaje)        │
│  │  ├─ codes.py           (CRUD códigos, jerarquía, colores) │
│  │  ├─ coding.py          (asignar/quitar códigos a excerpts)│
│  │  ├─ memos.py           (CRUD memos, entity_links)        │
│  │  ├─ tags.py            (CRUD tags, entity_tags)           │
│  │  ├─ queries.py         (text search, coding queries)      │
│  │  ├─ analysis.py        (matrices, co-ocurrencia, redes)   │
│  │  ├─ ai.py              (ai_suggestions, review workflow)  │
│  │  ├─ transcription.py   (Whisper endpoints)                │
│  │  ├─ embeddings.py      (Nomic/ChromaDB semantic search)   │
│  │  └─ export.py          (CSV, XLSX, PDF)                   │
│  │                                                           │
│  ├─ models/               (SQLAlchemy models)                │
│  │  ├─ project.py                                            │
│  │  ├─ document.py                                           │
│  │  ├─ excerpt.py         (fragmentos anclados, 1ª clase)    │
│  │  ├─ code.py                                               │
│  │  ├─ coding.py          (excerpt ↔ code assignments)       │
│  │  ├─ memo.py            (tipados + entity_links)           │
│  │  ├─ relationship.py    (code ↔ code relations, grafo)     │
│  │  ├─ tag.py             (tags + entity_tags transversales) │
│  │  ├─ ai_suggestion.py   (capa IA separada)                 │
│  │  └─ snapshot.py        (versionado del proyecto)          │
│  │                                                           │
│  ├─ services/                                                │
│  │  ├─ llm/               (Claude API + Codex fallback)      │
│  │  ├─ whisper.py         (transcription service)            │
│  │  ├─ embeddings.py      (Nomic + ChromaDB)                 │
│  │  └─ text_analysis.py   (word freq, stopwords, stats)      │
│  │                                                           │
│  └─ core/                                                    │
│     ├─ config.py          (settings, env vars)               │
│     ├─ database.py        (SQLite session factory)           │
│     └─ pagination.py      (document pagination logic)        │
└─────────────────────────────────────────────────────────────┘
```

---

## Principios de arquitectura de datos

### Tres capas semánticas (separación obligatoria)

```
┌─────────────────────────────────────────────────────────┐
│  CAPA 1 — DATOS FUENTE                                   │
│  Documentos importados, binarios, versiones.              │
│  Inmutables una vez importados (salvo reimportación).     │
│  Nunca se mezclan con anotaciones ni artefactos IA.      │
├─────────────────────────────────────────────────────────┤
│  CAPA 2 — ANOTACIONES HUMANAS                            │
│  Excerpts, códigos, codings, memos, relaciones, tags.    │
│  Creadas y revisadas por el investigador.                 │
│  Fuente de verdad para el análisis cualitativo.           │
├─────────────────────────────────────────────────────────┤
│  CAPA 3 — ARTEFACTOS DE MODELO (IA)                      │
│  Sugerencias de codificación, temas emergentes, chat.     │
│  Separadas de las anotaciones humanas hasta aceptación.   │
│  Al aceptar → se promueven a Capa 2 (con trazabilidad).  │
└─────────────────────────────────────────────────────────┘
```

**Regla fundamental**: si mezclas "código humano" con "sugerencia de Claude" en la misma capa semántica, contaminarás el análisis. Las sugerencias IA viven en `ai_suggestions` hasta que el investigador las acepta explícitamente; solo entonces se crean codings reales (con `created_by = 'ai_accepted'` para trazabilidad).

### Excerpt como entidad de primera clase

El **Excerpt** (fragmento de texto seleccionado) es la unidad atómica de análisis. No es un atributo del coding — es una entidad independiente que:
- Puede tener múltiples códigos asignados (codings)
- Puede tener memos vinculados
- Puede tener tags analíticos
- Puede ser reutilizado sin duplicar texto

### Anclaje híbrido (robustez ante cambios)

No confiar solo en posiciones lineales (`start_pos`/`end_pos`). El anclaje incluye:
- **Offsets** de carácter (primary)
- **Texto exacto** seleccionado (snapshot)
- **Contexto** (~50 chars antes y después)
- **Huella del documento** (`doc_hash`) al momento de crear el excerpt
- **PDF extras**: `page_number` + bounding box opcional

Esto permite rehidratar codificaciones incluso si el documento cambia ligeramente entre reimportaciones.

---

## Modelo de datos (SQLite)

### Entidades principales

| Entidad | Capa | Rol |
|---------|------|-----|
| `projects` | — | Contenedor raíz (1 proyecto = 1 archivo `.qualia`) |
| `documents` | Fuente | Documentos importados (texto, PDF, imagen, audio) |
| `excerpts` | Anotación | Fragmentos de texto anclados — unidad atómica de análisis |
| `codes` | Anotación | Códigos jerárquicos con colores |
| `codings` | Anotación | Asignación de código a excerpt |
| `memos` | Anotación | Notas analíticas tipadas con enlaces múltiples |
| `entity_links` | Anotación | Enlaces polimórficos entre entidades |
| `code_relationships` | Anotación | Relaciones semánticas entre códigos (grafo) |
| `code_groups` | Anotación | Agrupación ortogonal a la jerarquía |
| `tags` / `entity_tags` | Anotación | Etiquetas analíticas transversales |
| `case_attributes` | Anotación | Atributos de caso para mixed methods |
| `ai_suggestions` | IA | Sugerencias de modelo pendientes de revisión |
| `project_snapshots` | Historial | Versionado ligero del estado del proyecto |
| `embedding_segments` | IA | Tracking de embeddings en ChromaDB |

### Schema SQL

```sql
-- ═══════════════════════════════════════════════════════
-- CAPA 1: DATOS FUENTE
-- ═══════════════════════════════════════════════════════

CREATE TABLE projects (
    id          TEXT PRIMARY KEY,  -- UUID v4
    name        TEXT NOT NULL,
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE documents (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    name        TEXT NOT NULL,
    doc_type    TEXT NOT NULL,      -- 'text', 'markdown', 'pdf', 'image', 'audio'
    content     TEXT,               -- texto plano / markdown (NULL para binarios)
    file_path   TEXT,               -- ruta al archivo binario
    page_count  INTEGER,            -- para PDFs multipágina
    doc_hash    TEXT,               -- SHA-256 del contenido/archivo para anclaje
    metadata    JSON,               -- duración audio, dimensiones imagen, etc.
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════
-- CAPA 2: ANOTACIONES HUMANAS
-- ═══════════════════════════════════════════════════════

-- Excerpts: fragmentos de texto anclados (entidad de primera clase)
CREATE TABLE excerpts (
    id              TEXT PRIMARY KEY,
    document_id     TEXT NOT NULL REFERENCES documents(id),
    start_pos       INTEGER NOT NULL,       -- offset carácter inicio
    end_pos         INTEGER NOT NULL,       -- offset carácter fin
    page_number     INTEGER,                -- para PDFs
    text            TEXT NOT NULL,           -- texto seleccionado (snapshot)
    context_before  TEXT,                   -- ~50 chars antes (rehidratación)
    context_after   TEXT,                   -- ~50 chars después
    doc_hash        TEXT,                   -- hash del documento al crear
    -- PDF bounding box (opcional, para regiones visuales)
    bbox_x          REAL,
    bbox_y          REAL,
    bbox_w          REAL,
    bbox_h          REAL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_pos >= 0),
    CHECK (start_pos < end_pos)
);

-- Códigos (jerárquicos — de árbol a grafo via code_relationships)
CREATE TABLE codes (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    parent_id   TEXT REFERENCES codes(id),  -- NULL = raíz
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT NOT NULL DEFAULT '#FFD700',  -- hex color
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Codificaciones: asignación humana de código a excerpt
CREATE TABLE codings (
    id          TEXT PRIMARY KEY,
    excerpt_id  TEXT NOT NULL REFERENCES excerpts(id),
    code_id     TEXT NOT NULL REFERENCES codes(id),
    created_by  TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'ai_accepted'
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Nota: codings ya no tiene start_pos/end_pos/text/page_number;
-- esos datos viven en el excerpt referenciado.

-- Memos: notas analíticas con tipos enriquecidos
CREATE TABLE memos (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    title       TEXT,
    content     TEXT NOT NULL,
    memo_type   TEXT NOT NULL DEFAULT 'free',
    -- Tipos: 'theoretical', 'methodological', 'case', 'code',
    --        'reflective', 'synthesis', 'free'
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Los vínculos del memo se gestionan en entity_links (no columnas FK directas).

-- Enlaces polimórficos: conectan memos con cualquier entidad (incluyendo otros memos)
CREATE TABLE entity_links (
    id          TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,      -- 'memo' (extensible a otros tipos en el futuro)
    source_id   TEXT NOT NULL,
    target_type TEXT NOT NULL,      -- 'document', 'excerpt', 'code', 'coding', 'memo'
    target_id   TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_id, target_type, target_id)
);

-- Relaciones semánticas entre códigos (grafo dirigido)
CREATE TABLE code_relationships (
    id               TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL REFERENCES projects(id),
    source_code_id   TEXT NOT NULL REFERENCES codes(id),
    target_code_id   TEXT NOT NULL REFERENCES codes(id),
    rel_type         TEXT NOT NULL,
    -- Tipos predefinidos:
    --   'causa_de'          A causa B
    --   'conduce_a'         A conduce a B
    --   'contradice'        A contradice B
    --   'co_ocurre_con'     A co-ocurre con B
    --   'ejemplo_de'        A es ejemplo de B
    --   'condicion_para'    A es condición para B
    --   'parte_de'          A es parte de B
    --   'custom'            relación libre (usar label)
    label            TEXT,          -- etiqueta para 'custom' o anotación
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Grupos de códigos (agrupación ortogonal a la jerarquía)
CREATE TABLE code_groups (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT
);

CREATE TABLE code_group_members (
    code_group_id TEXT REFERENCES code_groups(id),
    code_id       TEXT REFERENCES codes(id),
    PRIMARY KEY (code_group_id, code_id)
);

-- Tags analíticos transversales (pueden etiquetar cualquier entidad)
CREATE TABLE tags (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    name        TEXT NOT NULL,
    color       TEXT,
    tag_type    TEXT DEFAULT 'analytical'
    -- Tipos: 'analytical', 'methodological', 'status', 'custom'
);

CREATE TABLE entity_tags (
    tag_id      TEXT NOT NULL REFERENCES tags(id),
    entity_type TEXT NOT NULL,  -- 'document', 'excerpt', 'code', 'coding', 'memo'
    entity_id   TEXT NOT NULL,
    PRIMARY KEY (tag_id, entity_type, entity_id)
);

-- Atributos de caso (para mixed methods)
CREATE TABLE case_attributes (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    document_id TEXT NOT NULL REFERENCES documents(id),
    attr_name   TEXT NOT NULL,
    attr_value  TEXT,
    attr_type   TEXT DEFAULT 'text'  -- 'text', 'number', 'date', 'boolean'
);

-- ═══════════════════════════════════════════════════════
-- CAPA 3: ARTEFACTOS DE MODELO (IA)
-- ═══════════════════════════════════════════════════════

-- Sugerencias de IA (separadas de codings humanos)
CREATE TABLE ai_suggestions (
    id                  TEXT PRIMARY KEY,
    excerpt_id          TEXT NOT NULL REFERENCES excerpts(id),
    code_id             TEXT REFERENCES codes(id),       -- NULL si sugiere código nuevo
    suggested_code_name TEXT,                             -- nombre si code_id es NULL
    confidence          REAL,                             -- 0.0–1.0
    model_name          TEXT NOT NULL,                    -- 'claude-sonnet-4-5', 'codex-cli', etc.
    rationale           TEXT,                             -- explicación del modelo
    status              TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'accepted', 'rejected'
    reviewed_at         DATETIME,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Al aceptar una sugerencia: se crea un coding real con created_by='ai_accepted'
-- y se actualiza status='accepted' + reviewed_at.

-- ═══════════════════════════════════════════════════════
-- HISTORIAL Y VERSIONADO
-- ═══════════════════════════════════════════════════════

-- Snapshots del proyecto (versionado ligero)
CREATE TABLE project_snapshots (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id),
    label           TEXT NOT NULL,      -- 'v1', 'pre-merge', 'before-AI-run', etc.
    description     TEXT,
    snapshot_data   TEXT,               -- JSON serializado del estado
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════
-- BÚSQUEDA SEMÁNTICA
-- ═══════════════════════════════════════════════════════

-- Embeddings tracking (ChromaDB almacena los vectores)
CREATE TABLE embedding_segments (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    chunk_text  TEXT NOT NULL,
    start_pos   INTEGER,
    end_pos     INTEGER,
    chromadb_id TEXT NOT NULL  -- referencia al ID en ChromaDB
);
```

### Diagrama de relaciones

```
projects ──1:N──→ documents ──1:N──→ excerpts ──1:N──→ codings ──N:1──→ codes
    │                                     │                                 │
    │                                     │                                 ├──→ code_relationships (grafo)
    │                                     │                                 ├──→ code_groups (ortogonal)
    │                                     │                                 │
    │                                     ├──1:N──→ ai_suggestions          │
    │                                     │                                 │
    ├──1:N──→ memos ←──── entity_links ────→ {document, excerpt, code,     │
    │                                          coding, memo}               │
    │                                                                       │
    ├──1:N──→ tags ←──── entity_tags ──────→ {document, excerpt, code,     │
    │                                          coding, memo}               │
    │                                                                       │
    ├──1:N──→ case_attributes ──→ documents                                │
    └──1:N──→ project_snapshots                                            │
```

### Cambios clave respecto al schema anterior

| Antes | Ahora | Por qué |
|-------|-------|---------|
| `codings` embebía `start_pos`, `end_pos`, `text`, `page_number` | `excerpts` como entidad propia; `codings` referencia excerpt | Un excerpt puede tener múltiples códigos sin duplicar datos |
| `codings.created_by = 'ai'` mezclado con humanos | `ai_suggestions` tabla separada; codings solo humanos o aceptados | Evita contaminar análisis con sugerencias no revisadas |
| `memos` con 3 columnas FK (`linked_code_id`, etc.) | `entity_links` polimórfico | Un memo puede enlazar a múltiples entidades + memo↔memo |
| 4 tipos de memo (free, code, document, segment) | 7 tipos (theoretical, methodological, case, code, reflective, synthesis, free) | Tipología estándar en QDA |
| `code_relationships` con tipos en inglés | Tipos en español (causa_de, conduce_a, etc.) | Coherencia con la UI en español |
| Sin anclaje híbrido | `excerpts` con `context_before/after` + `doc_hash` | Robustez ante reimportaciones |
| Sin tags transversales | `tags` + `entity_tags` polimórfico | Metadatos analíticos sobre cualquier entidad |
| Sin versionado | `project_snapshots` con JSON serializado | Historial ligero del proyecto |
| Sin bounding box para PDF | `excerpts` con `bbox_x/y/w/h` opcionales | Regiones visuales en PDF |
| `documents` sin hash | `documents.doc_hash` SHA-256 | Detectar cambios en reimportación |

---

## Funcionalidades — Prioridad y fases

### Fase 1: Core QDA (MVP)

**F1.1 — Gestión de proyectos**
- Crear/abrir/cerrar proyectos (cada uno = un `.qualia` SQLite)
- Metadata del proyecto (nombre, descripción, fecha)

**F1.2 — Gestión de documentos**
- Importar: `.txt`, `.md`, `.pdf` (multipágina con paginación)
- Visor de texto con scroll y paginación por páginas para PDFs
- Importar imágenes (`.jpg`, `.png`) — visor con zoom
- Lista de documentos en sidebar

**F1.3 — Sistema de códigos**
- CRUD de códigos con colores personalizables (paleta amplia)
- Jerarquía de códigos (parent/child, hasta 5 niveles)
- Grupos de códigos (ortogonales a la jerarquía)
- Drag & drop para reorganizar
- Codebook en panel izquierdo (tree view colapsable)

**F1.4 — Codificación de texto (basada en Excerpts)**
- Seleccionar texto → crea excerpt + asignar código(s)
- Un excerpt puede tener múltiples códigos (sin duplicar datos de texto)
- Highlighting multicolor (cada código = su color)
- Códigos superpuestos (overlapping) permitidos
- Mostrar etiquetas de código en el margen derecho del texto
- In-vivo coding: crear código a partir del texto seleccionado
- Descodificar (quitar código de excerpt)
- Anclaje híbrido: offsets + texto + contexto + doc_hash (robustez ante reimportaciones)

**F1.5 — Memos (tipados con enlaces múltiples)**
- Tipos de memo: teórico, metodológico, de caso, de código, reflexivo, de síntesis, libre
- Enlazar cada memo con: documentos, excerpts, códigos, codings, otros memos (via entity_links)
- Un memo puede tener múltiples enlaces (no limitado a uno)
- Editor rich text básico (markdown)
- Panel de memos en sidebar izquierda (debajo del codebook)
- Búsqueda en memos

**F1.6 — Exportación básica**
- Codebook → CSV
- Codings (segmentos codificados) → CSV
- Memos → CSV / Markdown

### Fase 2: Análisis, consultas y vistas analíticas

**F2.1 — Búsqueda textual**
- Búsqueda por texto libre en documentos
- Búsqueda con regex
- Resultados con contexto (KWIC — Key Word In Context)

**F2.2 — Estadísticas textuales**
- Frecuencia de palabras (con exclusión de stopwords, configurable)
- Word cloud interactiva
- Conteo de caracteres, palabras, frases, párrafos por documento
- Estadísticas por código (frecuencia, coverage %)

**F2.3 — Consultas de codificación**
- Coding query: AND, OR, NOT entre códigos
- Proximity query (códigos cerca en el texto)
- Code frequency tables

**F2.4 — Vistas analíticas (matrices y redes)**

| Vista | Descripción | Fuente de datos |
|-------|-------------|-----------------|
| **Matriz documentos × códigos** | Frecuencia o presencia de cada código por documento. Quantitizing base para mixed methods. | `codings` JOIN `excerpts` JOIN `documents` × `codes` |
| **Matriz códigos × memos** | Qué memos están vinculados a cada código. Mapa de densidad interpretativa. | `entity_links` WHERE target_type='code' + `memos` |
| **Co-ocurrencia de códigos** | Matriz simétrica: cuántas veces dos códigos aparecen en el mismo excerpt o documento (ventana configurable). | `codings` self-join por `excerpt_id` o proximidad |
| **Línea temporal de memos/codificaciones** | Timeline interactiva mostrando cuándo se crearon memos y codings. Refleja el proceso analítico del investigador. | `codings.created_at` + `memos.created_at` |
| **Red de códigos** | Grafo dirigido: nodos = códigos, aristas = `code_relationships` (causa_de, contradice, etc.). Interactivo (D3.js force-directed). | `code_relationships` + `codes` |
| **Red de evidencias por tema** | Grafo bipartito: temas/códigos ↔ excerpts que los soportan. Permite evaluar saturación y densidad evidencial por tema. | `codes` ↔ `codings` ↔ `excerpts` ↔ `documents` |

- Todas las vistas: interactivas (zoom, filtrar, drag), exportables (PNG, CSV, PDF)
- Cross-tab: código × documento matrix + código × atributo de caso

**F2.5 — Mixed methods**
- Atributos de caso por documento (edad, género, rol, etc.)
- Quantitizing: frecuencia de código → variable numérica (via matriz docs × códigos)
- Cross-tab: código × atributo de caso
- Exportación de matrices para análisis estadístico externo (R, SPSS)

### Fase 3: IA y audio

**F3.1 — Transcripción de audio**
- Importar archivos de audio (`.mp3`, `.wav`, `.m4a`)
- Transcribir con Whisper local (`faster-whisper`)
- Resultado: texto con timestamps vinculados al audio
- Reproductor de audio sincronizado con texto
- Codificar transcripciones igual que texto

**F3.2 — Asistencia IA para codificación (Capa 3 separada)**
- Auto-coding: Claude analiza un documento y genera `ai_suggestions` (nunca codings directos)
- Sugerir códigos para un excerpt seleccionado (con confidence score y rationale)
- Sugerir temas emergentes a partir de los datos codificados
- Chat contextual: preguntar sobre los datos ("¿qué patrones ves en el código X?")
- Codex CLI como fallback cuando Claude no disponible
- **Flujo de revisión**: sugerencias en `ai_suggestions` (status: pending) → investigador acepta/rechaza → al aceptar se crea coding real con `created_by='ai_accepted'`
- Panel de revisión IA: lista de sugerencias pendientes con rationale del modelo

**F3.3 — Búsqueda semántica**
- Embeddings de segmentos con Nomic (Ollama local)
- Almacenamiento en ChromaDB
- "Encuentra segmentos similares a este" → búsqueda por similitud
- Clustering semántico de segmentos codificados

### Fase 4: Pulido y avanzado

**F4.1 — Visor de documentos avanzado**
- PDF: renderizado real con pdfjs, anotaciones por página
- Imágenes: regiones codificables (bounding boxes)
- Markdown: renderizado con preview

**F4.2 — Exportación avanzada**
- Proyecto completo → ZIP (SQLite + archivos)
- Reportes: PDF con codebook, estadísticas, red de códigos
- REFI-QDA format (interoperabilidad con MAXQDA/NVivo)
- XLSX con múltiples hojas (codebook, codings, memos, stats)

**F4.3 — Visualizaciones avanzadas**
- Sankey diagram (flujo entre categorías de códigos)
- Treemap de jerarquía de códigos
- Timeline de codificación
- Dashboard resumen del proyecto

---

## Sinergias con DataChat

DataChat (repositorio hermano con stack similar) comparte stack y patrones reutilizables:

| Componente DataChat | Reutilizable en QualiaQDA | Cómo |
|---|---|---|
| Runner pattern (Claude/Codex/Ollama) | Sí — servicios LLM | Adaptar `runners/` para AI coding assistance. Claude por OAuth, no por API key |
| Sandboxed executor | Sí — análisis estadístico | Ejecutar análisis de texto generados por IA |
| FileUpload component | Sí — importar documentos | Adaptar drag-drop para múltiples formatos |
| FastAPI server pattern | Sí — backend base | Misma estructura de endpoints |
| React/TS/Vite setup | Sí — frontend base | Misma configuración base |

**Decisión**: QualiaQDA será un proyecto independiente pero podrá importar/adaptar módulos de DataChat. No integración directa por ahora — son herramientas con UX muy diferente.

---

## Convenciones de código

### Frontend
- TypeScript estricto (`strict: true`)
- Componentes funcionales con hooks
- CSS Modules (`.module.css`) — sin framework CSS
- Estado: React Context + useReducer para estado global del proyecto
- Naming: `PascalCase` componentes, `camelCase` funciones/variables

### Backend
- Python 3.11+ con type hints
- FastAPI con Pydantic v2 para validación
- SQLAlchemy 2.0 (async opcional, sync por defecto)
- Naming: `snake_case` en todo Python
- Estructura modular: `api/`, `models/`, `services/`, `core/`

### General
- Todos los IDs: UUID v4 (texto)
- Fechas: ISO 8601 en JSON, DATETIME en SQLite
- Colores: hex string `#RRGGBB`
- Idioma del código: inglés
- Idioma de la UI: español (con i18n preparado)

---

## Variables de entorno

```env
# Backend
QUALIA_PORT=8001
QUALIA_DATA_DIR=~/.qualia/projects    # donde se guardan los .qualia

# LLM — Claude va por OAuth (Anthropic SDK), no necesita API key manual
# Codex CLI y Claude Code CLI como fallback
CODEX_CLI_PATH=codex
CLAUDE_CODE_CLI_PATH=claude

# Whisper
WHISPER_MODEL=medium                  # tiny|base|small|medium|large
WHISPER_DEVICE=cpu                    # cpu|cuda|mps

# Ollama (embeddings)
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text-v2-moe

# ChromaDB
CHROMADB_DIR=~/.qualia/chromadb
```

---

## Entorno de desarrollo

### Virtual environment

El venv vive fuera del proyecto (regla: no crear venvs dentro de las carpetas de código):

```
/tmp/qualia_venv/          ← venv de Python (se recrea si se borra)
```

El script `qualia.sh` lo crea automáticamente si no existe.

### Cómo arrancar

```bash
# Todo de una (recomendado):
./qualia.sh
# → Backend en http://localhost:8001
# → Frontend en http://localhost:5173

# ─── O manualmente ───

# Backend
source /tmp/qualia_venv/bin/activate
cd backend
pip install -r requirements.txt
uvicorn qualia.main:app --port 8001

# Frontend (otra terminal)
cd frontend
npm install
npm run dev  # → localhost:5173
```

### Instalar dependencias extra

```bash
# Whisper (transcripción de audio) — incluido en requirements.txt
/tmp/qualia_venv/bin/pip install faster-whisper

# Ollama embeddings (ya instalado en la máquina)
ollama pull nomic-embed-text-v2-moe
```

---

## Reglas del proyecto

- **No MAXQDA/NVivo features bloat**: solo lo necesario para análisis temático + mixed methods
- **AI = asistente, no sustituto**: toda codificación IA requiere revisión humana
- **Offline-first**: funciona sin internet (excepto Claude OAuth — fallback a Codex CLI / Claude Code CLI local)
- **Un proyecto = un archivo**: portabilidad máxima (`.qualia` = SQLite renombrado)
- **Performance**: documentos de hasta 100 páginas deben cargar fluido con paginación

---

*Última actualización: 2026-03-19 — Bea + Claude (F3: AI coding assistance + Whisper transcription)*
