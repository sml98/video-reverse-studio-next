"""API HTTP local (127.0.0.1:8765). Mesma camada de serviço que MCP e CLI."""
from __future__ import annotations

import mimetypes
import shutil
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from . import agents, analysis, catalog, jobs, library, projects, review, sogni, voice, workflow
from .config import ALLOWED_ORIGINS, settings
from .util import VRSError, new_id, safe_join

MEDIA_EXT = {".mp4", ".webm", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".wav", ".mp3", ".ogg", ".srt", ".vtt", ".glb", ".gltf", ".bin", ".json"}
PROJECT_JSON_OK = {"plan.json", "storyboard.json", "brief.json", "review.json", "render.json", "words.json", "provenance.json", "timings.json", "reference.json"}
MAX_UPLOAD = 600 * 1024 * 1024

app = FastAPI(title="Video Reverse Studio", version="1.0.0", docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")


@app.middleware("http")
async def guard(request: Request, call_next):
    # Bloqueia mutações cross-origin (CSRF) e Host spoofing (DNS rebinding).
    host = request.headers.get("host", "")
    if host.split(":")[0] not in ("127.0.0.1", "localhost", "testserver"):
        return JSONResponse({"error": "host não permitido"}, status_code=403)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin not in ALLOWED_ORIGINS:
            return JSONResponse({"error": "origem não permitida"}, status_code=403)
        sfs = request.headers.get("sec-fetch-site")
        if sfs and sfs not in ("same-origin", "none"):
            return JSONResponse({"error": "requisição cross-site bloqueada"}, status_code=403)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp


@app.exception_handler(VRSError)
async def vrs_error(_: Request, e: VRSError):
    return JSONResponse({"error": str(e), "code": e.code}, status_code=e.status)


# ---------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, **workflow.status(), "host": "127.0.0.1", "port": 8765}


@app.get("/api/creation/catalog")
def creation_catalog() -> dict[str, Any]:
    ex = settings().data / "examples"
    items = []
    for n in catalog.niches().values():
        s = catalog.niche_summary(n)
        has = (ex / n["id"] / "example.mp4").exists()
        s["example_video"] = f"/media/examples/{n['id']}/example.mp4" if has else ""
        s["thumbnail"] = f"/media/examples/{n['id']}/thumb.jpg" if (ex / n["id"] / "thumb.jpg").exists() else ""
        items.append(s)
    return {"niches": items, "voices": voice.list_voices(), "agents": agents.available(), "sogni": sogni.status(), "stages": workflow.STAGES}


@app.get("/api/creation/niches/{nid}")
def niche_detail(nid: str) -> dict[str, Any]:
    n = catalog.get_niche(nid)
    return {**n, "example_storyboard": workflow.expand.storyboard_from_recipe(nid)}


@app.get("/api/creation/scenes")
def creation_scenes(q: str = "", category: str = "", limit: int = 100, offset: int = 0) -> dict[str, Any]:
    items = [catalog.scene_summary(s) for s in catalog.scenes().values() if (not category or s.get("category") == category)]
    if q:
        hits = {i["id"] for i in catalog.search_catalog(q, "scene", 50)["items"]}
        items = [i for i in items if i["id"] in hits]
    return {"items": items[offset : offset + limit], "total": len(items)}


@app.get("/api/creation/scenes/{sid}")
def creation_scene(sid: str) -> dict[str, Any]:
    return catalog.get_scene(sid)


@app.get("/api/creation/resources")
def creation_resources(q: str = "", kind: str = "", pack: str = "", limit: int = 24, offset: int = 0) -> dict[str, Any]:
    return library.search(q, kind, pack, limit, offset)


class StartReq(BaseModel):
    niche_id: str
    idea: str = Field(default="", max_length=4000)
    aspect: str = "landscape"
    duration: float | None = None
    reference: dict[str, Any] | None = None
    voice: str = "faber"
    captions: str = "word"
    agent: str = "mcp"
    quality: str = "final"
    name: str = ""
    sogni: bool = False


@app.post("/api/creation/start")
def creation_start(req: StartReq) -> dict[str, Any]:
    if req.reference and req.reference.get("kind") == "upload":
        raise VRSError("Para upload, use /api/creation/start-upload (multipart).")
    return workflow.start_creation(niche_id=req.niche_id, idea=req.idea, aspect=req.aspect, duration=req.duration, reference=req.reference, voice_id=req.voice, captions=req.captions, agent=req.agent, quality=req.quality, name=req.name, sogni=req.sogni)


@app.post("/api/creation/start-upload")
async def creation_start_upload(
    file: UploadFile = File(...),
    niche_id: str = Form(...),
    idea: str = Form(""),
    aspect: str = Form("landscape"),
    duration: float = Form(0),
    voice_id: str = Form("faber"),
    captions: str = Form("word"),
    agent: str = Form("mcp"),
    quality: str = Form("final"),
) -> dict[str, Any]:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in analysis.VIDEO_EXT:
        raise VRSError("Envie MP4, WebM ou MOV.")
    tmp = settings().inputs / f"up-{new_id()}{ext}"
    size = 0
    with open(tmp, "wb") as f:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > MAX_UPLOAD:
                f.close()
                tmp.unlink(missing_ok=True)
                raise VRSError("Arquivo grande demais (máx. 600 MB).")
            f.write(chunk)
    res = workflow.start_creation(niche_id=niche_id, idea=idea, aspect=aspect, duration=duration or None, reference={"kind": "upload"}, voice_id=voice_id, captions=captions, agent=agent, quality=quality)
    analysis.import_upload(res["project"]["id"], tmp, file.filename or "upload" + ext)
    return res


@app.get("/api/projects")
def list_projects(examples: bool = False) -> dict[str, Any]:
    return {"items": projects.list_projects(include_examples=examples)}


@app.get("/api/projects/{pid}")
def get_project(pid: str) -> dict[str, Any]:
    p = projects.get_project(pid)
    p["jobs"] = jobs.list_jobs(pid, 20)
    p["history"] = projects.get_history(pid, 30)
    p["storyboard"] = projects.load(pid, "storyboard")
    p["plan"] = projects.load(pid, "plan")
    p["brief_available"] = projects.load(pid, "brief") is not None
    return p


@app.get("/api/projects/{pid}/agent-task")
def project_agent_task(pid: str) -> dict[str, Any]:
    return workflow.agent_task(pid)


@app.post("/api/projects/{pid}/creation/storyboard")
def post_storyboard(pid: str, storyboard: dict[str, Any], render: bool = True) -> dict[str, Any]:
    return workflow.submit_storyboard(pid, storyboard, render_after=render)


@app.put("/api/projects/{pid}/plan")
def put_plan(pid: str, plan: dict[str, Any], render: bool = True) -> dict[str, Any]:
    return workflow.submit_plan(pid, plan, render_after=render)


class PatchReq(BaseModel):
    scene_id: str
    patch: dict[str, Any]
    render: bool = True


@app.post("/api/projects/{pid}/scene-patch")
def post_patch(pid: str, req: PatchReq) -> dict[str, Any]:
    return workflow.patch_scene(pid, req.scene_id, req.patch, render_after=req.render)


@app.post("/api/projects/{pid}/render")
def post_render(pid: str) -> dict[str, Any]:
    if not projects.load(pid, "plan"):
        raise VRSError("Projeto sem plano.", code="no_plan")
    return {"job": jobs.enqueue("render", pid, {})}


@app.get("/api/projects/{pid}/review")
def get_review(pid: str, version: int | None = None) -> dict[str, Any]:
    rs = projects.list_renders(pid)
    if not rs:
        raise VRSError("Sem render.", code="no_render", status=404)
    v = version or rs[-1]["version"]
    data = workflow.read_json(projects.project_dir(pid) / "renders" / f"v{v}" / "review.json")
    if not data:
        raise VRSError("Revisão pendente.", code="no_review", status=404)
    return data


class ContentReview(BaseModel):
    version: int
    decision: str
    notes: list[str] = []


@app.post("/api/projects/{pid}/review/content")
def post_content_review(pid: str, req: ContentReview) -> dict[str, Any]:
    return review.set_content_review(pid, req.version, req.decision, req.notes)


class AdjustReq(BaseModel):
    message: str = Field(min_length=2, max_length=2000)


@app.post("/api/projects/{pid}/adjust")
def post_adjust(pid: str, req: AdjustReq) -> dict[str, Any]:
    return workflow.request_adjustment(pid, req.message)


@app.get("/api/projects/{pid}/evidence/{eid}")
def get_evidence(pid: str, eid: str) -> Any:
    return analysis.read_evidence(pid, eid)


class ImportReq(BaseModel):
    resource_id: str


@app.post("/api/projects/{pid}/library/import")
def post_library_import(pid: str, req: ImportReq) -> dict[str, Any]:
    return {"path": library.import_into_project(pid, req.resource_id)}


class VoiceReq(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    voice: str = "faber"


@app.post("/api/voice/preview")
def voice_preview(req: VoiceReq) -> dict[str, Any]:
    return {"job": jobs.enqueue("voice_preview", None, {"text": req.text, "voice": req.voice})}


@app.post("/api/projects/{pid}/voice")
def project_voice(pid: str, req: VoiceReq) -> dict[str, Any]:
    projects.get_project(pid)
    return {"job": jobs.enqueue("voice_preview", pid, {"text": req.text, "voice": req.voice})}


@app.get("/api/projects/{pid}/export")
def export(pid: str):
    z = projects.export_project(pid)
    return FileResponse(z, media_type="application/zip", filename=z.name)


@app.get("/api/jobs")
def list_jobs(project_id: str | None = None) -> dict[str, Any]:
    return {"items": jobs.list_jobs(project_id)}


@app.get("/api/jobs/{jid}")
def get_job(jid: str) -> dict[str, Any]:
    return jobs.get(jid)


@app.post("/api/jobs/{jid}/cancel")
def cancel_job(jid: str) -> dict[str, Any]:
    return jobs.cancel(jid)


@app.get("/api/library")
def get_library(q: str = "", kind: str = "", pack: str = "", limit: int = 48, offset: int = 0) -> dict[str, Any]:
    return {"packs": library.list_packs(), **library.search(q, kind, pack, limit, offset)}


@app.get("/api/library/{rid}")
def get_resource(rid: str) -> dict[str, Any]:
    return library.get_resource(rid)


@app.post("/api/library/reindex")
def reindex() -> dict[str, Any]:
    return {"job": jobs.enqueue("index", None, {})}


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    s = settings()
    return {
        "agents": agents.available(),
        "voices": voice.list_voices(),
        "sogni": sogni.status(),
        "storage": {"data": str(s.data).replace(str(Path.home()), "~"), "free_gb": round(shutil.disk_usage(s.data).free / 1e9, 1)},
        "limits": {"threads": s.threads, "render_concurrency": s.render_concurrency},
        "server": "127.0.0.1:8765 (somente loopback)",
    }


@app.post("/api/examples/build")
def build_examples(niches: list[str] | None = None) -> dict[str, Any]:
    return {"job": jobs.enqueue("examples", None, {"niches": niches or []})}


# ---------------------------------------------------------------------------
# Mídia (allowlist de extensões; nunca .env, banco ou pesos)
# ---------------------------------------------------------------------------
def _serve(base: Path, rel: str):
    try:
        p = safe_join(base, rel)
    except VRSError:
        raise HTTPException(404)
    ext = p.suffix.lower()
    if ext not in MEDIA_EXT or not p.is_file() or p.name.startswith("."):
        raise HTTPException(404)
    if ext == ".json" and p.name not in PROJECT_JSON_OK and not p.name.startswith(("plan.v", "storyboard.v")):
        raise HTTPException(404)
    return FileResponse(p, media_type=mimetypes.guess_type(p.name)[0] or "application/octet-stream")


@app.get("/media/projects/{pid}/{rel:path}")
def media_project(pid: str, rel: str):
    return _serve(projects.project_dir(pid), rel)


@app.get("/media/library/{rel:path}")
def media_library(rel: str):
    if rel.lower().endswith((".onnx", ".bin")) and "glTF" not in rel and "gltf" not in rel.lower():
        raise HTTPException(404)
    return _serve(settings().library, rel)


@app.get("/media/examples/{rel:path}")
def media_examples(rel: str):
    return _serve(settings().data / "examples", rel)


@app.get("/media/outputs/{rel:path}")
def media_outputs(rel: str):
    return _serve(settings().outputs, rel)


@app.get("/media/voices/{vid}/audition.wav")
def media_voice(vid: str):
    return _serve(settings().voices_dir, f"{vid}/audition.wav")


# ---------------------------------------------------------------------------
# SPA
# ---------------------------------------------------------------------------
DIST = settings().frontend_dir / "dist"


@app.get("/{path:path}")
def spa(path: str):
    if path.startswith(("api/", "media/")):
        raise HTTPException(404)
    if path:
        try:
            f = safe_join(DIST, path)
            if f.is_file() and f.suffix.lower() in {".js", ".css", ".html", ".svg", ".png", ".jpg", ".gif", ".ttf", ".woff2", ".ico", ".txt", ".webp"}:
                return FileResponse(f)
        except VRSError:
            pass
    index = DIST / "index.html"
    if not index.exists():
        return JSONResponse({"error": "Interface não compilada. Rode scripts/build-frontend.sh"}, status_code=503)
    return FileResponse(index)
