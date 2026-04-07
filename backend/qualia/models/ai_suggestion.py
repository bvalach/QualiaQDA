from __future__ import annotations
from typing import Optional

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class AiSuggestion(Base):
    """AI-generated coding suggestions — separate from human codings until accepted."""
    __tablename__ = "ai_suggestions"
    __table_args__ = (
        Index("ix_ai_suggestions_excerpt_id", "excerpt_id"),
        Index("ix_ai_suggestions_status", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    excerpt_id: Mapped[str] = mapped_column(String, ForeignKey("excerpts.id"), nullable=False)
    code_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("codes.id"))  # NULL if suggesting new code
    suggested_code_name: Mapped[Optional[str]] = mapped_column(String)  # name if code_id is NULL
    confidence: Mapped[Optional[float]] = mapped_column(Float)  # 0.0–1.0
    model_name: Mapped[str] = mapped_column(String, nullable=False)
    rationale: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending, accepted, rejected
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    excerpt = relationship("Excerpt", back_populates="ai_suggestions")
    code = relationship("Code")
