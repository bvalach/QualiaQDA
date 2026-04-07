from __future__ import annotations
from typing import Optional

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_project_id", "project_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    doc_type: Mapped[str] = mapped_column(String, nullable=False)  # text, markdown, pdf, image, audio
    content: Mapped[Optional[str]] = mapped_column(Text)  # plain text / markdown (NULL for binaries)
    file_path: Mapped[Optional[str]] = mapped_column(String)  # path to original file (binaries)
    page_count: Mapped[Optional[int]] = mapped_column(Integer)
    doc_hash: Mapped[Optional[str]] = mapped_column(String)  # SHA-256 for hybrid anchoring
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="documents")
    excerpts = relationship("Excerpt", back_populates="document", cascade="all, delete-orphan")
