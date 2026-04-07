from __future__ import annotations
from typing import Optional, Generator

from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker, DeclarativeBase


class Base(DeclarativeBase):
    pass


def _enable_fk(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_engine(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", echo=False)
    event.listen(engine, "connect", _enable_fk)
    return engine


def get_session_factory(db_path: Path) -> sessionmaker[Session]:
    engine = get_engine(db_path)
    return sessionmaker(bind=engine)


# Active project state — set when a project is opened
_active_session_factory: Optional[sessionmaker] = None
_active_db_path: Optional[Path] = None


def set_active_project(db_path: Path):
    global _active_session_factory, _active_db_path
    _active_db_path = db_path
    _active_session_factory = get_session_factory(db_path)


def get_active_db_path() -> Optional[Path]:
    return _active_db_path


def get_db() -> Session:
    if _active_session_factory is None:
        raise RuntimeError("No project is open. Create or open a project first.")
    session = _active_session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
