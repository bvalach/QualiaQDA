from __future__ import annotations
from typing import Optional

import uuid

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class Tag(Base):
    """Transversal analytical tags that can be applied to any entity."""
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[Optional[str]] = mapped_column(String)
    tag_type: Mapped[str] = mapped_column(String, default="analytical")  # analytical, methodological, status, custom

    project = relationship("Project", back_populates="tags")
    entity_tags = relationship("EntityTag", back_populates="tag", cascade="all, delete-orphan")


class EntityTag(Base):
    """Polymorphic join: tag ↔ {document, excerpt, code, coding, memo}."""
    __tablename__ = "entity_tags"

    tag_id: Mapped[str] = mapped_column(String, ForeignKey("tags.id"), primary_key=True)
    entity_type: Mapped[str] = mapped_column(String, primary_key=True)  # document, excerpt, code, coding, memo
    entity_id: Mapped[str] = mapped_column(String, primary_key=True)

    tag = relationship("Tag", back_populates="entity_tags")
