"""Servidor MCP stdio — o agente conectado dirige o mesmo core e a mesma fila.

Ferramentas longas retornam job_id imediatamente (não bloqueiam até o fim do render).
Se o serviço local não estiver rodando, um worker embutido processa a fila neste processo.
"""
from __future__ import annotations

import json
from functools import wraps
from typing import Any

from mcp.server.fastmcp import FastMCP

from . import analysis, catalog, expand, jobs, library, projects, review, voice, workflow
from .config import limit_threads
from .util import VRSError, read_json

limit_threads()
mcp = FastMCP("video-reverse-studio")
_worker: jobs.Worker | None = None


def _ensure_worker() -> None:
    global _worker
    if not jobs.worker_alive() and _worker is None:
        _worker = jobs.Worker().start()


def _safe(fn):
    @wraps(fn)
    def wrap(*a, **k):
        try:
            return fn(*a, **k)
        except VRSError as e:
            return {"error": str(e), "code": e.code}

    wrap.__name__ = fn.__name__
    wrap.__doc__ = fn.__doc__
    return wrap


@mcp.tool()
@_safe
def status() -> dict[str, Any]:
    """Estado do VRS: worker, fila, vozes, nichos, exemplos e recursos indexados."""
    return workflow.status()


@mcp.tool()
@_safe
def list_projects(limit: int = 20) -> list[dict[str, Any]]:
    """Projetos recentes (ID, nome, etapa, último render)."""
    return [{k: p[k] for k in ("id", "name", "niche_id", "stage", "status", "aspect", "target_seconds")} | {"latest_render": p.get("latest_render")} for p in projects.list_projects(limit=limit)]


@mcp.tool()
@_safe
def prepare_project(niche_id: str, idea: str, aspect: str = "landscape", duration: float = 0, reference_kind: str = "niche_example", reference_value: str = "", voice: str = "faber", captions: str = "word") -> dict[str, Any]:
    """Cria projeto a partir de um modelo de nicho. reference_kind: niche_example | library (value=resource_id) | link (value=URL pública) | none.
    Retorna project_id e job_id da preparação (importação + análise). Depois: get_brief → submit_preset_storyboard."""
    ref: dict[str, Any] = {"kind": reference_kind}
    if reference_kind == "library":
        ref["resource_id"] = reference_value
    elif reference_kind == "link":
        ref["url"] = reference_value
    res = workflow.start_creation(niche_id=niche_id, idea=idea, aspect=aspect, duration=duration or None, reference=ref, voice_id=voice, captions=captions, agent="mcp")
    _ensure_worker()
    return {"project_id": res["project"]["id"], "job_id": res["job"]["id"], "next": "get_progress(job_id) e depois get_brief(project_id)"}


@mcp.tool()
@_safe
def list_creation_presets() -> list[dict[str, Any]]:
    """Modelos completos por nicho (receitas de várias cenas)."""
    return [catalog.niche_summary(n) for n in catalog.niches().values()]


@mcp.tool()
@_safe
def get_scene_preset(scene_id: str) -> dict[str, Any]:
    """Especificação completa de uma cena (parâmetros, tipos, limites, padrões)."""
    return catalog.get_scene(scene_id)


@mcp.tool()
@_safe
def search_scenes(query: str = "", limit: int = 12, offset: int = 0) -> dict[str, Any]:
    """Busca paginada (FTS local) em cenas e modelos; retorna IDs e títulos curtos."""
    return catalog.search_catalog(query, "", limit, offset)


@mcp.tool()
@_safe
def search_library(query: str = "", kind: str = "", limit: int = 12, offset: int = 0) -> dict[str, Any]:
    """Busca paginada na biblioteca local (imagens, poses, SFX, vídeos, 3D). Use o id como lib:<id> no storyboard."""
    return library.search(query, kind, "", limit, offset)


@mcp.tool()
@_safe
def search_local_resources(query: str = "", kind: str = "", limit: int = 12, offset: int = 0) -> dict[str, Any]:
    """Alias de search_library."""
    return library.search(query, kind, "", limit, offset)


@mcp.tool()
@_safe
def import_library_asset(project_id: str, resource_id: str) -> dict[str, Any]:
    """Copia um recurso para o projeto com hash e procedência; retorna caminho relativo."""
    return {"path": library.import_into_project(project_id, resource_id)}


@mcp.tool()
@_safe
def get_brief(project_id: str) -> dict[str, Any]:
    """Tarefa compacta: ideia, modelo, storyboard de exemplo, brief medido da referência e regras."""
    return workflow.agent_task(project_id)


@mcp.tool()
@_safe
def read_evidence(project_id: str, evidence_id: str) -> Any:
    """Evidência detalhada sob demanda: metadata | shots | frames | visual | audio | transcript | ocr | contact-sheet."""
    return analysis.read_evidence(project_id, evidence_id)


@mcp.tool()
@_safe
def submit_preset_storyboard(project_id: str, storyboard_json: str) -> dict[str, Any]:
    """Envia storyboard vrs.storyboard/1 (string JSON). Valida, expande, sintetiza voz, renderiza e revisa em segundo plano. Retorna job_id."""
    res = workflow.submit_storyboard(project_id, json.loads(storyboard_json))
    _ensure_worker()
    return {"storyboard_version": res["storyboard_version"], "job_id": res["job"]["id"]}


@mcp.tool()
@_safe
def submit_plan(project_id: str, plan_json: str) -> dict[str, Any]:
    """Envia FilmPlan vrs.filmplan/1 completo (cenas programadas com camadas/keyframes). Retorna job_id do render."""
    res = workflow.submit_plan(project_id, json.loads(plan_json))
    _ensure_worker()
    return {"plan_version": res["plan_version"], "job_id": res["job"]["id"] if res["job"] else None}


@mcp.tool()
@_safe
def patch_scene(project_id: str, scene_id: str, patch_json: str) -> dict[str, Any]:
    """Altera params/durationInFrames/transições de UMA cena; só ela é re-renderizada (cache)."""
    res = workflow.patch_scene(project_id, scene_id, json.loads(patch_json))
    _ensure_worker()
    return {"plan_version": res["plan_version"], "job_id": res["job"]["id"] if res["job"] else None}


@mcp.tool()
@_safe
def synthesize_voice_preview(text: str, voice_id: str = "faber") -> dict[str, Any]:
    """Sintetiza com Piper local (CPU) e mede duração real e tempos por palavra."""
    info = voice.synthesize_cached(text[:600], voice_id)
    return {"duration_ms": info["duration_ms"], "timing": info["timing"], "words": info["words"][:120], "cached": info.get("cached")}


@mcp.tool()
@_safe
def analyze_words(project_id: str) -> dict[str, Any]:
    """Tempos de palavras da narração final por cena (ms) e a precisão declarada."""
    plan = projects.load(project_id, "plan") or {}
    return {"scenes": [{"id": s["id"], "timing": s["timing"], "words": s["words"]} for s in plan.get("scenes", [])]}


@mcp.tool()
@_safe
def get_progress(job_id: str = "", project_id: str = "") -> dict[str, Any]:
    """Estado de um job (ou dos jobs de um projeto)."""
    if job_id:
        j = jobs.get(job_id)
        return {k: j[k] for k in ("id", "kind", "state", "step", "progress", "error", "result")}
    return {"jobs": [{k: j[k] for k in ("id", "kind", "state", "step", "progress", "error")} for j in jobs.list_jobs(project_id, 10)]}


@mcp.tool()
@_safe
def get_render_review(project_id: str, version: int = 0) -> dict[str, Any]:
    """Revisão técnica do último render: erros, achados, movimento por cena, quadros reais (caminhos)."""
    rs = projects.list_renders(project_id)
    if not rs:
        return {"error": "sem render"}
    v = version or rs[-1]["version"]
    rv = read_json(projects.project_dir(project_id) / "renders" / f"v{v}" / "review.json") or {}
    return {k: rv.get(k) for k in ("version", "technical", "content", "errors", "findings", "motion", "audio", "timing_precision", "contact_sheet", "frames", "limits")}


@mcp.tool()
@_safe
def inspect_rendered_output(project_id: str, version: int = 0) -> dict[str, Any]:
    """Caminhos absolutos dos quadros reais e da folha de contato para inspeção visual pelo agente."""
    rs = projects.list_renders(project_id)
    if not rs:
        return {"error": "sem render"}
    v = version or rs[-1]["version"]
    d = projects.project_dir(project_id)
    rv = read_json(d / "renders" / f"v{v}" / "review.json") or {}
    return {"mp4": str(d / "renders" / f"v{v}" / "final.mp4"), "contact_sheet": str(d / rv.get("contact_sheet", "")), "frames": [str(d / f["path"]) for f in rv.get("frames", [])]}


@mcp.tool()
@_safe
def set_content_review(project_id: str, version: int, decision: str, notes_json: str = "[]") -> dict[str, Any]:
    """Registra a revisão de CONTEÚDO (aprovado_conteudo | ajustes_pedidos) após inspecionar os quadros."""
    return {"content": review.set_content_review(project_id, version, decision, json.loads(notes_json))["content"]}


@mcp.tool()
@_safe
def export_project(project_id: str) -> dict[str, Any]:
    """Pacote ZIP do projeto sem credenciais (plano, storyboard, legendas, mídias, procedência)."""
    return {"zip": str(projects.export_project(project_id))}



@mcp.tool()
@_safe
def clone_reference_style(project_id: str, full_structure: bool = True, render: bool = False) -> dict[str,Any]:
    """Adapta estrutura e âncoras medidas ou apenas as cores; mantém a fala na velocidade original."""
    result=workflow.clone_reference_style(project_id,full_structure=full_structure,render_after=render)
    _ensure_worker()
    return result

@mcp.tool()
@_safe
def hypit_clone_workflow(project_id: str,new_idea: str='',target_niche: str='pandora',render: bool=True) -> dict[str,Any]:
    """Cria novo projeto original com estrutura medida e gatilhos por palavra. Não usa o runtime externo Hypit."""
    from . import hypit
    result=hypit.clone_with_hypit(project_id,new_idea,target_niche,render)
    _ensure_worker()
    return result

@mcp.tool()
@_safe
def generate_hypit_variants(project_id: str,hooks_json: str='[]',voices_json: str='[]') -> dict[str,Any]:
    """Enfileira até doze variantes de gancho/voz, preservando o projeto original."""
    hooks=json.loads(hooks_json);voices=json.loads(voices_json)
    if not isinstance(hooks,list) or not isinstance(voices,list) or not hooks or len(hooks)*max(1,len(voices))>12:
        raise VRSError('Forneça até doze combinações de ganchos e vozes.')
    result={"job":jobs.enqueue('hypit_variants',project_id,{'hooks':hooks,'voices':voices})};_ensure_worker();return result

@mcp.tool()
@_safe
def auto_direct_project(project_id: str,render: bool=True) -> dict[str,Any]:
    """Monta um rascunho local usando a ideia e o mix configurado."""
    result=workflow.auto_direct_project(project_id,render_after=render);_ensure_worker();return result

@mcp.tool()
@_safe
def reframe_project(project_id: str,aspect: str,render: bool=False) -> dict[str,Any]:
    """Alterna 9:16, 16:9 e 1:1 preservando a duração da fala."""
    result=workflow.reframe_project(project_id,aspect,render_after=render)
    if render:_ensure_worker()
    return result

@mcp.tool()
@_safe
def manage_scene(project_id: str,action: str,scene_id: str,preset_id: str='vrs-pandora-cutout',render: bool=False) -> dict[str,Any]:
    """Adiciona, duplica, remove ou move uma cena do plano."""
    result=workflow.manage_scene(project_id,action,scene_id,preset_id=preset_id,render_after=render)
    if render:_ensure_worker()
    return result

@mcp.tool()
@_safe
def vrs_get_agent_task(project_id: str) -> dict[str,Any]:
    """Alias compatível: tarefa compacta com brief."""
    return get_brief(project_id)

@mcp.tool()
@_safe
def vrs_get_evidence(project_id: str,kind: str='brief') -> Any:
    """Alias compatível: brief ou evidência por kind."""
    return projects.load(project_id,'brief') if kind=='brief' else read_evidence(project_id,kind)

@mcp.tool()
@_safe
def vrs_search_catalog(query: str='',kind: str='',limit: int=12,offset: int=0) -> dict[str,Any]:
    """Busca em cenas/nichos, com filtro kind opcional."""
    if kind not in ('','niche','scene'):raise VRSError('kind deve ser niche ou scene.')
    return catalog.search_catalog(query,kind,limit,offset)

@mcp.tool()
@_safe
def vrs_search_library(query: str='',kind: str='',pack: str='',limit: int=12,offset: int=0) -> dict[str,Any]:
    """Busca compatível na biblioteca, incluindo pack."""
    return library.search(query,kind,pack,limit,offset)

@mcp.tool()
@_safe
def vrs_get_scene_spec(scene_id: str) -> dict[str,Any]:
    """Alias da especificação de cena."""
    return get_scene_preset(scene_id)

@mcp.tool()
@_safe
def vrs_submit_storyboard(project_id: str,storyboard: dict[str,Any]|str,render: bool=True) -> dict[str,Any]:
    """Aceita storyboard como objeto ou JSON e enfileira produção."""
    result=workflow.submit_storyboard(project_id,json.loads(storyboard) if isinstance(storyboard,str) else storyboard,render_after=render);_ensure_worker();return result

@mcp.tool()
@_safe
def vrs_patch_scene(project_id: str,scene_id: str,patch: dict[str,Any]|str,render: bool=True) -> dict[str,Any]:
    """Aceita patch como objeto ou JSON."""
    result=workflow.patch_scene(project_id,scene_id,json.loads(patch) if isinstance(patch,str) else patch,render_after=render)
    if render:_ensure_worker()
    return result

@mcp.tool()
@_safe
def vrs_get_review(project_id: str,version: int=0) -> dict[str,Any]:
    """Alias da revisão do render."""
    return get_render_review(project_id,version)

@mcp.tool()
@_safe
def vrs_record_content_review(project_id: str,version: int,decision: str,notes: list[str]|None=None) -> dict[str,Any]:
    """Registra revisão real, com notas como lista."""
    return {"content":review.set_content_review(project_id,version,decision,notes or [])["content"]}


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
