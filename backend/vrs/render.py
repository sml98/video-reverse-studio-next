"""Render: cache por cena → concatenação → áudio (voz, música com ducking, SFX) → MP4 + legendas."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Callable

import numpy as np

from . import ENGINE_VERSION, db, projects
from .config import settings
from .contracts import FilmPlan
from .util import VRSError, read_json, run, sanitize, sha256_file, sha256_text, which, write_json
from .voice import read_wav, write_wav

Progress = Callable[[str, float], None]
NODE_RENDER = "frontend/render/render.mjs"


def kinocut_bin() -> str | None:
    p = settings().tools / "kinocut-venv" / "bin" / "kino"
    return str(p) if p.exists() else which("kino")


_src_hash: tuple[float, str] | None = None


def frontend_source_hash() -> str:
    global _src_hash
    root = settings().frontend_dir
    newest = max((f.stat().st_mtime for d in ("src/remotion", "src/contracts", "public/fonts") for f in (root / d).rglob("*") if f.is_file()), default=0)
    if _src_hash and _src_hash[0] == newest:
        return _src_hash[1]
    out = run(["node", str(root / "render" / "source-hash.mjs")], timeout=60).stdout.decode().strip()
    _src_hash = (newest, out)
    return out


def _asset_files(pid: str, scene: dict[str, Any]) -> dict[str, str]:
    files = {}
    for rel in scene.get("assets", {}):
        p = projects.resolve(pid, rel)
        if not p.is_file():
            raise VRSError(f"Recurso ausente: {rel}", code="missing_asset")
        files[rel] = str(p)
    for layer in scene.get("layers", []):
        if layer.get("src"):
            files[layer["src"]] = str(projects.resolve(pid, layer["src"]))
    return files


def scene_cache_key(pid: str, plan: dict[str, Any], scene: dict[str, Any], src_hash: str) -> str:
    asset_hashes = {rel: sha256_file(Path(p)) for rel, p in sorted(_asset_files(pid, scene).items())}
    canvas = {k: plan[k] for k in ("width", "height", "fps", "theme", "captions")}
    return sha256_text("scene", ENGINE_VERSION, src_hash, canvas, scene, asset_hashes)


def _run_node(job: dict[str, Any], progress: Progress | None, label: str, total_jobs: int, cancel: Callable[[], bool] | None) -> list[dict[str, Any]]:
    jf = settings().cache / "jobs" / f"render-{os.getpid()}-{int(time.time() * 1000)}.json"
    write_json(jf, job)
    env = os.environ.copy()
    env.setdefault("NODE_OPTIONS", "--max-old-space-size=1536")
    proc = subprocess.Popen(["node", str(settings().root / NODE_RENDER), str(jf)], cwd=str(settings().frontend_dir), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True)
    events: list[dict[str, Any]] = []
    err_tail: list[str] = []
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        events.append(ev)
        if ev.get("event") == "progress" and progress:
            progress(f"{label}: cena {ev['job'] + 1}/{total_jobs}", (ev["job"] + ev["progress"]) / max(1, total_jobs))
        elif ev.get("event") == "stage" and progress:
            progress(f"{label}: {'preparando composição' if ev['stage'] == 'bundle' else 'navegador headless'}", 0)
        if cancel and cancel():
            proc.kill()
            raise VRSError("Render cancelado.", code="cancelled")
    proc.wait()
    if proc.stderr:
        err_tail = proc.stderr.read().splitlines()[-30:]
    jf.unlink(missing_ok=True)
    if proc.returncode != 0:
        msg = next((e["message"] for e in events if e.get("event") == "error"), "\n".join(err_tail))
        raise VRSError(f"Render da composição falhou: {sanitize(msg, 1500)}", code="render_failed")
    return events


def render_scenes(pid: str, plan: dict[str, Any], *, progress: Progress | None = None, cancel: Callable[[], bool] | None = None, concurrency: int | None = None) -> dict[str, Any]:
    src = frontend_source_hash()
    cache_dir = settings().cache / "scenes"
    cache_dir.mkdir(parents=True, exist_ok=True)
    plan_props = FilmPlan.model_validate(plan).model_dump(by_alias=True)
    todo, segments, reused = [], [], []
    for sc in plan["scenes"]:
        key = scene_cache_key(pid, plan, sc, src)
        out = cache_dir / f"{key}.mp4"
        segments.append(str(out))
        if out.exists() and out.stat().st_size > 0:
            reused.append(sc["id"])
            continue
        # Plano mínimo por cena: só a cena alvo (menor payload, mesmo componente do Player).
        sub = {**plan_props, "scenes": [sc]}
        todo.append({"composition": "VrsScene", "out": str(out), "assetFiles": _asset_files(pid, sc), "props": {"plan": sub, "sceneId": sc["id"]}, "_scene": sc["id"]})
    t0 = time.time()
    if todo:
        job = {"cacheDir": str(settings().cache / "remotion"), "concurrency": concurrency or int(os.environ.get("VRS_REMOTION_CONCURRENCY", "2")), "jobs": [{k: v for k, v in j.items() if not k.startswith("_")} for j in todo]}
        _run_node(job, progress, "animação", len(todo), cancel)
    db.record_metric("scenes_rendered", len(todo), pid, seconds=round(time.time() - t0, 1))
    db.record_metric("scenes_reused", len(reused), pid)
    return {"segments": segments, "rendered": [j["_scene"] for j in todo], "reused": reused, "seconds": round(time.time() - t0, 1), "source_hash": src}


def concat_segments(segments: list[str], out: Path) -> Path:
    lst = out.with_suffix(".txt")
    lst.write_text("".join(f"file '{s}'\n" for s in segments))
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(out)], timeout=600)
    lst.unlink(missing_ok=True)
    return out


def build_narration(pid: str, plan: dict[str, Any], out: Path) -> dict[str, Any] | None:
    """Posiciona a voz de cada cena no tempo absoluto do filme (tempos da voz NOVA)."""
    timings = read_json(projects.project_dir(pid) / "voice" / "timings.json", {}) or {}
    if not timings:
        return None
    total_s = sum(s["durationInFrames"] for s in plan["scenes"]) / plan["fps"]
    clips: list[tuple[int, np.ndarray]] = []
    sr = 0
    offset_frames = 0
    placed = []
    for sc in plan["scenes"]:
        t = timings.get(sc["id"])
        if t:
            data, wsr = read_wav(projects.resolve(pid, t["wav"]))
            if sr and wsr != sr:
                raise VRSError("Vozes com taxas de amostragem diferentes no mesmo filme.", code="voice_mismatch")
            sr = wsr
            start_s = offset_frames / plan["fps"] + t["offset_ms"] / 1000
            clips.append((int(start_s * sr), data))
            placed.append({"scene": sc["id"], "start_s": round(start_s, 3), "dur_s": round(len(data) / sr, 3)})
        offset_frames += sc["durationInFrames"]
    track = np.zeros(int(total_s * sr), dtype=np.float32)
    for start, data in clips:
        end = min(len(track), start + len(data))
        track[start:end] += data[: end - start].astype(np.float32)
    write_wav(out, np.clip(track, -32768, 32767).astype(np.int16), sr)
    return {"path": str(out), "placed": placed, "sample_rate": sr}


def mix_audio(pid: str, plan: dict[str, Any], narration: Path | None, out: Path) -> dict[str, Any]:
    total = sum(s["durationInFrames"] for s in plan["scenes"]) / plan["fps"]
    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []
    idx = 0
    if narration:
        inputs += ["-i", str(narration)]
        filters.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[voice][sc]")
        labels.append("[voice]")
        voice_idx = idx
        idx += 1
    music = plan["audio"].get("music")
    if music:
        inputs += ["-stream_loop", "-1", "-i", str(projects.resolve(pid, music))]
        vol = plan["audio"].get("musicVolume", 0.12)
        filters.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},atrim=0:{total:.3f},afade=t=in:d=1,afade=t=out:st={max(0, total - 1.5):.3f}:d=1.5[mus]")
        if narration and plan["audio"].get("duck", True):
            filters.append("[mus][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]")
            labels.append("[duck]")
        else:
            labels.append("[mus]")
        idx += 1
    elif narration:
        filters.append("[sc]anullsink")
    off = 0.0
    for sc in plan["scenes"]:
        for fx in sc.get("sfx", []):
            p = projects.resolve(pid, fx["path"])
            inputs += ["-i", str(p)]
            at = int((off + float(fx.get("at_ms", 0)) / 1000) * 1000)
            filters.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume={float(fx.get('volume', 0.5))},adelay={at}|{at}[fx{idx}]")
            labels.append(f"[fx{idx}]")
            idx += 1
        off += sc["durationInFrames"] / plan["fps"]
    if not labels:
        run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", f"{total:.3f}", str(out)], timeout=120)
        return {"silent": True}
    filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=longest,apad,atrim=0:{total:.3f}[out]")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[out]", "-ar", "48000", str(out)], timeout=600)
    return {"silent": False, "music": bool(music)}


def write_captions(plan: dict[str, Any], out_dir: Path) -> dict[str, str]:
    lines = []
    off_ms = 0
    for sc in plan["scenes"]:
        cur: list[dict[str, Any]] = []
        for w in sc["words"] + [None]:  # type: ignore[list-item]
            if w is not None and (not cur or (len(cur) < 7 and w["start"] - cur[-1]["end"] < 500 and not cur[-1]["word"].endswith((".", "!", "?")))):
                cur.append(w)
                continue
            if cur:
                lines.append((off_ms + cur[0]["start"], off_ms + cur[-1]["end"], " ".join(x["word"] for x in cur), sc["timing"]))
            cur = [w] if w is not None else []
        off_ms += round(sc["durationInFrames"] * 1000 / plan["fps"])

    def ts(ms: int, sep: str) -> str:
        h, ms = divmod(int(ms), 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"

    srt = "".join(f"{i + 1}\n{ts(a, ',')} --> {ts(b, ',')}\n{t}\n\n" for i, (a, b, t, _) in enumerate(lines))
    vtt = "WEBVTT\n\n" + "".join(f"{ts(a, '.')} --> {ts(b, '.')}\n{t}\n\n" for a, b, t, _ in lines)
    (out_dir / "captions.srt").write_text(srt, encoding="utf-8")
    (out_dir / "captions.vtt").write_text(vtt, encoding="utf-8")
    words = []
    off = 0
    for sc in plan["scenes"]:
        words += [{**w, "id": f"{sc['id']}-{w['id']}", "start": w["start"] + off, "end": w["end"] + off} for w in sc["words"]]
        off += round(sc["durationInFrames"] * 1000 / plan["fps"])
    write_json(out_dir / "words.json", {"schema": "vrs.words/1", "precision": sorted({sc["timing"] for sc in plan["scenes"] if sc["words"]}), "words": words})
    return {"srt": "captions.srt", "vtt": "captions.vtt", "words": "words.json"}


def normalize(mux: Path, out: Path) -> dict[str, Any]:
    kino = kinocut_bin()
    if kino:
        try:
            run([kino, "normalize-audio", str(mux), "-l", "-16", "--true-peak-dbtp", "-1.5", "--fade-seconds", "0.03", "-o", str(out)], timeout=900)
            if out.exists() and out.stat().st_size > 0:
                return {"normalizer": "kinocut normalize-audio", "lufs_target": -16}
        except VRSError as e:
            fallback_reason = str(e)
        else:
            fallback_reason = "saída vazia"
    else:
        fallback_reason = "Kinocut indisponível"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(mux), "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)], timeout=900)
    return {"normalizer": "ffmpeg loudnorm (alternativa)", "lufs_target": -16, "reason": sanitize(fallback_reason, 300)}


def render_project(pid: str, *, progress: Progress | None = None, cancel: Callable[[], bool] | None = None) -> dict[str, Any]:
    plan = projects.load(pid, "plan")
    if not plan:
        raise VRSError("Projeto sem plano. Envie um storyboard ou plano antes de renderizar.", code="no_plan")
    plan = FilmPlan.model_validate(plan).model_dump(by_alias=True)
    t0 = time.time()
    scenes = render_scenes(pid, plan, progress=progress, cancel=cancel)
    if progress:
        progress("montagem: concatenando cenas", 0.0)
    rdir = projects.next_render_dir(pid)
    video = concat_segments(scenes["segments"], rdir / "video.mp4")
    if progress:
        progress("montagem: áudio", 0.3)
    narr = build_narration(pid, plan, rdir / "narration.wav")
    audio = rdir / "audio.wav"
    mix = mix_audio(pid, plan, Path(narr["path"]) if narr else None, audio)
    total = sum(s["durationInFrames"] for s in plan["scenes"]) / plan["fps"]
    mux = rdir / "mux.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", f"{total:.3f}", "-movflags", "+faststart", str(mux)], timeout=600)
    if progress:
        progress("montagem: normalização de áudio", 0.6)
    norm = normalize(mux, rdir / "final.mp4")
    caps = write_captions(plan, rdir)
    write_json(rdir / "plan.json", plan)
    for tmp in (mux, audio, video):
        tmp.unlink(missing_ok=True)
    info = {
        "render_dir": str(rdir.relative_to(projects.project_dir(pid))),
        "mp4": str((rdir / "final.mp4").relative_to(projects.project_dir(pid))),
        "duration_s": round(total, 3),
        "scenes": scenes,
        "audio": {"narration": bool(narr), **mix, **norm},
        "captions": caps,
        "seconds": round(time.time() - t0, 1),
    }
    write_json(rdir / "render.json", info)
    projects.history(pid, "rendered", version=rdir.name, reused=len(scenes["reused"]), rendered=len(scenes["rendered"]))
    return info
