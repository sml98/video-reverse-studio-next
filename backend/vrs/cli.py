"""CLI `vrs` — mesmo core/fila da UI e do MCP."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path
from typing import Any

from .config import HOST, PORT, ROOT, limit_threads, settings


def _print(obj: Any) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2, default=str))


def cmd_serve(a: argparse.Namespace) -> None:
    import uvicorn

    from . import jobs
    from .api import app

    worker = jobs.Worker().start()
    try:
        uvicorn.run(app, host=HOST, port=PORT, log_level="warning", workers=1)
    finally:
        worker.stop()


def cmd_doctor(a: argparse.Namespace) -> None:
    from . import catalog, render, voice

    checks = []

    def ok(name: str, cond: bool, detail: str = "") -> None:
        checks.append({"check": name, "ok": bool(cond), "detail": detail})

    ok("python", sys.version_info >= (3, 10), sys.version.split()[0])
    for tool in ("ffmpeg", "ffprobe", "node"):
        ok(tool, bool(shutil.which(tool)), shutil.which(tool) or "ausente")
    ok("frontend node_modules", (ROOT / "frontend" / "node_modules" / "remotion").exists())
    ok("frontend compilado", (ROOT / "frontend" / "dist" / "index.html").exists())
    ok("kinocut (isolado)", bool(render.kinocut_bin()), render.kinocut_bin() or "ausente — fallback ffmpeg")
    vs = voice.list_voices()
    ok("vozes Piper", bool(vs), ", ".join(v["id"] for v in vs) or "nenhuma (scripts/install-assets.sh --voices)")
    try:
        import piper  # noqa: F401

        ok("piper-tts", True)
    except ImportError:
        ok("piper-tts", False)
    asr = [p.name for p in settings().asr_dir.glob("whisper-*") if (p / "model.bin").exists()]
    ok("ASR local (opcional)", True, ", ".join(asr) or "sem pesos — transcrição desativada (não baixa automaticamente)")
    ok("cenas", len(catalog.scenes()) >= 60, f"{len(catalog.scenes())} cenas")
    ok("nichos", len(catalog.niches()) >= 8, f"{len(catalog.niches())} modelos")
    ok("loopback", HOST == "127.0.0.1", f"{HOST}:{PORT}")
    free = shutil.disk_usage(settings().data).free / 1e9
    ok("disco livre", free > 3, f"{free:.1f} GB")
    try:
        import psutil  # type: ignore

        mem = psutil.virtual_memory().available / 1e9
        ok("RAM disponível", mem > 1.0, f"{mem:.1f} GB")
    except ImportError:
        try:
            avail = int([l for l in open("/proc/meminfo") if l.startswith("MemAvailable")][0].split()[1]) / 1e6
            ok("RAM disponível", avail > 1.0, f"{avail:.1f} GB")
        except Exception:
            pass
    _print({"ok": all(c["ok"] for c in checks if c["check"] not in ("frontend compilado",)), "checks": checks})


def cmd_status(a: argparse.Namespace) -> None:
    from . import workflow

    _print(workflow.status())


def cmd_create(a: argparse.Namespace) -> None:
    from . import workflow

    ref: dict[str, Any] = {"kind": a.reference_kind}
    if a.reference_kind == "library":
        ref["resource_id"] = a.reference
    elif a.reference_kind == "link":
        ref["url"] = a.reference
    res = workflow.start_creation(niche_id=a.niche, idea=a.idea, aspect=a.aspect, duration=a.duration, reference=ref, voice_id=a.voice, captions=a.captions, agent=a.agent, quality=a.quality, name=a.name or "")
    _print({"project_id": res["project"]["id"], "job_id": res["job"]["id"]})


def cmd_brief(a: argparse.Namespace) -> None:
    from . import workflow

    _print(workflow.agent_task(a.project))


def cmd_storyboard(a: argparse.Namespace) -> None:
    from . import workflow

    data = json.loads(Path(a.file).read_text(encoding="utf-8"))
    _print(workflow.submit_storyboard(a.project, data, render_after=not a.no_render))


def cmd_plan(a: argparse.Namespace) -> None:
    from . import workflow

    data = json.loads(Path(a.file).read_text(encoding="utf-8"))
    _print(workflow.submit_plan(a.project, data, render_after=not a.no_render))


def cmd_render(a: argparse.Namespace) -> None:
    from . import jobs

    _print(jobs.enqueue("render", a.project, {}))


def cmd_review(a: argparse.Namespace) -> None:
    from . import review

    rv = review.review_render(a.project, a.version)
    _print({k: rv[k] for k in ("version", "technical", "content", "errors", "findings", "motion", "audio", "contact_sheet")})


def cmd_jobs(a: argparse.Namespace) -> None:
    from . import jobs

    _print([{k: j[k] for k in ("id", "project_id", "kind", "state", "step", "progress", "error")} for j in jobs.list_jobs(a.project, 20)])


def cmd_wait(a: argparse.Namespace) -> None:
    from . import jobs

    t0 = time.time()
    while True:
        j = jobs.get(a.job)
        if j["state"] in ("done", "failed", "cancelled", "awaiting_agent"):
            _print({k: j[k] for k in ("id", "kind", "state", "step", "progress", "error", "result")})
            return
        if time.time() - t0 > a.timeout:
            _print({"timeout": True, "state": j["state"], "step": j["step"], "progress": j["progress"]})
            return
        time.sleep(2)


def cmd_worker(a: argparse.Namespace) -> None:
    from . import jobs

    if a.drain:
        _print({"processed": jobs.drain()})
        return
    w = jobs.Worker().start()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        w.stop()


def cmd_index(a: argparse.Namespace) -> None:
    from . import catalog, library

    _print({"library": library.index_library(), "catalog": catalog.index_catalog()})


def cmd_search(a: argparse.Namespace) -> None:
    from . import library

    _print(library.search(a.query, a.kind, "", a.limit))


def cmd_install_library(a: argparse.Namespace) -> None:
    from . import library

    src = Path(a.from_dir).expanduser()
    sources = json.loads((ROOT / "vendor" / "library-sources.json").read_text(encoding="utf-8"))
    if a.only:
        sources = [s for s in sources if s["id"] in a.only.split(",")]
    _print({"installed": library.install_from_local(src, sources), "index": library.index_library()})


def cmd_voice(a: argparse.Namespace) -> None:
    from . import voice

    info = voice.synthesize_cached(a.text, a.voice)
    _print({k: info[k] for k in ("wav", "duration_ms", "timing", "cached")} | {"words": info["words"][:30]})


def cmd_examples(a: argparse.Namespace) -> None:
    from . import jobs

    _print(jobs.enqueue("examples", None, {"niches": a.niches.split(",") if a.niches else []}))


def cmd_export(a: argparse.Namespace) -> None:
    from . import projects

    _print({"zip": str(projects.export_project(a.project))})


def cmd_schemas(a: argparse.Namespace) -> None:
    from .contracts import json_schemas
    from .util import write_json

    for name, schema in json_schemas().items():
        write_json(ROOT / "schemas" / name, schema)
    _print({"written": list(json_schemas())})


def main(argv: list[str] | None = None) -> None:
    limit_threads()
    p = argparse.ArgumentParser(prog="vrs", description="Video Reverse Studio (local, CPU)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("serve", help="servidor local 127.0.0.1:8765 + worker").set_defaults(fn=cmd_serve)
    sub.add_parser("doctor").set_defaults(fn=cmd_doctor)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    c = sub.add_parser("create", help="cria projeto a partir de um modelo de nicho")
    c.add_argument("--niche", required=True)
    c.add_argument("--idea", default="")
    c.add_argument("--aspect", default="landscape", choices=["landscape", "vertical", "square"])
    c.add_argument("--duration", type=float)
    c.add_argument("--reference-kind", default="niche_example", choices=["niche_example", "library", "link", "none"])
    c.add_argument("--reference", default="")
    c.add_argument("--voice", default="faber")
    c.add_argument("--captions", default="word", choices=["word", "phrase", "off"])
    c.add_argument("--agent", default="mcp")
    c.add_argument("--quality", default="final", choices=["final", "preview"])
    c.add_argument("--name")
    c.set_defaults(fn=cmd_create)
    b = sub.add_parser("brief")
    b.add_argument("project")
    b.set_defaults(fn=cmd_brief)
    s = sub.add_parser("storyboard", help="envia storyboard JSON")
    s.add_argument("project")
    s.add_argument("file")
    s.add_argument("--no-render", action="store_true")
    s.set_defaults(fn=cmd_storyboard)
    pl = sub.add_parser("plan", help="envia FilmPlan JSON")
    pl.add_argument("project")
    pl.add_argument("file")
    pl.add_argument("--no-render", action="store_true")
    pl.set_defaults(fn=cmd_plan)
    r = sub.add_parser("render")
    r.add_argument("project")
    r.set_defaults(fn=cmd_render)
    rv = sub.add_parser("review")
    rv.add_argument("project")
    rv.add_argument("--version", type=int)
    rv.set_defaults(fn=cmd_review)
    j = sub.add_parser("jobs")
    j.add_argument("--project")
    j.set_defaults(fn=cmd_jobs)
    w = sub.add_parser("wait")
    w.add_argument("job")
    w.add_argument("--timeout", type=float, default=3600)
    w.set_defaults(fn=cmd_wait)
    wk = sub.add_parser("worker")
    wk.add_argument("--drain", action="store_true")
    wk.set_defaults(fn=cmd_worker)
    sub.add_parser("index").set_defaults(fn=cmd_index)
    se = sub.add_parser("search")
    se.add_argument("query", nargs="?", default="")
    se.add_argument("--kind", default="")
    se.add_argument("--limit", type=int, default=20)
    se.set_defaults(fn=cmd_search)
    il = sub.add_parser("install-library", help="copia packs leves de uma instalação local (opt-in)")
    il.add_argument("--from-dir", default="~/video-reverse-studio/data/library/packs")
    il.add_argument("--only", default="")
    il.set_defaults(fn=cmd_install_library)
    v = sub.add_parser("voice")
    v.add_argument("text")
    v.add_argument("--voice", default="faber")
    v.set_defaults(fn=cmd_voice)
    ex = sub.add_parser("examples")
    ex.add_argument("--niches", default="")
    ex.set_defaults(fn=cmd_examples)
    e = sub.add_parser("export")
    e.add_argument("project")
    e.set_defaults(fn=cmd_export)
    sub.add_parser("schemas").set_defaults(fn=cmd_schemas)
    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
