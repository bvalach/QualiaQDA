from __future__ import annotations
from typing import Optional

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class CodeRelationship(Base):
    __tablename__ = "code_relationships"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), nullable=False)
    source_code_id: Mapped[str] = mapped_column(String, ForeignKey("codes.id"), nullable=False)
    target_code_id: Mapped[str] = mapped_column(String, ForeignKey("codes.id"), nullable=False)
    rel_type: Mapped[str] = mapped_column(String, nullable=False)  # is_part_of, is_cause_of, contradicts, is_associated_with, is_property_of, custom
    label: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="code_relationships")
    source_code = relationship("Code", foreign_keys=[source_code_id])
    target_code = relationship("Code", foreign_keys=[target_code_id])
