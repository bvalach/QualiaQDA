from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class Coding(Base):
    """Assignment of a code to an excerpt. Span data lives in the excerpt."""
    __tablename__ = "codings"
    __table_args__ = (
        Index("ix_codings_excerpt_id", "excerpt_id"),
        Index("ix_codings_code_id", "code_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    excerpt_id: Mapped[str] = mapped_column(String, ForeignKey("excerpts.id"), nullable=False)
    code_id: Mapped[str] = mapped_column(String, ForeignKey("codes.id"), nullable=False)
    created_by: Mapped[str] = mapped_column(String, nullable=False, default="user")  # 'user' | 'ai_accepted'
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    excerpt = relationship("Excerpt", back_populates="codings")
    code = relationship("Code", back_populates="codings")
