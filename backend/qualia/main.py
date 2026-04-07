from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from qualia.core.config import settings
from qualia.api import (
    projects, documents, codes, coding, memos, export,
    analysis, ai, transcription,
    search, relationships, tags, case_attributes, snapshots, embeddings,
)

app = FastAPI(title="QualiaQDA", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(codes.router)
app.include_router(coding.router)
app.include_router(memos.router)
app.include_router(export.router)
app.include_router(analysis.router)
app.include_router(ai.router)
app.include_router(transcription.router)
app.include_router(search.router)
app.include_router(relationships.router)
app.include_router(tags.router)
app.include_router(case_attributes.router)
app.include_router(snapshots.router)
app.include_router(embeddings.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.3.0"}
