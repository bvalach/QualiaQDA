from __future__ import annotations

from typing import Sequence

_DANGEROUS_CSV_PREFIXES = ("=", "+", "-", "@")
_CSV_IGNORED_LEADING_CHARS = " \t\r\n"


def sanitize_csv_cell(value: object) -> object:
    if not isinstance(value, str) or not value:
        return value

    stripped = value.lstrip(_CSV_IGNORED_LEADING_CHARS)
    if stripped.startswith(_DANGEROUS_CSV_PREFIXES):
        return f"'{value}"
    return value


def sanitize_csv_row(row: Sequence[object]) -> list[object]:
    return [sanitize_csv_cell(cell) for cell in row]
