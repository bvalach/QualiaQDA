from __future__ import annotations
from typing import Optional

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from qualia.core.config import settings
from qualia.core.database import Base, get_engine, set_active_project, get_active_db_path
from qualia.models import Project

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectInfo(BaseModel):
    id: str
    name: str
    description: Optional[str]
    file_path: str
    created_at: str


class ProjectOpenRequest(BaseModel):
    file_path: str


@router.get("/", response_model=list[ProjectInfo])
def list_projects():
    """List all .qualia project files in the data directory."""
    projects = []
    for f in sorted(settings.qualia_data_dir.glob("*.qualia")):
        from sqlalchemy.orm import Session
        from qualia.core.database import get_engine
        engine = get_engine(f)
        with Session(engine) as session:
            proj = session.query(Project).first()
            if proj:
                projects.append(ProjectInfo(
                    id=proj.id,
                    name=proj.name,
                    description=proj.description,
                    file_path=str(f),
                    created_at=proj.created_at.isoformat(),
                ))
    return projects


@router.post("/", response_model=ProjectInfo)
def create_project(data: ProjectCreate):
    """Create a new .qualia project file."""
    project_id = str(uuid.uuid4())
    safe_name = "".join(c if c.isalnum() or c in "-_ " else "" for c in data.name).strip().replace(" ", "_")
    file_path = settings.qualia_data_dir / f"{safe_name}.qualia"

    if file_path.exists():
        raise HTTPException(status_code=409, detail=f"Project file already exists: {file_path.name}")

    engine = get_engine(file_path)
    Base.metadata.create_all(engine)

    from sqlalchemy.orm import Session
    with Session(engine) as session:
        project = Project(id=project_id, name=data.name, description=data.description)
        session.add(project)
        session.commit()
        created_at = project.created_at.isoformat()

    set_active_project(file_path)

    return ProjectInfo(
        id=project_id,
        name=data.name,
        description=data.description,
        file_path=str(file_path),
        created_at=created_at,
    )


@router.post("/open", response_model=ProjectInfo)
def open_project(data: ProjectOpenRequest):
    """Open an existing .qualia project file."""
    file_path = Path(data.file_path).expanduser().resolve()
    data_dir = settings.qualia_data_dir.expanduser().resolve()

    if file_path.suffix != ".qualia":
        raise HTTPException(status_code=400, detail="Invalid project file extension")
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Project file not found")
    if not file_path.is_relative_to(data_dir):
        raise HTTPException(status_code=400, detail="Project file must be inside the data directory")

    engine = get_engine(file_path)
    # Apply any new tables/indices/constraints to existing projects
    Base.metadata.create_all(engine)
    set_active_project(file_path)

    from sqlalchemy.orm import Session
    with Session(engine) as session:
        proj = session.query(Project).first()
        if not proj:
            raise HTTPException(status_code=400, detail="Invalid project file")
        return ProjectInfo(
            id=proj.id,
            name=proj.name,
            description=proj.description,
            file_path=str(file_path),
            created_at=proj.created_at.isoformat(),
        )


@router.delete("/{project_id}")
def delete_project(project_id: str):
    """Delete a .qualia project file."""
    for f in settings.qualia_data_dir.glob("*.qualia"):
        from sqlalchemy.orm import Session
        from qualia.core.database import get_engine
        engine = get_engine(f)
        with Session(engine) as session:
            proj = session.query(Project).first()
            if proj and proj.id == project_id:
                # Delete associated files directory
                files_dir = f.parent / (f.stem + "_files")
                if files_dir.exists():
                    import shutil
                    shutil.rmtree(files_dir)
                f.unlink()
                return {"ok": True}
    raise HTTPException(status_code=404, detail="Project not found")


@router.get("/active")
def get_active_project():
    """Get the currently active project path."""
    db_path = get_active_db_path()
    if db_path is None:
        return {"active": False, "file_path": None}
    return {"active": True, "file_path": str(db_path)}
