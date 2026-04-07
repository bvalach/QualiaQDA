from __future__ import annotations
from typing import Optional

import uuid

from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class EmbeddingSegment(Base):
    """Text chunk with its embedding vector stored as a JSON array."""
    __tablename__ = "embedding_segments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id"), nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    start_pos: Mapped[Optional[int]] = mapped_column(Integer)
    end_pos: Mapped[Optional[int]] = mapped_column(Integer)
    vector: Mapped[Optional[str]] = mapped_column(Text)  # JSON array of floats

    document = relationship("Document")
