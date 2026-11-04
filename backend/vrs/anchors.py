"""Word-based edit cues. Milliseconds always come from the current narration."""
from __future__ import annotations
import re
import unicodedata
from typing import Any
from .util import VRSError


def normalize_token(value: str) -> str:
    return re.sub(r"[^\w]", "", unicodedata.normalize("NFD", value).encode("ascii", "ignore").decode().lower())


def resolve_anchor(words: list[dict[str, Any]], anchor: dict[str, Any]) -> tuple[int, int]:
    target_id = anchor.get("wordId")
    if target_id:
        index = next((i for i, w in enumerate(words) if w["id"] == target_id), -1)
    else:
        matches = [i for i, w in enumerate(words) if normalize_token(w["word"]) == normalize_token(anchor.get("word", ""))]
        occurrence = anchor.get("occurrence", 1)
        index = matches[occurrence - 1] if 0 < occurrence <= len(matches) else -1
    span = anchor.get("spanWords", 1)
    if index < 0 or index + span > len(words):
        raise VRSError("Âncora ausente ou intervalo além da narração.", code="unresolved_anchor")
    return int(words[index]["start"]), int(words[index + span - 1]["end"])
