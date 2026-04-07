from __future__ import annotations
from typing import Optional

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, Float, DateTime, ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class Excerpt(Base):
    """First-class text span anchored to a document — the atomic unit of qualitative analysis."""
    __tablename__ = "excerpts"
    __table_args__ = (
        CheckConstraint("start_pos >= 0", name="ck_excerpts_pos_nonneg"),
        CheckConstraint("start_pos < end_pos", name="ck_excerpts_pos_order"),
        Index("ix_excerpts_document_id", "document_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id"), nullable=False)
    start_pos: Mapped[int] = mapped_column(Integer, nullable=False)
    end_pos: Mapped[int] = mapped_column(Integer, nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, nullable=False)  # snapshot of selected text
    context_before: Mapped[Optional[str]] = mapped_column(Text)  # ~50 chars before (for rehydration)
    context_after: Mapped[Optional[str]] = mapped_column(Text)  # ~50 chars after
    doc_hash: Mapped[Optional[str]] = mapped_column(String)  # document hash at creation time
    # PDF bounding box (optional, for visual regions)
    bbox_x: Mapped[Optional[float]] = mapped_column(Float)
    bbox_y: Mapped[Optional[float]] = mapped_column(Float)
    bbox_w: Mapped[Optional[float]] = mapped_column(Float)
    bbox_h: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    document = relationship("Document", back_populates="excerpts")
    codings = relationship("Coding", back_populates="excerpt", cascade="all, delete-orphan")
    ai_suggestions = relationship("AiSuggestion", back_populates="excerpt", cascade="all, delete-orphan")
