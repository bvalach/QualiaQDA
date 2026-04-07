from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from qualia.core.database import Base


class EntityLink(Base):
    """Polymorphic links between entities (e.g. memo → document, memo → memo)."""
    __tablename__ = "entity_links"
    __table_args__ = (
        UniqueConstraint("source_id", "target_type", "target_id", name="uq_entity_links_source_target"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_type: Mapped[str] = mapped_column(String, nullable=False)  # 'memo' for now
    source_id: Mapped[str] = mapped_column(String, nullable=False)
    target_type: Mapped[str] = mapped_column(String, nullable=False)  # document, excerpt, code, coding, memo
    target_id: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
