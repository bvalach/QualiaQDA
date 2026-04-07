"""LLM provider runner for local CLIs and Ollama.

Supports explicit provider selection and an "auto" mode that falls back across
available providers.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union

from qualia.core.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMProviderStatus:
    id: str
    label: str
    transport: str
    available: bool
    detail: Optional[str] = None


@dataclass
class LLMResponse:
    text: str
    model: str
    success: bool
    error: Optional[str] = None


def _command_exists(command: str) -> bool:
    if "/" in command:
        return Path(command).exists()
    return shutil.which(command) is not None


def _fetch_ollama_models() -> tuple[Optional[list[str]], Optional[str]]:
    req = urllib.request.Request(f"{settings.ollama_url}/api/tags", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError:
        return None, f"Ollama no responde en {settings.ollama_url}"
    except Exception as exc:  # pragma: no cover - defensive path
        return None, str(exc)

    models = []
    for item in payload.get("models", []):
        name = item.get("name")
        if name:
            models.append(name)
    return models, None


def get_llm_provider_statuses() -> list[LLMProviderStatus]:
    statuses: list[LLMProviderStatus] = []

    claude_available = _command_exists(settings.claude_code_cli_path)
    statuses.append(
        LLMProviderStatus(
            id="claude",
            label="Claude Code",
            transport="cli",
            available=claude_available,
            detail=None if claude_available else f"No se encuentra '{settings.claude_code_cli_path}' en PATH",
        )
    )

    codex_available = _command_exists(settings.codex_cli_path)
    statuses.append(
        LLMProviderStatus(
            id="codex",
            label="Codex CLI",
            transport="cli",
            available=codex_available,
            detail=None if codex_available else f"No se encuentra '{settings.codex_cli_path}' en PATH",
        )
    )

    ollama_models, ollama_error = _fetch_ollama_models()
    ollama_available = False
    ollama_detail: Optional[str] = ollama_error
    if ollama_models is not None:
        if settings.ollama_chat_model in ollama_models:
            ollama_available = True
            ollama_detail = None
        else:
            ollama_detail = (
                f"Modelo '{settings.ollama_chat_model}' no instalado en Ollama"
            )

    statuses.append(
        LLMProviderStatus(
            id="ollama",
            label="Ollama",
            transport="http",
            available=ollama_available,
            detail=ollama_detail,
        )
    )

    auto_available = any(status.available for status in statuses)
    statuses.insert(
        0,
        LLMProviderStatus(
            id="auto",
            label="Automático",
            transport="fallback",
            available=auto_available,
            detail=None if auto_available else "No hay proveedores IA disponibles",
        ),
    )
    return statuses


def _resolve_provider_order(selected_provider: Optional[str]) -> tuple[list[str], Optional[str]]:
    statuses = get_llm_provider_statuses()
    status_by_id = {status.id: status for status in statuses}
    provider_id = (selected_provider or settings.llm_default_provider or "auto").strip().lower()

    if provider_id not in status_by_id:
        return [], f"Proveedor IA desconocido: {provider_id}"

    if provider_id == "auto":
        ordered = [status.id for status in statuses if status.id != "auto" and status.available]
        if not ordered:
            return [], "No hay proveedores IA disponibles"
        return ordered, None

    status = status_by_id[provider_id]
    if not status.available:
        return [], status.detail or f"Proveedor IA no disponible: {provider_id}"
    return [provider_id], None


async def _run_cli(
    command: list[str],
    *,
    model_name: str,
    provider_id: str,
    timeout: int,
) -> LLMResponse:
    try:
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        output = stdout.decode("utf-8").strip()

        if proc.returncode != 0:
            err = stderr.decode("utf-8").strip()
            logger.warning("%s returned %d: %s", provider_id, proc.returncode, err)
            return LLMResponse(text="", model=model_name, success=False, error=err)

        return LLMResponse(text=output, model=model_name, success=True)
    except asyncio.TimeoutError:
        logger.warning("%s timed out after %ds", provider_id, timeout)
        return LLMResponse(text="", model=model_name, success=False, error="timeout")
    except FileNotFoundError:
        return LLMResponse(
            text="",
            model=model_name,
            success=False,
            error=f"{provider_id} executable not found",
        )
    except Exception as exc:  # pragma: no cover - defensive path
        logger.exception("%s error", provider_id)
        return LLMResponse(text="", model=model_name, success=False, error=str(exc))


async def run_claude(prompt: str, *, timeout: int = 120) -> LLMResponse:
    return await _run_cli(
        [settings.claude_code_cli_path, "-p", prompt, "--output-format", "text"],
        model_name="claude-cli",
        provider_id="claude",
        timeout=timeout,
    )


async def run_codex(prompt: str, *, timeout: int = 120) -> LLMResponse:
    return await _run_cli(
        [settings.codex_cli_path, "-q", prompt],
        model_name="codex-cli",
        provider_id="codex",
        timeout=timeout,
    )


def _ollama_generate(prompt: str, timeout: int) -> LLMResponse:
    payload = json.dumps(
        {
            "model": settings.ollama_chat_model,
            "prompt": prompt,
            "stream": False,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{settings.ollama_url}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        return LLMResponse(
            text="",
            model=f"ollama:{settings.ollama_chat_model}",
            success=False,
            error=str(exc.reason),
        )
    except Exception as exc:  # pragma: no cover - defensive path
        logger.exception("ollama error")
        return LLMResponse(
            text="",
            model=f"ollama:{settings.ollama_chat_model}",
            success=False,
            error=str(exc),
        )

    return LLMResponse(
        text=(body.get("response") or "").strip(),
        model=f"ollama:{settings.ollama_chat_model}",
        success=True,
    )


async def run_ollama(prompt: str, *, timeout: int = 120) -> LLMResponse:
    return await asyncio.to_thread(_ollama_generate, prompt, timeout)


async def run_llm(
    prompt: str,
    *,
    provider: Optional[str] = None,
    timeout: int = 120,
) -> LLMResponse:
    ordered_providers, error = _resolve_provider_order(provider)
    if error:
        return LLMResponse(text="", model="unknown", success=False, error=error)

    last_error: Optional[str] = None
    for provider_id in ordered_providers:
        if provider_id == "claude":
            result = await run_claude(prompt, timeout=timeout)
        elif provider_id == "codex":
            result = await run_codex(prompt, timeout=timeout)
        elif provider_id == "ollama":
            result = await run_ollama(prompt, timeout=timeout)
        else:  # pragma: no cover - guarded by _resolve_provider_order
            continue

        if result.success:
            return result

        last_error = result.error
        logger.info("LLM provider %s failed: %s", provider_id, result.error)

    return LLMResponse(
        text="",
        model="unknown",
        success=False,
        error=last_error or "No LLM provider succeeded",
    )


def extract_json_from_response(text: str) -> Union[list, dict, None]:
    """Extract JSON from LLM response that may contain markdown fences or extra text."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    for start_char, end_char in [("[", "]"), ("{", "}")]:
        start = text.find(start_char)
        if start == -1:
            continue
        depth = 0
        for i in range(start, len(text)):
            if text[i] == start_char:
                depth += 1
            elif text[i] == end_char:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        break

    return None
