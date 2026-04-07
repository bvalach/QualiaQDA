from __future__ import annotations
from typing import Optional

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class ProjectSnapshot(Base):
    """Lightweight project versioning — JSON-serialised state at a point in time."""
    __tablename__ = "project_snapshots"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)  # 'v1', 'pre-merge', 'before-AI-run'
    description: Mapped[Optional[str]] = mapped_column(Text)
    snapshot_data: Mapped[Optional[str]] = mapped_column(Text)  # JSON serialised state
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="snapshots")
