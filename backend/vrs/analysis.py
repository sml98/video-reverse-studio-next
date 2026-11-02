"""Referência: importação imutável (upload, biblioteca, link público, exemplo) e análise medida.

Medidas (ffprobe/ffmpeg/numpy, ASR/OCR locais opcionais) ficam separadas da
interpretação, que é responsabilidade do agente. O brief compacto (<12 KB) aponta
para evidências detalhadas lidas sob demanda por ID.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import stat
from pathlib import Path
from typing import Any, Callable

import numpy as np
from PIL import Image

from . import db, projects
from .config import settings
from .util import VRSError, read_json, run, sanitize, sha256_file, sha256_text, which, write_json

ANALYSIS_VERSION = "analysis-2"
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}
MAX_LINK_BYTES = 400 * 1024 * 1024
Progress = Callable[[str, float], None]


# ---------------------------------------------------------------------------
# Importação
# ---------------------------------------------------------------------------
def _store_original(pid: str, src: Path, meta: dict[str, Any], *, move: bool = False) -> dict[str, Any]:
    ext = src.suffix.lower()
    if ext not in VIDEO_EXT:
        raise VRSError(f"Formato de vídeo não suportado: {ext or '?'} (use MP4, WebM ou MOV).", code="bad_format")
    rdir = projects.project_dir(pid) / "reference"
    rdir.mkdir(exist_ok=True)
    dst = rdir / f"original{ext}"
    if dst.exists():
        os.chmod(dst, stat.S_IRUSR | stat.S_IWUSR)
        dst.unlink()
    (shutil.move if move else shutil.copy2)(str(src), str(dst))
    os.chmod(dst, stat.S_IRUSR | stat.S_IRGRP)  # imutável para o app
    ref = {**meta, "file": f"reference/{dst.name}", "sha256": sha256_file(dst), "size": dst.stat().st_size}
    write_json(rdir / "reference.json", ref)
    projects.update_project(pid, reference=ref)
    projects.history(pid, "reference_imported", ref_kind=meta.get("kind"), sha256=ref["sha256"])
    return ref


def import_upload(pid: str, tmp_path: Path, filename: str) -> dict[str, Any]:
    return _store_original(pid, tmp_path, {"kind": "upload", "filename": Path(filename).name[:200], "license": "fornecido pelo usuário — redistribuição não presumida", "redistributable": False}, move=True)


def import_library(pid: str, resource_id: str) -> dict[str, Any]:
    from .library import get_resource

    r = get_resource(resource_id)
    if r["kind"] != "video":
        raise VRSError("O recurso escolhido não é um vídeo.", code="bad_kind")
    src = settings().library / r["path"]
    return _store_original(pid, src, {"kind": "library", "resource_id": resource_id, "source": r["source"], "license": r["license"], "credit": (r.get("meta") or {}).get("credit", ""), "redistributable": False})


def import_example(pid: str, niche_id: str) -> dict[str, Any]:
    src = settings().data / "examples" / niche_id / "example.mp4"
    if not src.exists():
        raise VRSError("O exemplo deste modelo ainda não foi gerado (scripts/build-examples.sh).", code="no_example")
    return _store_original(pid, src, {"kind": "niche_example", "niche": niche_id, "license": "Projeto VRS", "redistributable": True})


def import_link(pid: str, url: str, progress: Progress | None = None) -> dict[str, Any]:
    """Link público via yt-dlp: sem cookies, sem login, sem contornar DRM; limite de tamanho."""
    if not re.match(r"^https?://[^\s/$.?#].[^\s]*$", url or ""):
        raise VRSError("Link inválido.", code="bad_url")
    if re.match(r"^https?://(localhost|127\.|10\.|192\.168\.|169\.254\.|\[::1\])", url):
        raise VRSError("Links para a rede local não são aceitos.", code="bad_url")
    try:
        import yt_dlp
    except ImportError as e:
        raise VRSError("yt-dlp não instalado (pip install '.[links]').", code="missing_dep") from e
    tmp = settings().inputs / f"dl-{pid}"
    tmp.mkdir(parents=True, exist_ok=True)

    def hook(d: dict[str, Any]) -> None:
        if progress and d.get("status") == "downloading" and d.get("total_bytes"):
            progress("baixando link público", d.get("downloaded_bytes", 0) / d["total_bytes"])

    opts = {
        "outtmpl": str(tmp / "video.%(ext)s"),
        "format": "best[ext=mp4][height<=720]/best[height<=720]/best",
        "noplaylist": True,
        "max_filesize": MAX_LINK_BYTES,
        "quiet": True,
        "no_warnings": True,
        "cookiefile": None,
        "progress_hooks": [hook],
        "match_filter": yt_dlp.utils.match_filter_func("duration < 1800"),
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as e:  # yt-dlp levanta vários tipos
        raise VRSError(f"Não foi possível baixar o link (público, sem login): {sanitize(str(e), 300)}", code="download_failed") from e
    files = [f for f in tmp.iterdir() if f.suffix.lower() in VIDEO_EXT]
    if not files:
        raise VRSError("O link não produziu um vídeo suportado.", code="download_failed")
    ref = _store_original(pid, files[0], {"kind": "link", "url": url[:500], "title": (info or {}).get("title", "")[:200], "uploader": (info or {}).get("uploader", "")[:120], "license": (info or {}).get("license") or "não informada — uso apenas como referência", "redistributable": False}, move=True)
    shutil.rmtree(tmp, ignore_errors=True)
    return ref


# ---------------------------------------------------------------------------
# Análise
# ---------------------------------------------------------------------------
def _probe(path: Path) -> dict[str, Any]:
    from .review import probe

    return probe(path)


def _cuts(path: Path, threshold: float = 0.32) -> list[float]:
    proc = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-an", "-vf", f"scale=320:-2,select='gt(scene\\,{threshold})',showinfo", "-f", "null", "-"], timeout=1800, check=False)
    return [round(float(x), 3) for x in re.findall(r"pts_time:([\d.]+)", proc.stderr.decode("utf-8", "replace"))]


def _sample_gray(path: Path, fps: float, width: int = 64) -> tuple[np.ndarray, int, int]:
    proc = run(["ffmpeg", "-v", "error", "-i", str(path), "-an", "-vf", f"fps={fps},scale={width}:-2,format=gray", "-f", "rawvideo", "-"], timeout=1800)
    raw = np.frombuffer(proc.stdout, dtype=np.uint8)
    # descobrir altura pela razão de aspecto
    info = _probe(path)["video"] or {"width": 16, "height": 9}
    h = int(round(width * info["height"] / info["width"] / 2) * 2)
    n = len(raw) // (width * h)
    return raw[: n * width * h].reshape(n, h, width).astype(np.float32), width, h


def _frame(path: Path, t: float, out: Path, width: int = 384) -> bool:
    try:
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t):.3f}", "-i", str(path), "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "4", str(out)], timeout=60)
        return out.exists()
    except VRSError:
        return False


def _palette(paths: list[Path], k: int = 6) -> list[dict[str, Any]]:
    if not paths:
        return []
    ims = [Image.open(p).convert("RGB").resize((96, 54)) for p in paths[:12]]
    strip = Image.new("RGB", (96, 54 * len(ims)))
    for i, im in enumerate(ims):
        strip.paste(im, (0, 54 * i))
    q = strip.quantize(colors=k, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: k * 3]
    counts = sorted(q.getcolors(), reverse=True)
    total = sum(c for c, _ in counts) or 1
    return [{"hex": "#%02x%02x%02x" % tuple(pal[i * 3 : i * 3 + 3]), "share": round(c / total, 3)} for c, i in counts]


def _asr(audio_src: Path, language: str | None) -> dict[str, Any]:
    import wave

    model_dir = next((settings().asr_dir / m for m in ("whisper-base", "whisper-tiny") if (settings().asr_dir / m / "model.bin").exists()), None)
    if not model_dir:
        return {"available": False, "reason": "Sem pesos ASR locais em .tools/asr (nada é baixado automaticamente)."}
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return {"available": False, "reason": "faster-whisper não instalado."}
    with wave.open(str(audio_src), "rb") as wf:
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    model = WhisperModel(str(model_dir), device="cpu", compute_type="int8", cpu_threads=settings().threads, num_workers=1)
    segs, info = model.transcribe(pcm, language=language, beam_size=1, vad_filter=False, word_timestamps=False)
    out = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs]
    return {"available": True, "model": model_dir.name, "language": info.language, "language_probability": round(info.language_probability, 2), "precision": "asr_estimated", "segments": out}


def _ocr(paths: list[Path]) -> dict[str, Any]:
    tess = os.environ.get("VRS_TESSERACT") or which("tesseract") or (str(settings().tools / "bin" / "tesseract") if (settings().tools / "bin" / "tesseract").exists() else None)
    if not tess:
        return {"available": False, "reason": "Tesseract não encontrado."}
    extra_env: dict[str, str] = {}
    tlib = settings().tools / "usr/lib/x86_64-linux-gnu"
    tdata = settings().tools / "usr/share/tesseract-ocr/5/tessdata"
    if tlib.exists():
        extra_env["LD_LIBRARY_PATH"] = f"{tlib}:{os.environ.get('LD_LIBRARY_PATH', '')}"
    if tdata.exists():
        extra_env["TESSDATA_PREFIX"] = str(tdata)
    texts = []
    for p in paths[:10]:
        try:
            proc = run([tess, str(p), "-", "-l", "por+eng", "--psm", "11"], timeout=60, check=False, env=extra_env or None)
            t = re.sub(r"\s+", " ", proc.stdout.decode("utf-8", "replace")).strip()
            words = [w for w in t.split() if len(w) > 2 and re.search(r"[A-Za-zÀ-ÿ]", w)]
            if len(words) >= 2:
                texts.append({"frame": p.name, "text": " ".join(words)[:200]})
        except VRSError:
            continue
    return {"available": True, "items": texts, "note": "OCR aproximado em quadros reduzidos."}


def analyze(pid: str, *, progress: Progress | None = None) -> dict[str, Any]:
    p = projects.get_project(pid)
    ref = p.get("reference") or {}
    if not ref.get("file"):
        raise VRSError("Projeto sem referência importada.", code="no_reference")
    src = projects.resolve(pid, ref["file"])
    key = sha256_text(ANALYSIS_VERSION, ref["sha256"])
    cache = settings().cache / "analysis" / key
    pdir = projects.project_dir(pid)
    edir = pdir / "evidence"
    if (cache / "brief.json").exists():
        shutil.copytree(cache, edir, dirs_exist_ok=True)
        brief = read_json(edir / "brief.json")
        write_json(pdir / "brief.json", brief)
        db.record_metric("analysis_cache_hit", 1, pid)
        return {"cached": True, "brief_bytes": len(json.dumps(brief, ensure_ascii=False).encode())}
    edir.mkdir(exist_ok=True)
    (edir / "frames").mkdir(exist_ok=True)
    say = progress or (lambda *_: None)

    say("metadados", 0.02)
    meta = _probe(src)
    dur = meta["duration"]
    write_json(edir / "metadata.json", meta)

    say("cortes e ritmo", 0.1)
    cuts = [c for c in _cuts(src) if 0.2 < c < dur - 0.2]
    bounds = [0.0] + cuts + [dur]
    shots = [{"id": f"shot-{i + 1}", "start": round(a, 2), "end": round(b, 2), "dur": round(b - a, 2)} for i, (a, b) in enumerate(zip(bounds, bounds[1:]))]
    lens = [s["dur"] for s in shots] or [dur]
    rhythm = {
        "shots": len(shots),
        "avg_shot_s": round(float(np.mean(lens)), 2),
        "median_shot_s": round(float(np.median(lens)), 2),
        "cuts_per_min": round(len(cuts) / max(dur / 60, 1e-6), 1),
        "first_cut_s": cuts[0] if cuts else None,
        "pacing": "rápido" if np.median(lens) < 2.5 else "médio" if np.median(lens) < 6 else "lento",
        "method": "ffmpeg scene>0.32 em 320px (candidatos; dissolves podem não ser detectados)",
    }
    write_json(edir / "shots.json", {"shots": shots, "rhythm": rhythm})

    say("quadros representativos", 0.3)
    frames = []
    for t in (0.5, 1.5, 2.8):
        if t < dur:
            f = edir / "frames" / f"hook-{t:.1f}.jpg"
            if _frame(src, t, f):
                frames.append({"id": f.stem, "t": t, "role": "gancho (primeiros segundos)", "path": f"evidence/frames/{f.name}"})
    step = max(1, len(shots) // 18)
    for s in shots[::step][:18]:
        t = (s["start"] + s["end"]) / 2
        f = edir / "frames" / f"{s['id']}.jpg"
        if _frame(src, t, f):
            frames.append({"id": f.stem, "t": round(t, 2), "role": "meio do plano", "path": f"evidence/frames/{f.name}"})
    from .review import _contact_sheet

    _contact_sheet([pdir / fr["path"] for fr in frames], edir / "contact-sheet.jpg", cols=5, tw=256)
    write_json(edir / "frames.json", {"frames": frames})

    say("paleta, composição e movimento", 0.45)
    palette = _palette([pdir / fr["path"] for fr in frames])
    arr, gw, gh = _sample_gray(src, 2.0)
    motion_ts = [round(float(np.mean(np.abs(arr[i + 1] - arr[i]))), 2) for i in range(len(arr) - 1)]
    edges = np.abs(np.diff(arr, axis=2))[:, :, :].mean(axis=0) if len(arr) else np.zeros((gh, gw - 1))
    grid = [[round(float(edges[r * edges.shape[0] // 3 : (r + 1) * edges.shape[0] // 3, c * edges.shape[1] // 3 : (c + 1) * edges.shape[1] // 3].mean()), 1) for c in range(3)] for r in range(3)]
    motion = {
        "per_half_second": motion_ts,
        "mean": round(float(np.mean(motion_ts)) if motion_ts else 0, 2),
        "peaks_s": [round(i / 2, 1) for i in np.argsort(motion_ts)[-5:][::-1]] if motion_ts else [],
        "detail_grid_3x3": grid,
        "method": "diferença absoluta média de luminância (64px, 2 fps); estimativa visual, não fluxo óptico",
    }
    write_json(edir / "visual.json", {"palette": palette, "motion": motion})

    say("áudio", 0.6)
    audio: dict[str, Any] = {"present": bool(meta["audio"])}
    wav = settings().cache / "tmp" / f"{pid}-ref.wav"
    if meta["audio"]:
        wav.parent.mkdir(parents=True, exist_ok=True)
        run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(wav)], timeout=600)
        proc = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(wav), "-af", "silencedetect=n=-38dB:d=0.4,ebur128", "-f", "null", "-"], timeout=600, check=False)
        err = proc.stderr.decode("utf-8", "replace")
        ss = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
        se = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
        silent = sum(max(0, (se[i] if i < len(se) else dur) - ss[i]) for i in range(len(ss)))
        lufs = re.findall(r"I:\s+([\-\d.]+) LUFS", err)
        audio.update({"non_silent_ratio": round(1 - silent / max(dur, 1e-6), 2), "pauses": len(ss), "integrated_lufs": float(lufs[-1]) if lufs else None, "method": "silencedetect -38 dB/0.4 s; não identifica música nem falantes"})
    write_json(edir / "audio.json", audio)

    say("transcrição local (se houver pesos)", 0.7)
    transcript = _asr(wav, None) if meta["audio"] and wav.exists() else {"available": False, "reason": "sem áudio"}
    write_json(edir / "transcript.json", transcript)
    wav.unlink(missing_ok=True)

    say("OCR (se disponível)", 0.88)
    ocr = _ocr([pdir / fr["path"] for fr in frames])
    write_json(edir / "ocr.json", ocr)

    say("brief compacto", 0.95)
    text = " ".join(s["text"] for s in transcript.get("segments", []))
    brief = {
        "schema": "vrs.brief/1",
        "reference": {k: ref.get(k) for k in ("kind", "title", "source", "license", "credit", "url", "filename") if ref.get(k)},
        "measured": {
            "duration_s": round(dur, 2),
            "video": meta["video"],
            "audio": {k: audio.get(k) for k in ("present", "non_silent_ratio", "pauses", "integrated_lufs")},
            "rhythm": {k: v for k, v in rhythm.items() if k != "method"},
            "shots_sample": [{"id": s["id"], "start": s["start"], "dur": s["dur"]} for s in shots[:24]],
            "hook_frames": [f["id"] for f in frames if f["role"].startswith("gancho")],
            "palette": [c["hex"] for c in palette],
            "motion_mean": motion["mean"],
            "motion_peaks_s": motion["peaks_s"],
            "detail_grid_3x3": grid,
            "transcript_excerpt": (text[:1400] + ("…" if len(text) > 1400 else "")) if text else None,
            "transcript_language": transcript.get("language"),
            "transcript_precision": "asr_estimated" if transcript.get("available") else None,
            "ocr_excerpt": [o["text"][:80] for o in ocr.get("items", [])[:6]],
        },
        "interpretation": None,
        "evidence_ids": ["metadata", "shots", "frames", "visual", "audio", "transcript", "ocr", "contact-sheet"],
        "how_to_use": "A referência orienta estrutura, ritmo e mecanismos visuais. Escreva conteúdo NOVO para a ideia do projeto; não reutilize imagens/assunto nem os tempos da fala antiga.",
        "limits": [
            "Cortes e movimento são estimativas; não recuperam projeto 3D, geometria oculta, identidade da música nem retenção de audiência.",
            "Transcrição (se houver) é ASR estimado, não alinhamento forçado.",
        ],
    }
    write_json(edir / "brief.json", brief)
    write_json(pdir / "brief.json", brief)
    cache.mkdir(parents=True, exist_ok=True)
    shutil.copytree(edir, cache, dirs_exist_ok=True)
    size = len(json.dumps(brief, ensure_ascii=False).encode())
    db.record_metric("brief_bytes", size, pid)
    projects.history(pid, "analyzed", shots=len(shots), brief_bytes=size)
    return {"cached": False, "brief_bytes": size, "shots": len(shots)}


def read_evidence(pid: str, evidence_id: str) -> Any:
    if not re.fullmatch(r"[a-z\-]{2,30}", evidence_id or ""):
        raise VRSError("ID de evidência inválido.")
    if evidence_id == "contact-sheet":
        return {"image": "evidence/contact-sheet.jpg"}
    data = read_json(projects.project_dir(pid) / "evidence" / f"{evidence_id}.json")
    if data is None:
        raise VRSError("Evidência não encontrada (rode a análise).", code="not_found", status=404)
    return data
