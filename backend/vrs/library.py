"""Biblioteca local de materiais: packs com procedência, índice SQLite FTS e importação segura."""
from __future__ import annotations

import json
import re
import shutil
import unicodedata
import zipfile
from pathlib import Path
from typing import Any, Iterable

from . import db, projects
from .catalog import fts_query
from .config import settings
from .util import VRSError, read_json, run, sha256_file, which, write_json

IMAGE = {".png", ".jpg", ".jpeg", ".webp"}
AUDIO = {".ogg", ".wav", ".mp3", ".flac"}
VIDEO = {".mp4", ".mov", ".webm", ".mkv"}
MODEL3D = {".glb", ".gltf"}
SKIP = {".txt", ".md", ".json", ".bin", ".url", ".html", ".hdr", ".exr"}
MAX_FILE = 200 * 1024 * 1024

# Capacidade REAL de cada tipo — o que o recurso é e o que NÃO é.
CAPABILITY = {
    "image": "imagem estática (recorte/pose). Movimento vem do código; não é rig nem personagem animado.",
    "pose": "pose 2D estática de personagem. Sem rig, sem lip-sync; animação = deslocamento/escala/rotação.",
    "sfx": "áudio fixo (efeito). Não é modelo de voz.",
    "voice_sample": "amostra de voz gravada (áudio fixo). Não é TTS e não autoriza clonagem.",
    "voice_model": "modelo de voz Piper local (TTS em CPU).",
    "model3d": "modelo 3D GLB/glTF. Não é cena pronta: exige câmera, luz e composição.",
    "anim_library": "clips esqueléticos. Exigem personagem compatível ou retarget.",
    "video": "vídeo de referência. Não é preset parametrizado.",
    "texture": "textura/HDRI. Não é cenário animado.",
}


def packs_dir() -> Path:
    return settings().library / "packs"


def previews_dir() -> Path:
    return settings().library / "previews"


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"^[0-9a-f]{20,}_", "", s)  # prefixos de hash (ex.: Open Peeps)
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s[:60] or "item"


PT_SYNONYMS = {
    "pumpkin": "abobora", "ghost": "fantasma", "grave": "tumulo cova", "gravestone": "lapide tumulo", "coffin": "caixao", "candle": "vela",
    "cross": "cruz", "fence": "cerca", "tree": "arvore", "bench": "banco", "crypt": "cripta", "skull": "caveira", "bat": "morcego",
    "lantern": "lanterna", "fire": "fogo", "basket": "cesto", "altar": "altar", "column": "coluna", "wall": "muro parede", "rock": "pedra",
    "flower": "flor", "grass": "grama", "cloud": "nuvem", "sun": "sol", "moon": "lua", "mountain": "montanha", "hill": "colina", "house": "casa",
    "castle": "castelo", "bush": "arbusto", "plant": "planta", "mushroom": "cogumelo", "stone": "pedra", "wood": "madeira", "floor": "piso chao",
    "sky": "ceu", "click": "clique", "switch": "interruptor", "rollover": "passagem", "peep": "personagem pessoa", "asteroids": "asteroide",
    "sunlight": "luz solar", "carved": "esculpida entalhada", "tall": "alta", "broken": "quebrada", "damaged": "danificado", "old": "velho",
}


def _tags_from_name(stem: str) -> list[str]:
    parts = re.sub(r"([a-z])([A-Z])", r"\1 \2", stem)
    parts = re.sub(r"[_\-.]+", " ", parts)
    toks = [t.lower() for t in parts.split() if len(t) > 1 and not re.fullmatch(r"[0-9a-f]{12,}", t.lower())][:8]
    extra = [w for t in toks for w in PT_SYNONYMS.get(t, "").split()]
    return toks + extra


def _kind(pack: dict[str, Any], f: Path) -> str | None:
    ext = f.suffix.lower()
    hints = pack.get("kinds", {})
    if ext == ".onnx":
        return "voice_model"
    if ext in IMAGE:
        if "texture" in hints.get("image", "") or "poly-haven" in pack["id"]:
            return "texture"
        return "pose" if hints.get("image") == "pose" else "image"
    if ext in AUDIO:
        return hints.get("audio", "sfx")
    if ext in VIDEO:
        return "video"
    if ext in MODEL3D:
        return "anim_library" if hints.get("model3d") == "anim_library" else "model3d"
    return None


def _video_preview(src: Path, rid: str) -> str:
    out = previews_dir() / f"{rid}.jpg"
    if not out.exists() and which("ffmpeg"):
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            run(["ffmpeg", "-v", "error", "-y", "-ss", "3", "-i", str(src), "-frames:v", "1", "-vf", "scale=480:-2", str(out)], timeout=60)
        except VRSError:
            return ""
    return str(out.relative_to(settings().library)) if out.exists() else ""


def index_library() -> dict[str, Any]:
    """Reindexa todos os packs instalados (data/library/packs/*/pack.json)."""
    root = packs_dir()
    rows: list[tuple] = []
    seen: set[str] = set()
    for pj in sorted(root.glob("*/pack.json")):
        pack = json.loads(pj.read_text(encoding="utf-8"))
        hashes = pack.get("files", {})
        for f in sorted(pj.parent.rglob("*")):
            if not f.is_file() or f.name == "pack.json" or f.suffix.lower() in SKIP:
                continue
            kind = _kind(pack, f)
            if not kind:
                continue
            rel_in_pack = f.relative_to(pj.parent).as_posix()
            base = f"{pack['id']}.{slug(f.stem)}"
            rid = base
            k = 2
            while rid in seen:
                rid = f"{base}-{k}"
                k += 1
            seen.add(rid)
            lib_rel = f.relative_to(settings().library).as_posix()
            preview = lib_rel if kind in ("image", "pose", "texture") else (_video_preview(f, rid) if kind == "video" else "")
            tags = sorted(set(_tags_from_name(f.stem) + pack.get("tags", [])))
            rows.append(
                (
                    rid,
                    kind,
                    f.stem[:80],
                    " ".join(tags),
                    " ".join(pack.get("styles", [])),
                    " ".join(pack.get("niches", [])),
                    lib_rel,
                    preview,
                    f.stat().st_size,
                    hashes.get(rel_in_pack, ""),
                    pack["id"],
                    pack.get("source", ""),
                    pack.get("license", ""),
                    pack.get("revision", ""),
                    CAPABILITY.get(kind, ""),
                    db.dumps({"pack_title": pack.get("title", ""), "notes": pack.get("notes", ""), "credit": pack.get("credit", "")}),
                )
            )
    with db.tx() as c:
        c.execute("DELETE FROM resources")
        c.execute("DELETE FROM resources_fts")
        c.executemany("INSERT INTO resources(id, kind, name, tags, styles, niches, path, preview, size, sha256, pack, source, license, revision, capability, meta_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
        c.executemany("INSERT INTO resources_fts(id, kind, name, tags, styles, niches, capability) VALUES(?,?,?,?,?,?,?)", [(r[0], r[1], r[2], r[3], r[4], r[5], r[14]) for r in rows])
    return {"resources": len(rows), "packs": len(list(root.glob("*/pack.json")))}


def _short(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r["id"], "kind": r["kind"], "name": r["name"], "tags": r["tags"].split()[:6], "pack": r["pack"], "license": r["license"],
        "preview": f"/media/library/{r['preview']}" if r["preview"] else "", "url": f"/media/library/{r['path']}", "size": r["size"], "capability": r["capability"],
    }


def search(q: str = "", kind: str = "", pack: str = "", limit: int = 20, offset: int = 0) -> dict[str, Any]:
    c = db.conn()
    limit = max(1, min(60, int(limit)))
    where, args = [], []
    if q.strip():
        where.append("r.id IN (SELECT id FROM resources_fts WHERE resources_fts MATCH ?)")
        args.append(fts_query(q))
    if kind:
        where.append("r.kind = ?")
        args.append(kind)
    if pack:
        where.append("r.pack = ?")
        args.append(pack)
    sql = "SELECT r.* FROM resources r" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY r.pack, r.name LIMIT ? OFFSET ?"
    rows = [db.row_to_dict(x) for x in c.execute(sql, args + [limit, offset]).fetchall()]
    total = c.execute("SELECT COUNT(*) FROM resources r" + (" WHERE " + " AND ".join(where) if where else ""), args).fetchone()[0]
    return {"items": [_short(r) for r in rows if r], "total": total, "offset": offset, "limit": limit, "next_offset": offset + limit if offset + limit < total else None}


def get_resource(rid: str) -> dict[str, Any]:
    r = db.row_to_dict(db.conn().execute("SELECT * FROM resources WHERE id = ?", (rid,)).fetchone())
    if not r:
        raise VRSError(f"Recurso não encontrado: {rid}", code="not_found", status=404)
    return r


def list_packs() -> list[dict[str, Any]]:
    out = []
    for pj in sorted(packs_dir().glob("*/pack.json")):
        p = json.loads(pj.read_text(encoding="utf-8"))
        cnt = db.conn().execute("SELECT COUNT(*), COALESCE(SUM(size),0) FROM resources WHERE pack = ?", (p["id"],)).fetchone()
        out.append({k: p.get(k, "") for k in ("id", "title", "source", "license", "revision", "notes", "styles", "credit")} | {"resources": cnt[0], "bytes": cnt[1]})
    return out


def _autotrim_png(dst: Path, src: Path, *, pad_ratio: float = 0.06) -> str:
    """Recorta margem transparente excessiva (ex.: renders isométricos Kenney 512² com objeto de ~30 px).

    Gera um derivado no projeto (o original da biblioteca não é alterado) e devolve a
    descrição da transformação para a procedência. Idempotente: parte sempre da origem.
    """
    from PIL import Image

    with Image.open(src) as im:
        rgba = im.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if not bbox:
        return ""
    w, h = rgba.size
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if bw * bh >= 0.45 * w * h:
        return ""
    pad = max(2, int(max(bw, bh) * pad_ratio))
    box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))
    out = rgba.crop(box)
    if max(out.size) < 256:  # amplia pixel-art/isométricos pequenos sem borrar
        k = max(1, 256 // max(out.size))
        out = out.resize((out.width * k, out.height * k), Image.Resampling.NEAREST)
    out.save(dst, optimize=True)
    return f"auto-trim de margem transparente {w}x{h}→recorte {box} → {out.width}x{out.height} (derivado; original intacto)"


def import_into_project(pid: str, rid: str) -> str:
    """Copia o recurso para assets/lib/ do projeto e registra procedência + hash. Retorna caminho relativo."""
    r = get_resource(rid)
    src = (settings().library / r["path"]).resolve()
    if settings().library.resolve() not in src.parents or not src.is_file():
        raise VRSError("Recurso com caminho inválido.", code="bad_path")
    rel = f"assets/lib/{r['pack']}/{slug(Path(r['path']).stem)}{src.suffix.lower()}"
    src_digest = sha256_file(src)
    if r["sha256"] and r["sha256"] != src_digest:
        raise VRSError(f"Hash divergente ao importar {rid}.", code="hash_mismatch")
    dst = projects.copy_into_project(pid, src, rel)
    transform = ""
    if r["kind"] in ("image", "pose") and src.suffix.lower() == ".png":
        transform = _autotrim_png(dst, src)
    digest = sha256_file(dst)
    prov_path = projects.project_dir(pid) / "assets" / "provenance.json"
    prov = read_json(prov_path, {}) or {}
    prov[rel] = {"resource_id": rid, "kind": r["kind"], "sha256": digest, "source_sha256": src_digest, "transform": transform, "size": dst.stat().st_size, "pack": r["pack"], "source": r["source"], "license": r["license"], "revision": r["revision"], "capability": r["capability"], "credit": (r.get("meta") or {}).get("credit", "")}
    write_json(prov_path, prov)
    projects.history(pid, "library_import", resource=rid, path=rel)
    return rel


# ---------------------------------------------------------------------------
# Instalação opt-in e retomável
# ---------------------------------------------------------------------------
def _write_pack(dst: Path, meta: dict[str, Any]) -> None:
    files = {}
    for f in sorted(dst.rglob("*")):
        if f.is_file() and f.name != "pack.json":
            files[f.relative_to(dst).as_posix()] = sha256_file(f)
    meta = {**meta, "files": files}
    write_json(dst / "pack.json", meta)


def install_from_local(src_root: Path, sources: Iterable[dict[str, Any]], *, max_pack_bytes: int = 160 * 1024 * 1024) -> list[dict[str, Any]]:
    """Copia seleções leves de uma instalação local existente (sem alterar a origem)."""
    report = []
    for s in sources:
        src = (src_root / s["from"]).resolve()
        dst = packs_dir() / s["id"]
        if not src.is_dir():
            report.append({"id": s["id"], "status": "ausente na origem"})
            continue
        if (dst / "pack.json").exists():
            report.append({"id": s["id"], "status": "já instalado"})
            continue
        dst.mkdir(parents=True, exist_ok=True)
        total = 0
        patterns = s.get("include", ["**/*"])
        exclude = [re.compile(x) for x in s.get("exclude", [])]
        for pat in patterns:
            for f in sorted(src.glob(pat)):
                if not f.is_file() or f.is_symlink():
                    continue
                rel = f.relative_to(src).as_posix()
                if any(e.search(rel) for e in exclude):
                    continue
                size = f.stat().st_size
                if size > MAX_FILE or total + size > max_pack_bytes:
                    continue
                out = dst / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                if not out.exists():
                    shutil.copy2(f, out)
                total += size
        meta = {k: v for k, v in s.items() if k not in ("from", "include", "exclude")}
        meta["installed_from"] = "instalação local anterior (cópia; origem preservada)"
        _write_pack(dst, meta)
        report.append({"id": s["id"], "status": "instalado", "bytes": total})
    return report


def safe_extract_zip(zpath: Path, dst: Path, *, max_total: int = 300 * 1024 * 1024, max_files: int = 5000) -> list[str]:
    """Extração segura: sem caminhos absolutos/`..`, sem symlinks, limites de tamanho e quantidade."""
    out = []
    dst_r = dst.resolve()
    with zipfile.ZipFile(zpath) as z:
        infos = z.infolist()
        if len(infos) > max_files:
            raise VRSError("ZIP com arquivos demais.", code="zip_limit")
        if sum(i.file_size for i in infos) > max_total:
            raise VRSError("ZIP grande demais após extração.", code="zip_limit")
        for i in infos:
            name = i.filename
            if name.endswith("/"):
                continue
            if name.startswith(("/", "\\")) or ".." in Path(name).parts or ":" in name:
                raise VRSError(f"Entrada perigosa no ZIP: {name}", code="zip_unsafe")
            if (i.external_attr >> 16) & 0o170000 == 0o120000:
                raise VRSError(f"Symlink no ZIP não é permitido: {name}", code="zip_unsafe")
            target = (dst_r / name).resolve()
            if dst_r not in target.parents:
                raise VRSError(f"Entrada fora do destino: {name}", code="zip_unsafe")
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(i) as fin, open(target, "wb") as fout:
                shutil.copyfileobj(fin, fout)
            out.append(name)
    return out


def download_verified(url: str, dst: Path, *, sha256: str, max_bytes: int) -> Path:
    """Download retomável com limite de tamanho e verificação de hash (somente via instalador opt-in)."""
    import httpx

    if not url.startswith("https://"):
        raise VRSError("Somente HTTPS.", code="bad_url")
    dst.parent.mkdir(parents=True, exist_ok=True)
    part = dst.with_suffix(dst.suffix + ".part")
    if dst.exists() and sha256_file(dst) == sha256:
        return dst
    headers = {}
    if part.exists():
        headers["Range"] = f"bytes={part.stat().st_size}-"
    with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=60) as r:
        if r.status_code not in (200, 206):
            raise VRSError(f"Download falhou: HTTP {r.status_code}", code="download_failed")
        mode = "ab" if r.status_code == 206 else "wb"
        with open(part, mode) as f:
            for chunk in r.iter_bytes(1 << 16):
                f.write(chunk)
                if f.tell() > max_bytes:
                    raise VRSError("Download excedeu o limite de tamanho.", code="download_limit")
    if sha256_file(part) != sha256:
        part.unlink(missing_ok=True)
        raise VRSError("Hash do download não confere; arquivo descartado.", code="hash_mismatch")
    part.replace(dst)
    return dst
