"""Catálogo: modelos por nicho, cenas instaladas (próprias + RenderComp) e índice FTS local."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from . import db
from .config import ROOT
from .contracts import COLOR_RE
from .util import VRSError

NICHES_DIR = Path(__file__).parent / "presets" / "niches"
SPECS_PATH = ROOT / "frontend" / "src" / "contracts" / "scene-specs.json"
RC_PATH = ROOT / "frontend" / "src" / "contracts" / "rendercomp-registry.json"


@lru_cache(maxsize=1)
def _specs() -> dict[str, Any]:
    return json.loads(SPECS_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _rc() -> dict[str, Any]:
    if not RC_PATH.exists():
        return {"origin": {}, "scenes": []}
    return json.loads(RC_PATH.read_text(encoding="utf-8"))


def icons() -> list[str]:
    return list(_specs()["icons"])


@lru_cache(maxsize=1)
def scenes() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for s in _specs()["scenes"]:
        out[s["id"]] = {**s, "source": "vrs", "license": "Projeto VRS", "nativeFps": None}
    origin = _rc().get("origin", {})
    for s in _rc().get("scenes", []):
        out[s["id"]] = {
            **s,
            "summary": f"Cena RenderComp ({s['category']}) adaptada ao quadro; texto e cores editáveis.",
            "source": origin.get("repository", ""),
            "revision": origin.get("revision", ""),
            "license": origin.get("license", "MIT"),
        }
    return out


def get_scene(scene_id: str) -> dict[str, Any]:
    s = scenes().get(scene_id)
    if not s:
        raise VRSError(f"Cena desconhecida: {scene_id}", code="unknown_scene", status=404)
    return s


def scene_summary(s: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": s["id"],
        "title": s["title"],
        "category": s.get("category", ""),
        "summary": s.get("summary", "")[:200],
        "params": [p["key"] for p in s["params"]],
        "source": "RenderComp (MIT)" if s["id"].startswith("rc-") else "VRS",
        "thumbnail": s.get("thumbnail", ""),
        "nativeFps": s.get("nativeFps"),
    }


@lru_cache(maxsize=1)
def niches() -> dict[str, dict[str, Any]]:
    out = {}
    for p in sorted(NICHES_DIR.glob("*.json")):
        n = json.loads(p.read_text(encoding="utf-8"))
        out[n["id"]] = n
    return out


def get_niche(niche_id: str) -> dict[str, Any]:
    n = niches().get(niche_id)
    if not n:
        raise VRSError(f"Modelo de nicho desconhecido: {niche_id}", code="unknown_niche", status=404)
    return n


def niche_summary(n: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": n["id"],
        "title": n["title"],
        "emoji": n.get("emoji", ""),
        "description": n["description"],
        "arc": n["arc"],
        "visualLanguages": n["visualLanguages"],
        "aspects": n["aspects"],
        "defaultDuration": n["defaultDuration"],
        "example": n["example"],
        "scenes": [{"role": s["role"], "label": s["label"], "preset_id": s["preset_id"], "duration": s["duration"]} for s in n["recipe"]],
    }


# ---------------------------------------------------------------------------
# Validação de parâmetros a partir da mesma especificação usada pelo Zod
# ---------------------------------------------------------------------------
def _check(spec: dict[str, Any], value: Any, path: str, errors: list[str]) -> Any:
    t = spec["type"]
    if t in ("text", "longtext"):
        if not isinstance(value, str):
            errors.append(f"{path}: precisa ser texto")
            return value
        if len(value) > spec.get("maxLength", 400):
            errors.append(f"{path}: excede {spec.get('maxLength', 400)} caracteres")
        if "<script" in value.lower() or "javascript:" in value.lower():
            errors.append(f"{path}: conteúdo executável não é permitido")
        return value
    if t == "color":
        if not isinstance(value, str) or not COLOR_RE.match(value):
            errors.append(f"{path}: cor inválida (use #rrggbb)")
        return value
    if t == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or value in (float("inf"), float("-inf")):
            errors.append(f"{path}: precisa ser número finito")
            return value
        if value < spec.get("min", -1e12) or value > spec.get("max", 1e12):
            errors.append(f"{path}: fora do intervalo [{spec.get('min')}, {spec.get('max')}]")
        return value
    if t == "boolean":
        if not isinstance(value, bool):
            errors.append(f"{path}: precisa ser verdadeiro/falso")
        return value
    if t == "select":
        if value not in spec.get("options", []):
            errors.append(f"{path}: opção inválida {value!r}; use {spec.get('options')}")
        return value
    if t == "icon":
        if value not in icons():
            errors.append(f"{path}: ícone desconhecido {value!r}")
        return value
    if t == "asset":
        if not isinstance(value, str):
            errors.append(f"{path}: recurso precisa ser texto")
            return value
        if value and not (value.startswith("lib:") or re.fullmatch(r"[A-Za-z0-9_\-./]+", value)) or ".." in value or value.startswith("/"):
            errors.append(f"{path}: recurso precisa ser caminho relativo do projeto ou lib:<id>")
        return value
    if t == "list":
        if not isinstance(value, list):
            errors.append(f"{path}: precisa ser lista")
            return value
        if len(value) > spec.get("maxItems", 12):
            errors.append(f"{path}: máximo de {spec.get('maxItems')} itens")
        if len(value) < spec.get("minItems", 0):
            errors.append(f"{path}: mínimo de {spec.get('minItems')} itens")
        item = spec.get("item", {"type": "text"})
        out = []
        for i, v in enumerate(value):
            if item["type"] == "object":
                if not isinstance(v, dict):
                    errors.append(f"{path}[{i}]: precisa ser objeto")
                    out.append(v)
                    continue
                fields = {f["key"]: f for f in item.get("fields", [])}
                for k in v:
                    if k not in fields:
                        errors.append(f"{path}[{i}].{k}: campo desconhecido")
                merged = {k: f.get("default") for k, f in fields.items()}
                merged.update(v)
                for k, f in fields.items():
                    _check(f, merged[k], f"{path}[{i}].{k}", errors)
                out.append(merged)
            else:
                out.append(_check(item, v, f"{path}[{i}]", errors))
        return out
    if t == "json":
        try:
            if len(json.dumps(value)) > 20000:
                errors.append(f"{path}: grande demais")
        except (TypeError, ValueError):
            errors.append(f"{path}: não serializável")
        return value
    errors.append(f"{path}: tipo de parâmetro não suportado {t}")
    return value


def validate_params(scene_id: str, params: dict[str, Any], *, fill_defaults: bool = True) -> dict[str, Any]:
    spec = get_scene(scene_id)
    fields = {p["key"]: p for p in spec["params"]}
    errors: list[str] = []
    for k in params:
        if k not in fields:
            errors.append(f"{scene_id}.{k}: parâmetro desconhecido (conhecidos: {', '.join(fields)})")
    out: dict[str, Any] = {}
    for k, f in fields.items():
        if k in params:
            out[k] = _check(f, params[k], f"{scene_id}.{k}", errors)
        elif fill_defaults:
            out[k] = json.loads(json.dumps(f.get("default")))
    if errors:
        raise VRSError("Parâmetros inválidos: " + "; ".join(errors[:12]), code="invalid_params")
    return out


def asset_fields(scene_id: str, params: dict[str, Any]) -> list[tuple[list[Any], str]]:
    """Lista (container, chave) de todos os campos de recurso dentro dos parâmetros."""
    spec = get_scene(scene_id)
    found: list[tuple[Any, Any]] = []
    for p in spec["params"]:
        if p["type"] == "asset" and p["key"] in params:
            found.append((params, p["key"]))
        elif p["type"] == "list" and p.get("item", {}).get("type") == "object" and isinstance(params.get(p["key"]), list):
            for f in p["item"].get("fields", []):
                if f["type"] == "asset":
                    for item in params[p["key"]]:
                        if isinstance(item, dict) and f["key"] in item:
                            found.append((item, f["key"]))
    return found  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Índice FTS (cenas e nichos) — recursos são indexados por library.py
# ---------------------------------------------------------------------------
def index_catalog() -> int:
    rows = []
    for s in scenes().values():
        rows.append((s["id"], "scene", s["title"], f"{s.get('summary', '')} {s.get('category', '')} {' '.join(s.get('motion', []) or [])}"))
    for n in niches().values():
        rows.append((n["id"], "niche", n["title"], f"{n['description']} {' '.join(n['arc'])} {' '.join(n['visualLanguages'])}"))
    with db.tx() as c:
        c.execute("DELETE FROM catalog_fts")
        c.execute("DELETE FROM catalog_fts_src")
        c.executemany("INSERT INTO catalog_fts_src(id, kind, title, summary) VALUES(?,?,?,?)", rows)
        c.executemany("INSERT INTO catalog_fts(id, kind, title, summary) VALUES(?,?,?,?)", rows)
    return len(rows)


def fts_query(q: str) -> str:
    toks = re.findall(r"[\wÀ-ÿ]+", q or "")
    return " OR ".join(f'"{t}"*' for t in toks[:8])


def search_catalog(q: str, kind: str = "", limit: int = 10, offset: int = 0) -> dict[str, Any]:
    c = db.conn()
    if c.execute("SELECT COUNT(*) FROM catalog_fts_src").fetchone()[0] == 0:
        index_catalog()
    limit = max(1, min(50, limit))
    if q.strip():
        sql = "SELECT id, kind, title FROM catalog_fts WHERE catalog_fts MATCH ?" + (" AND kind = ?" if kind else "") + " ORDER BY rank LIMIT ? OFFSET ?"
        args: list[Any] = [fts_query(q)] + ([kind] if kind else []) + [limit, offset]
    else:
        sql = "SELECT id, kind, title FROM catalog_fts_src" + (" WHERE kind = ?" if kind else "") + " ORDER BY kind, id LIMIT ? OFFSET ?"
        args = ([kind] if kind else []) + [limit, offset]
    items = [dict(r) for r in c.execute(sql, args).fetchall()]
    return {"items": items, "offset": offset, "limit": limit, "next_offset": offset + len(items) if len(items) == limit else None}
