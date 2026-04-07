from __future__ import annotations
from typing import Optional

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from qualia.core.database import Base


class Code(Base):
    __tablename__ = "codes"
    __table_args__ = (
        Index("ix_codes_project_id", "project_id"),
        Index("ix_codes_parent_id", "parent_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), nullable=False)
    parent_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("codes.id"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String, nullable=False, default="#FFD700")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="codes")
    parent = relationship("Code", remote_side=[id], backref="children")
    codings = relationship("Coding", back_populates="code", cascade="all, delete-orphan")


class CodeGroup(Base):
    __tablename__ = "code_groups"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    color: Mapped[Optional[str]] = mapped_column(String)

    project = relationship("Project", back_populates="code_groups")
    members = relationship("CodeGroupMember", back_populates="group", cascade="all, delete-orphan")


class CodeGroupMember(Base):
    __tablename__ = "code_group_members"

    code_group_id: Mapped[str] = mapped_column(String, ForeignKey("code_groups.id"), primary_key=True)
    code_id: Mapped[str] = mapped_column(String, ForeignKey("codes.id"), primary_key=True)

    group = relationship("CodeGroup", back_populates="members")
    code = relationship("Code")
