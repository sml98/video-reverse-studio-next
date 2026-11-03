"""Serviço central compartilhado por API, MCP e CLI: mesmo core, mesma fila."""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from . import analysis, catalog, db, expand, jobs, library, projects, render, review, voice
from .config import settings
from .contracts import FilmPlan, Storyboard
from .jobs import JobCtx, handler
from .util import VRSError, read_json, write_json

AGENT_MODES = ("auto_local", "mcp", "claude", "codex", "generic", "openai", "draft")
STAGES = ["análise", "roteiro/direção", "recursos/animação", "montagem", "revisão", "MP4"]


# ---------------------------------------------------------------------------
# Criação
# ---------------------------------------------------------------------------
def start_creation(
    *,
    niche_id: str,
    idea: str,
    aspect: str = "landscape",
    duration: float | None = None,
    reference: dict[str, Any] | None = None,
    voice_id: str = "faber",
    captions: str = "word",
    agent: str = "mcp",
    quality: str = "final",
    name: str = "",
    sogni: bool = False,
    music: str = "",
) -> dict[str, Any]:
    niche = catalog.get_niche(niche_id)
    if agent not in AGENT_MODES:
        raise VRSError(f"Modo de agente inválido: {agent}")
    if not idea.strip() and agent != "draft":
        raise VRSError("Escreva sua ideia para o agente adaptar o modelo.")
    ref = reference or {"kind": "niche_example"}
    opts = {"voice": voice_id, "captions": captions, "agent": agent, "quality": quality, "sogni_requested": bool(sogni), "music": music}
    p = projects.create_project(
        name=name or (idea.strip()[:60] or niche["example"]["title"]),
        idea=idea,
        niche_id=niche_id,
        aspect=aspect,
        target_seconds=float(duration or niche["defaultDuration"]),
        reference={"requested": ref},
        options=opts,
    )
    job = jobs.enqueue("prepare", p["id"], {"reference": ref})
    return {"project": projects.get_project(p["id"]), "job": job}


def agent_task(pid: str) -> dict[str, Any]:
    """Tarefa compacta para o agente (economia de tokens): ideia + modelo + brief + IDs."""
    p = projects.get_project(pid)
    niche = catalog.get_niche(p["niche_id"]) if p["niche_id"] else None
    brief = projects.load(pid, "brief")
    task = {
        "project_id": pid,
        "idea": p["idea"],
        "language": p["language"],
        "aspect": p["aspect"],
        "target_seconds": p["target_seconds"],
        "niche": catalog.niche_summary(niche) if niche else None,
        "example_storyboard": expand.storyboard_from_recipe(niche["id"]) if niche else None,
        "brief": brief,
        "rules": [
            "Escreva conteúdo ORIGINAL para a ideia; a referência orienta só estrutura/ritmo/mecanismos.",
            "Use cenas instaladas (preset_id) e parâmetros conhecidos; consulte get_scene_preset quando precisar.",
            "Recursos: lib:<id> da biblioteca (search_library) ou caminho relativo do projeto; nunca caminhos externos.",
            "Narração curta o bastante para caber na duração alvo; números por extenso quando possível.",
            "Verifique afirmações factuais e liste fontes em `sources`; marque dados ilustrativos.",
            "Liste incertezas em `uncertainties`. Não invente autoria de frases.",
        ],
        "submit_with": "submit_preset_storyboard(project_id, storyboard) — schema vrs.storyboard/1",
    }
    return task


def submit_storyboard(pid: str, storyboard: dict[str, Any], *, render_after: bool = True, agent_usage: dict[str, Any] | None = None) -> dict[str, Any]:
    sb = Storyboard.model_validate(storyboard)
    for s in sb.scenes:  # validação antecipada (erros claros antes de enfileirar)
        catalog.get_scene(s.preset_id)
        catalog.validate_params(s.preset_id, dict(s.parameters or {}))
    data = sb.model_dump(by_alias=True)
    n = projects.save_versioned(pid, "storyboard", data)
    projects.update_project(pid, stage="direção recebida")
    projects.history(pid, "storyboard_submitted", version=n, scenes=len(sb.scenes))
    if agent_usage:
        db.record_metric("agent_tokens", float(agent_usage.get("total_tokens", 0) or 0), pid, **{k: v for k, v in agent_usage.items() if isinstance(v, (int, float, str))})
    jobs.resolve_awaiting(pid, {"storyboard_version": n})
    job = jobs.enqueue("produce", pid, {"storyboard_version": n, "render": render_after})
    return {"storyboard_version": n, "job": job}


def submit_plan(pid: str, plan: dict[str, Any], *, render_after: bool = True) -> dict[str, Any]:
    fp = FilmPlan.model_validate(plan)
    data = fp.model_dump(by_alias=True)
    for sc in data["scenes"]:
        catalog.get_scene(sc["component"])
        sc["params"] = catalog.validate_params(sc["component"], sc["params"])
        for rel in list(sc["assets"]) + [l["src"] for l in sc["layers"] if l.get("src")]:
            if not projects.resolve(pid, rel).is_file():
                raise VRSError(f"Recurso inexistente: {rel}", code="missing_asset")
    n = projects.save_versioned(pid, "plan", data)
    projects.history(pid, "plan_submitted", version=n)
    jobs.resolve_awaiting(pid, {"plan_version": n})
    job = jobs.enqueue("render", pid, {}) if render_after else None
    return {"plan_version": n, "job": job}


def patch_scene(pid: str, scene_id: str, patch: dict[str, Any], *, render_after: bool = True) -> dict[str, Any]:
    plan = projects.load(pid, "plan")
    if not plan:
        raise VRSError("Projeto sem plano.", code="no_plan")
    new = expand.patch_scene(plan, scene_id, patch, pid=pid)
    n = projects.save_versioned(pid, "plan", new)
    job = jobs.enqueue("render", pid, {}) if render_after else None
    return {"plan_version": n, "job": job}


def manage_scene(pid: str, action: str, scene_id: str, *, preset_id: str = "vrs-stickman-stage", render_after: bool = False) -> dict[str, Any]:
    plan = projects.load(pid, "plan")
    if not plan:
        raise VRSError("Projeto sem plano.", code="no_plan")
    new = expand.manage_scene(pid, plan, action, scene_id, preset_id=preset_id)
    n = projects.save_versioned(pid, "plan", new)
    projects.history(pid, "scene_managed", action=action, scene=scene_id, plan_version=n)
    job = jobs.enqueue("render", pid, {}) if render_after else None
    return {"plan_version": n, "scenes": len(new["scenes"]), "job": job}


def clone_reference_style(pid: str, *, render_after: bool = False) -> dict[str, Any]:
    """Aplica a paleta medida e cadência de cortes da referência (brief.json) ao FilmPlan do projeto."""
    import re

    plan = projects.load(pid, "plan")
    if not plan:
        raise VRSError("Projeto sem plano.", code="no_plan")
    brief = projects.load(pid, "brief") or {}
    measured = brief.get("measured") or {}
    palette = [c for c in (measured.get("palette") or []) if isinstance(c, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", c)]
    if len(palette) >= 2:
        plan["theme"]["background"] = palette[0]
        plan["theme"]["accent"] = palette[1]
        if len(palette) >= 3:
            plan["theme"]["accent2"] = palette[2]
    validated = FilmPlan.model_validate(plan).model_dump(by_alias=True)
    n = projects.save_versioned(pid, "plan", validated)
    projects.history(pid, "reference_style_cloned", palette=palette[:3], plan_version=n)
    job = jobs.enqueue("render", pid, {}) if render_after else None
    return {"plan_version": n, "palette": palette[:3], "theme": validated["theme"], "job": job}


def auto_direct_project(pid: str, *, render_after: bool = True) -> dict[str, Any]:
    """Gera storyboard adaptado à ideia do projeto com o diretor local autônomo e inicia a produção."""
    p = projects.get_project(pid)
    sb = expand.auto_storyboard_from_idea(p["niche_id"], p.get("idea", ""), p.get("target_seconds"), title=p.get("name", ""))
    return submit_storyboard(pid, sb, render_after=render_after)


def reframe_project(pid: str, aspect: str, *, render_after: bool = False) -> dict[str, Any]:
    """Reenquadra o projeto (landscape 16:9 ↔ vertical 9:16 ↔ square 1:1) preservando cenas e vozes."""
    from .contracts import ASPECTS, PREVIEW_ASPECTS

    if aspect not in ASPECTS:
        raise VRSError(f"Formato inválido: {aspect}")
    p = projects.get_project(pid)
    projects.update_project(pid, aspect=aspect)
    plan = projects.load(pid, "plan")
    plan_v = None
    if plan:
        quality = (p.get("options") or {}).get("quality", "final")
        w, h = (PREVIEW_ASPECTS if quality == "preview" else ASPECTS)[aspect]
        plan["width"], plan["height"] = w, h
        validated = FilmPlan.model_validate(plan).model_dump(by_alias=True)
        plan_v = projects.save_versioned(pid, "plan", validated)
    projects.history(pid, "reframed", aspect=aspect, plan_version=plan_v)
    job = jobs.enqueue("render", pid, {}) if (render_after and plan_v) else None
    return {"aspect": aspect, "plan_version": plan_v, "job": job}


def upload_scene_voice(pid: str, scene_id: str, src_audio: Path, transcript_text: str = "", *, render_after: bool = False) -> dict[str, Any]:
    """Importa gravação de voz própria na cena, alinha palavras (forced_aligned/asr_estimated) e atualiza o plano."""
    import math

    plan = projects.load(pid, "plan")
    if not plan:
        raise VRSError("Projeto sem plano.", code="no_plan")
    target = next((sc for sc in plan["scenes"] if sc["id"] == scene_id), None)
    if not target:
        raise VRSError(f"Cena não encontrada: {scene_id}", code="not_found", status=404)
    vdir = projects.project_dir(pid) / "voice"
    vdir.mkdir(exist_ok=True)
    dst = vdir / f"{scene_id}.wav"
    info = voice.align_uploaded_voice(src_audio, dst, transcript_text=transcript_text or target.get("narration", ""))
    lead, tail = expand.LEAD_MS, expand.TAIL_MS
    target["words"] = [{**wd, "start": wd["start"] + lead, "end": wd["end"] + lead} for wd in info["words"]]
    target["timing"] = info["timing"]
    if info.get("narration"):
        target["narration"] = info["narration"]
    min_ms = lead + info["duration_ms"] + tail
    fps = int(plan.get("fps", 30))
    target["durationInFrames"] = max(int(target["durationInFrames"]), math.ceil(min_ms * fps / 1000))
    plan["audio"]["narration"] = "voice/narration.wav"
    timings = read_json(vdir / "timings.json", {}) or {}
    timings[scene_id] = {"wav": f"voice/{scene_id}.wav", "offset_ms": lead, "duration_ms": info["duration_ms"], "timing": info["timing"], "cached": False}
    write_json(vdir / "timings.json", timings)
    validated = FilmPlan.model_validate(plan).model_dump(by_alias=True)
    n = projects.save_versioned(pid, "plan", validated)
    projects.history(pid, "scene_voice_uploaded", scene=scene_id, timing=info["timing"], words=len(info["words"]))
    job = jobs.enqueue("render", pid, {}) if render_after else None
    return {"plan_version": n, "scene": scene_id, "timing": info["timing"], "words": target["words"], "job": job}


def request_adjustment(pid: str, message: str) -> dict[str, Any]:
    p = projects.get_project(pid)
    projects.history(pid, "adjustment_requested", message=message[:1000])
    mode = (p.get("options") or {}).get("agent", "mcp")
    if mode in ("claude", "codex", "generic", "openai"):
        return {"job": jobs.enqueue("agent_run", pid, {"adjustment": message[:2000]})}
    return {"job": jobs.set_awaiting_agent(pid, f"ajuste pedido: {message[:120]}", {"adjustment": message[:2000]})}


def status() -> dict[str, Any]:
    from . import __version__

    c = db.conn()
    counts = {r["state"]: r["n"] for r in c.execute("SELECT state, COUNT(*) n FROM jobs GROUP BY state").fetchall()}
    return {
        "version": __version__,
        "worker_alive": jobs.worker_alive(),
        "jobs": counts,
        "projects": c.execute("SELECT COUNT(*) FROM projects WHERE is_example = 0").fetchone()[0],
        "resources": c.execute("SELECT COUNT(*) FROM resources").fetchone()[0],
        "voices": [v["id"] for v in voice.list_voices()],
        "niches": list(catalog.niches()),
        "scenes": len(catalog.scenes()),
        "kinocut": bool(render.kinocut_bin()),
        "examples": sorted(p.name for p in (settings().data / "examples").glob("*") if (p / "example.mp4").exists()) if (settings().data / "examples").exists() else [],
    }


# ---------------------------------------------------------------------------
# Handlers da fila
# ---------------------------------------------------------------------------
@handler("prepare")
def _prepare(ctx: JobCtx) -> dict[str, Any]:
    pid = ctx.project_id
    p = projects.get_project(pid)
    ref = ctx.params.get("reference") or {"kind": "niche_example"}
    ctx.progress("análise: importando referência", 0.02)
    if not ctx.checkpoints.get("imported"):
        kind = ref.get("kind")
        if kind == "niche_example":
            try:
                analysis.import_example(pid, p["niche_id"])
            except VRSError as e:
                if e.code != "no_example":
                    raise
                ctx.checkpoint("reference_note", "exemplo ainda não gerado; seguindo sem referência em vídeo")
        elif kind == "library":
            analysis.import_library(pid, ref["resource_id"])
        elif kind == "link":
            analysis.import_link(pid, ref["url"], progress=lambda s, f: ctx.progress(f"análise: {s}", 0.02 + 0.2 * f))
        elif kind == "upload":
            pass  # já importado pela API
        elif kind == "none":
            pass
        else:
            raise VRSError(f"Tipo de referência desconhecido: {kind}")
        ctx.checkpoint("imported", True)
    p = projects.get_project(pid)
    if (p.get("reference") or {}).get("file") and not ctx.checkpoints.get("analyzed"):
        res = analysis.analyze(pid, progress=lambda s, f: ctx.progress(f"análise: {s}", 0.25 + 0.65 * f))
        ctx.checkpoint("analyzed", res)
    projects.update_project(pid, stage="aguardando direção")
    mode = (p.get("options") or {}).get("agent", "mcp")
    if mode == "draft":
        sb = expand.storyboard_from_recipe(p["niche_id"])
        return {"next": submit_storyboard(pid, sb)["job"]["id"], "mode": "draft"}
    if mode == "auto_local":
        sb = expand.auto_storyboard_from_idea(p["niche_id"], p.get("idea", ""), p.get("target_seconds"), title=p.get("name", ""))
        return {"next": submit_storyboard(pid, sb)["job"]["id"], "mode": "auto_local"}
    if mode in ("claude", "codex", "generic", "openai"):
        j = jobs.enqueue("agent_run", pid, {})
        return {"next": j["id"], "mode": mode}
    j = jobs.set_awaiting_agent(pid, "aguardando o agente conectado (MCP/CLI) escrever o storyboard")
    return {"awaiting_agent": j["id"], "mode": "mcp"}


@handler("produce")
def _produce(ctx: JobCtx) -> dict[str, Any]:
    pid = ctx.project_id
    if not ctx.checkpoints.get("plan_version"):
        sb = projects.load(pid, "storyboard")
        if not sb:
            raise VRSError("Projeto sem storyboard.", code="no_storyboard")
        projects.update_project(pid, stage="recursos/animação")
        plan = expand.expand(pid, sb, progress=lambda s, f: ctx.progress(f"roteiro→plano: {s}", 0.02 + 0.2 * f))
        n = projects.save_versioned(pid, "plan", plan)
        ctx.checkpoint("plan_version", n)
    if not ctx.params.get("render", True):
        return {"plan_version": ctx.checkpoints["plan_version"]}
    return {**_render_and_review(ctx, 0.22), "plan_version": ctx.checkpoints["plan_version"]}


def _render_and_review(ctx: JobCtx, base: float) -> dict[str, Any]:
    pid = ctx.project_id
    if not ctx.checkpoints.get("render"):
        projects.update_project(pid, stage="montagem")
        info = render.render_project(pid, progress=lambda s, f: ctx.progress(s, base + (0.85 - base) * f), cancel=ctx.cancelled)
        ctx.checkpoint("render", {"mp4": info["mp4"], "reused": info["scenes"]["reused"], "rendered": info["scenes"]["rendered"], "seconds": info["seconds"]})
    ctx.progress("revisão: quadros reais e áudio", 0.88)
    projects.update_project(pid, stage="revisão")
    rv = review.review_render(pid)
    projects.update_project(pid, stage="MP4 pronto", status=rv["technical"])
    return {"render": ctx.checkpoints["render"], "review": {k: rv[k] for k in ("technical", "content", "errors")} | {"findings": len(rv["findings"])}}


@handler("render")
def _render(ctx: JobCtx) -> dict[str, Any]:
    return _render_and_review(ctx, 0.02)


@handler("review")
def _review(ctx: JobCtx) -> dict[str, Any]:
    rv = review.review_render(ctx.project_id, ctx.params.get("version"))
    return {"technical": rv["technical"], "findings": len(rv["findings"])}


@handler("agent_run")
def _agent_run(ctx: JobCtx) -> dict[str, Any]:
    from . import agents

    pid = ctx.project_id
    p = projects.get_project(pid)
    mode = (p.get("options") or {}).get("agent", "mcp")
    ctx.progress(f"roteiro/direção: agente {mode}", 0.05)
    task = agent_task(pid)
    if ctx.params.get("adjustment"):
        task["adjustment_request"] = ctx.params["adjustment"]
        task["current_storyboard"] = projects.load(pid, "storyboard")
    sb, usage = agents.run_adapter(mode, task, cancel=ctx.cancelled)
    res = submit_storyboard(pid, sb, agent_usage=usage)
    return {"storyboard_version": res["storyboard_version"], "next": res["job"]["id"], "usage": usage}


@handler("voice_preview")
def _voice_preview(ctx: JobCtx) -> dict[str, Any]:
    info = voice.synthesize_cached(ctx.params["text"][:600], ctx.params.get("voice", "faber"))
    dst = settings().outputs / "voice-previews" / f"{ctx.id}.wav"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(info["wav"], dst)
    return {"wav": f"voice-previews/{dst.name}", "duration_ms": info["duration_ms"], "timing": info["timing"], "words": info["words"][:200]}


@handler("examples")
def _examples(ctx: JobCtx) -> dict[str, Any]:
    ids = ctx.params.get("niches") or list(catalog.niches())
    done = dict(ctx.checkpoints.get("done", {}))
    for i, nid in enumerate(ids):
        if nid in done:
            continue
        ctx.progress(f"exemplo {nid} ({i + 1}/{len(ids)})", i / len(ids))
        done[nid] = build_example(nid)
        ctx.checkpoint("done", done)
    return {"examples": done}


@handler("index")
def _index(ctx: JobCtx) -> dict[str, Any]:
    return {"library": library.index_library(), "catalog": catalog.index_catalog()}


def build_example(niche_id: str) -> dict[str, Any]:
    """Gera o MP4 de exemplo do modelo a partir da sua receita (mesmo pipeline do usuário)."""
    n = catalog.get_niche(niche_id)
    p = projects.create_project(name=f"Exemplo · {n['title']}", idea=n["example"]["idea"], niche_id=niche_id, aspect=n["example"]["aspect"], target_seconds=n["defaultDuration"], options={"voice": n.get("voice", "faber"), "captions": "word", "quality": "preview"}, is_example=True)
    pid = p["id"]
    sb = expand.storyboard_from_recipe(niche_id)
    projects.save_versioned(pid, "storyboard", sb)
    plan = expand.expand(pid, sb)
    projects.save_versioned(pid, "plan", plan)
    info = render.render_project(pid)
    rv = review.review_render(pid)
    projects.update_project(pid, stage="mp4", status=rv["state"])
    out = settings().data / "examples" / niche_id
    out.mkdir(parents=True, exist_ok=True)
    pdir = projects.project_dir(pid)
    shutil.copyfile(pdir / info["mp4"], out / "example.mp4")
    mid = sum(s["durationInFrames"] for s in plan["scenes"][:1]) / plan["fps"] * 0.6
    from .util import run

    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{mid:.2f}", "-i", str(out / "example.mp4"), "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "3", str(out / "thumb.jpg")], timeout=60)
    write_json(out / "storyboard.json", sb)
    write_json(out / "plan.json", plan)
    write_json(out / "example.json", {"project_id": pid, "niche": niche_id, "review": {k: rv[k] for k in ("technical", "findings", "motion")}, "render_seconds": info["seconds"], "duration_s": info["duration_s"]})
    return {"project_id": pid, "technical": rv["technical"], "duration_s": info["duration_s"], "seconds": info["seconds"]}
