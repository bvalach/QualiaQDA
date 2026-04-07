from __future__ import annotations
from typing import List

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    qualia_port: int = 8001
    qualia_data_dir: Path = Path.home() / ".qualia" / "projects"
    cors_origins: List[str] = ["http://localhost:5173"]
    llm_default_provider: str = "auto"
    claude_code_cli_path: str = "claude"
    codex_cli_path: str = "codex"
    ollama_url: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.1:8b"

    model_config = {"env_prefix": "QUALIA_", "env_file": ".env"}


settings = Settings()
settings.qualia_data_dir.mkdir(parents=True, exist_ok=True)
