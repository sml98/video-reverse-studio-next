"""Projetos: ID estável, metadados no SQLite e arquivos isolados por projeto.

Layout de um projeto (data/projects/<id>/):
  reference/        original imutável (somente leitura) + metadata
  evidence/         medidas da referência (por ID)
  brief.json        brief compacto para o agente
  storyboard.json   storyboard autoral (última versão) + storyboard.vN.json
  plan.json         FilmPlan expandido (última versão) + versions/plan.vN.json
  assets/           recursos importados/gerados (com provenance.json)
  voice/            narração final por cena + tempos
  renders/vN/       MP4, legendas, revisão
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from . import db
from .config import settings
from .contracts import ASPECTS
from .util import VRSError, new_id, read_json, safe_join, write_json

SUBDIRS = ("reference", "evidence", "assets", "voice", "renders", "versions")


def project_dir(pid: str) -> Path:
    if not pid or not all(ch.isalnum() or ch in "-_" for ch in pid):
        raise VRSError("ID de projeto inválido.", code="bad_id", status=400)
    return settings().projects / pid


def create_project(
    *,
    name: str,
    idea: str = "",
    niche_id: str = "",
    aspect: str = "landscape",
    target_seconds: float = 30,
    language: str = "pt-BR",
    reference: dict[str, Any] | None = None,
    options: dict[str, Any] | None = None,
    is_example: bool = False,
) -> dict[str, Any]:
    if aspect not in ASPECTS:
        raise VRSError(f"Formato inválido: {aspect}")
    if not (3 <= float(target_seconds) <= 600):
        raise VRSError("Duração precisa estar entre 3 e 600 segundos.")
    pid = new_id("p")
    d = project_dir(pid)
    for s in SUBDIRS:
        (d / s).mkdir(parents=True, exist_ok=True)
    t = db.now()
    with db.tx() as c:
        c.execute(
            "INSERT INTO projects(id, name, language, aspect, target_seconds, idea, niche_id, reference_json, options_json, stage, status, created_at, updated_at, is_example) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (pid, name[:160] or "Sem título", language, aspect, float(target_seconds), idea[:4000], niche_id, db.dumps(reference or {}), db.dumps(options or {}), "created", "draft", t, t, int(is_example)),
        )
    history(pid, "created", name=name, niche=niche_id, aspect=aspect, target_seconds=target_seconds)
    return get_project(pid)


def get_project(pid: str) -> dict[str, Any]:
    row = db.conn().execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
    if not row:
        raise VRSError("Projeto não encontrado.", code="not_found", status=404)
    p = db.row_to_dict(row) or {}
    d = project_dir(pid)
    p["files"] = {
        "brief": (d / "brief.json").exists(),
        "storyboard": (d / "storyboard.json").exists(),
        "plan": (d / "plan.json").exists(),
    }
    p["renders"] = list_renders(pid)
    return p


def list_projects(include_examples: bool = False, limit: int = 100) -> list[dict[str, Any]]:
    sql = "SELECT * FROM projects" + ("" if include_examples else " WHERE is_example = 0") + " ORDER BY updated_at DESC LIMIT ?"
    out = []
    for r in db.conn().execute(sql, (limit,)).fetchall():
        p = db.row_to_dict(r) or {}
        rs = list_renders(p["id"])
        p["latest_render"] = rs[-1] if rs else None
        out.append(p)
    return out


def update_project(pid: str, **fields: Any) -> None:
    allowed = {"name", "idea", "niche_id", "aspect", "target_seconds", "stage", "status", "language"}
    sets, args = [], []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k} = ?")
            args.append(v)
        elif k in ("reference", "options"):
            sets.append(f"{k}_json = ?")
            args.append(db.dumps(v))
    if not sets:
        return
    sets.append("updated_at = ?")
    args.append(db.now())
    args.append(pid)
    db.conn().execute(f"UPDATE projects SET {', '.join(sets)} WHERE id = ?", args)


def history(pid: str, kind: str, **detail: Any) -> None:
    db.conn().execute("INSERT INTO project_history(project_id, at, kind, detail_json) VALUES(?,?,?,?)", (pid, db.now(), kind, db.dumps(detail)))


def get_history(pid: str, limit: int = 100) -> list[dict[str, Any]]:
    rows = db.conn().execute("SELECT * FROM project_history WHERE project_id = ? ORDER BY id DESC LIMIT ?", (pid, limit)).fetchall()
    return [db.row_to_dict(r) for r in rows]  # type: ignore[misc]


def save_versioned(pid: str, name: str, data: Any) -> int:
    """Salva `name`.json e uma cópia imutável versions/name.vN.json. Retorna N."""
    d = project_dir(pid)
    vdir = d / "versions"
    vdir.mkdir(exist_ok=True)
    n = 1 + max([int(p.stem.rsplit(".v", 1)[1]) for p in vdir.glob(f"{name}.v*.json") if p.stem.rsplit(".v", 1)[1].isdigit()] or [0])
    write_json(vdir / f"{name}.v{n}.json", data)
    write_json(d / f"{name}.json", data)
    return n


def load(pid: str, name: str) -> Any:
    return read_json(project_dir(pid) / f"{name}.json")


def list_renders(pid: str) -> list[dict[str, Any]]:
    rdir = project_dir(pid) / "renders"
    out = []
    if not rdir.exists():
        return out
    for v in sorted(rdir.glob("v*"), key=lambda p: int(p.name[1:]) if p.name[1:].isdigit() else 0):
        mp4 = v / "final.mp4"
        if mp4.exists():
            review = read_json(v / "review.json", {}) or {}
            out.append({"version": int(v.name[1:]), "mp4": f"renders/{v.name}/final.mp4", "size": mp4.stat().st_size, "review_state": review.get("state", "pending"), "created_at": mp4.stat().st_mtime})
    return out


def next_render_dir(pid: str) -> Path:
    rdir = project_dir(pid) / "renders"
    n = 1 + max([int(p.name[1:]) for p in rdir.glob("v*") if p.name[1:].isdigit()] or [0])
    d = rdir / f"v{n}"
    d.mkdir(parents=True)
    return d


def resolve(pid: str, rel: str) -> Path:
    return safe_join(project_dir(pid), rel)


def delete_never() -> None:  # pragma: no cover - documentação
    """Projetos nunca são apagados automaticamente pelo app."""


def export_project(pid: str, out_dir: Path | None = None) -> Path:
    """Pacote ZIP sem credenciais: plano, storyboard, legendas, mídias do projeto e procedência."""
    import zipfile

    p = get_project(pid)
    d = project_dir(pid)
    out_dir = out_dir or settings().outputs
    out_dir.mkdir(parents=True, exist_ok=True)
    zpath = out_dir / f"{pid}-export.zip"
    deny_names = {".env", "vrs.sqlite3"}
    deny_ext = {".onnx", ".bin", ".pt", ".safetensors", ".sqlite3", ".db"}
    manifest: dict[str, Any] = {"project": {k: p[k] for k in ("id", "name", "idea", "niche_id", "aspect", "target_seconds", "language")}, "files": []}
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(d.rglob("*")):
            if not f.is_file() or f.name in deny_names or f.suffix.lower() in deny_ext or f.name.endswith(".tmp"):
                continue
            rel = f.relative_to(d).as_posix()
            if rel.startswith("reference/") and not (p.get("reference") or {}).get("redistributable", False) and f.suffix.lower() in {".mp4", ".mov", ".webm", ".mkv"}:
                manifest["files"].append({"path": rel, "excluded": "referência original não incluída (licença não verificada)"})
                continue
            z.write(f, f"{pid}/{rel}")
            manifest["files"].append({"path": rel, "size": f.stat().st_size})
        z.writestr(f"{pid}/EXPORT_MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return zpath


def copy_into_project(pid: str, src: Path, rel: str) -> Path:
    dst = resolve(pid, rel)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        shutil.copy2(src, dst)
    return dst
