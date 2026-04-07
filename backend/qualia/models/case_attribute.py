from __future__ import annotations
from typing import Optional

import uuid

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class CaseAttribute(Base):
    __tablename__ = "case_attributes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), nullable=False)
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id"), nullable=False)
    attr_name: Mapped[str] = mapped_column(String, nullable=False)
    attr_value: Mapped[Optional[str]] = mapped_column(String)
    attr_type: Mapped[str] = mapped_column(String, default="text")  # text, number, date, boolean

    project = relationship("Project", back_populates="case_attributes")
    document = relationship("Document")
