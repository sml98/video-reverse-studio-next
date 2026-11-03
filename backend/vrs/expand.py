"""Expansão determinística: storyboard compacto → FilmPlan animado e renderizável.

O agente escreve conteúdo (cenas instaladas + parâmetros + narração); este módulo
valida, importa recursos com procedência, sintetiza a voz local (com cache),
ajusta durações à fala sem cortar palavras e aplica tema/transições do modelo.
"""
from __future__ import annotations

import math
import re
import shutil
from typing import Any, Callable

from . import catalog, library, projects, voice
from .contracts import ASPECTS, PREVIEW_ASPECTS, FilmPlan, Storyboard
from .util import VRSError, safe_join, write_json

LEAD_MS = 300  # respiro antes da fala (após a transição de entrada)
TAIL_MS = 450  # respiro depois da fala
TRANSITIONS = ["fade", "wipe", "slide", "zoom", "circle"]
NICHE_TRANSITION = {"ciencia": "wipe", "documentario": "fade", "meme": "flash", "cta": "zoom", "financas": "slide", "frases": "fade", "tutorial": "slide", "historia": "circle"}
PRIMARY_ASSET = {"vrs-title": "backgroundAsset", "vrs-story-panel": "character", "vrs-meme": "image", "vrs-3d-stage": "model", "vrs-parallax-photo": "image"}

Progress = Callable[[str, float], None]


def _auto_sfx(pid: str, idx: int, preset_id: str, tr: str, words: list[dict[str, Any]], opts: dict[str, Any]) -> list[dict[str, Any]]:
    """Injeta SFX sutis da biblioteca local nas transições e palavras-âncora quando disponíveis."""
    if not opts.get("auto_sfx", True):
        return []
    try:
        items = library.search("", "sfx", "", limit=12).get("items") or []
    except Exception:
        return []
    if not items:
        return []
    rollover = next((it["id"] for it in items if "rollover" in it["id"] or "switch" in it["id"]), items[0]["id"])
    click = next((it["id"] for it in items if "click" in it["id"]), items[-1]["id"])
    cues: list[dict[str, Any]] = []
    if idx > 0 and tr != "none":
        rel = library.import_into_project(pid, rollover)
        cues.append({"path": rel, "at_ms": 40, "volume": 0.16, "role": f"transition:{tr}"})
    if words and preset_id in ("vrs-stat", "vrs-meme", "vrs-cta", "vrs-kinetic-quote", "vrs-calc", "vrs-code-walkthrough", "vrs-parallax-photo"):
        anchor = words[min(len(words) - 1, max(0, len(words) // 3))]
        rel_c = library.import_into_project(pid, click)
        cues.append({"path": rel_c, "at_ms": int(anchor["start"]), "volume": 0.14, "role": f"anchor:{anchor['id']}"})
    return cues


def _resolve_asset(pid: str, value: str) -> str:
    if not value:
        return ""
    if value.startswith("lib:"):
        return library.import_into_project(pid, value[4:])
    path = safe_join(projects.project_dir(pid), value)
    if not path.is_file():
        raise VRSError(f"Recurso inexistente no projeto: {value}", code="missing_asset")
    return value


def _apply_assets(pid: str, preset: str, params: dict[str, Any], asset_path: str, asset_ids: list[str]) -> dict[str, str]:
    extra = [a for a in ([asset_path] if asset_path else []) + [f"lib:{i}" if not i.startswith("lib:") else i for i in asset_ids]]
    if preset == "vrs-doc-montage" and extra:
        imgs = [im for im in params.get("images", []) if im.get("asset")]
        for a in extra:
            if not any(im.get("asset") == a for im in imgs):
                imgs.append({"asset": a, "caption": "", "credit": ""})
        params["images"] = imgs[:5]
    elif preset == "vrs-object-stage" and extra and not any(o.get("asset") for o in params.get("objects", [])):
        params["objects"] = [{"asset": a, "icon": "star", "label": ""} for a in extra[:6]]
    elif preset in PRIMARY_ASSET and extra and not params.get(PRIMARY_ASSET[preset]):
        params[PRIMARY_ASSET[preset]] = extra[0]
    assets: dict[str, str] = {}
    for container, key in catalog.asset_fields(preset, params):
        rel = _resolve_asset(pid, container[key])
        container[key] = rel
        if rel:
            assets[rel] = rel
    return assets


def theme_for(project: dict[str, Any]) -> dict[str, Any]:
    if project.get("niche_id"):
        try:
            return dict(catalog.get_niche(project["niche_id"])["theme"])
        except VRSError:
            pass
    return {}


def expand(pid: str, storyboard: dict[str, Any], *, progress: Progress | None = None) -> dict[str, Any]:
    p = projects.get_project(pid)
    opts = p.get("options") or {}
    sb = Storyboard.model_validate(storyboard)
    quality = opts.get("quality", "final")
    w, h = (PREVIEW_ASPECTS if quality == "preview" else ASPECTS)[p["aspect"]]
    fps = int(opts.get("fps", 30))
    voice_id = opts.get("voice", "faber")
    use_voice = opts.get("narration", True) and voice_id != "none"
    captions = opts.get("captions", "word")
    niche = catalog.niches().get(p.get("niche_id", ""), {})
    default_tr = NICHE_TRANSITION.get(p.get("niche_id", ""), "fade")
    vdir = projects.project_dir(pid) / "voice"
    vdir.mkdir(exist_ok=True)

    scenes: list[dict[str, Any]] = []
    warnings: list[str] = []
    timings: dict[str, Any] = {}
    n = len(sb.scenes)
    for i, s in enumerate(sb.scenes):
        if progress:
            progress(f"cena {i + 1}/{n}: validação e recursos", i / max(1, n))
        spec = catalog.get_scene(s.preset_id)
        if spec.get("nativeFps") and spec["nativeFps"] != fps:
            raise VRSError(f"Cena {s.preset_id} exige {spec['nativeFps']} fps (o plano usa {fps}).", code="fps_mismatch")
        params = catalog.validate_params(s.preset_id, dict(s.parameters or {}))
        assets = _apply_assets(pid, s.preset_id, params, s.asset_path, s.asset_ids)
        if s.preset_id in ("vrs-doc-montage",) and not any(im.get("asset") for im in params.get("images", [])):
            raise VRSError(f"Cena {i + 1} (montagem documental) precisa de pelo menos uma imagem.", code="missing_asset")
        sid = s.id or f"s{i + 1:02d}"
        words: list[dict[str, Any]] = []
        timing = "none"
        min_ms = 0
        if s.narration.strip() and use_voice:
            if progress:
                progress(f"cena {i + 1}/{n}: voz local", (i + 0.5) / max(1, n))
            info = voice.synthesize_cached(s.narration, voice_id)
            dst = vdir / f"{sid}.wav"
            shutil.copyfile(info["wav"], dst)
            words = [{**wd, "start": wd["start"] + LEAD_MS, "end": wd["end"] + LEAD_MS} for wd in info["words"]]
            timing = info["timing"]
            min_ms = LEAD_MS + info["duration_ms"] + TAIL_MS
            timings[sid] = {"wav": f"voice/{sid}.wav", "offset_ms": LEAD_MS, "duration_ms": info["duration_ms"], "timing": timing, "cached": info.get("cached", False)}
        elif s.narration.strip():
            timing = "user_text"
        dur_ms = max(int(s.duration * 1000), min_ms)
        if min_ms > s.duration * 1000 + 400:
            warnings.append(f"Cena {sid}: a fala ({min_ms / 1000:.1f}s) não cabe em {s.duration:.1f}s; a cena foi estendida sem cortar palavras.")
        frames = math.ceil(dur_ms * fps / 1000)
        tr = s.transition or (default_tr if i else "fade")
        scenes.append(
            {
                "id": sid,
                "component": s.preset_id,
                "params": params,
                "durationInFrames": frames,
                "narration": s.narration,
                "words": words,
                "timing": timing,
                "assets": assets,
                "layers": [],
                "transitionIn": {"type": tr, "durationInFrames": 10 if tr != "none" else 0, "color": ""},
                "transitionOut": {"type": "none", "durationInFrames": 0, "color": ""},
                "sfx": _auto_sfx(pid, i, s.preset_id, tr, words, opts),
                "notes": "",
            }
        )
    total = sum(sc["durationInFrames"] for sc in scenes) / fps
    target = float(p["target_seconds"])
    if total > target * 1.2:
        warnings.append(f"Duração {total:.1f}s excede o alvo de {target:.0f}s em mais de 20%: o agente deve encurtar a narração.")
    elif total < target * 0.7:
        warnings.append(f"Duração {total:.1f}s ficou bem abaixo do alvo de {target:.0f}s.")
    music_rel = ""
    if sb.music:
        music_rel = _resolve_asset(pid, sb.music)
    plan = {
        "schema": "vrs.filmplan/1",
        "title": sb.title,
        "language": sb.language,
        "width": w,
        "height": h,
        "fps": fps,
        "theme": {**{"background": "#0b1020", "foreground": "#f5f7ff", "accent": "#ffb02e", "accent2": "#5ad1ff", "muted": "#8a93b8", "font": "sans", "visualLanguage": "motion-graphics"}, **theme_for(p), **(opts.get("theme") or {})},
        "captions": {"enabled": captions != "off", "mode": captions if captions in ("word", "phrase", "off") else "word", "position": "bottom", "maxWords": int(niche.get("captions", {}).get("maxWords", 3)), "highlight": "#ffd23f"},
        "audio": {"narration": "voice/narration.wav" if timings else "", "music": music_rel, "musicVolume": float(opts.get("music_volume", 0.12)), "duck": True, "voice": voice_id if timings else ""},
        "scenes": scenes,
        "uncertainties": sb.uncertainties,
        "sources": [s.model_dump() for s in sb.sources],
        "illustrativeData": sb.illustrative_data,
        "warnings": warnings,
    }
    validated = FilmPlan.model_validate(plan).model_dump(by_alias=True)
    write_json(vdir / "timings.json", timings)
    return validated


def storyboard_from_recipe(niche_id: str, *, title: str | None = None) -> dict[str, Any]:
    """Storyboard de demonstração (o exemplo do modelo) — ponto de partida editável."""
    n = catalog.get_niche(niche_id)
    return {
        "schema": "vrs.storyboard/1",
        "title": title or n["example"]["title"],
        "language": "pt-BR",
        "uncertainties": [],
        "illustrative_data": any(s["parameters"].get("illustrative") for s in n["recipe"]),
        "scenes": [
            {"preset_id": s["preset_id"], "parameters": s["parameters"], "narration": s["narration"], "duration": s["duration"], **({"transition": s["transition"]} if s.get("transition") else {})}
            for s in n["recipe"]
        ],
    }


def patch_scene(plan: dict[str, Any], scene_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Altera parâmetros/duração/transição de uma cena; o cache re-renderiza só ela."""
    allowed = {"params", "durationInFrames", "transitionIn", "transitionOut", "layers", "sfx", "notes"}
    bad = set(patch) - allowed
    if bad:
        raise VRSError(f"Campos não editáveis por patch: {', '.join(sorted(bad))}")
    for sc in plan["scenes"]:
        if sc["id"] == scene_id:
            if "params" in patch:
                merged = {**sc["params"], **patch["params"]}
                sc["params"] = catalog.validate_params(sc["component"], merged)
            for k in ("durationInFrames", "transitionIn", "transitionOut", "layers", "sfx", "notes"):
                if k in patch:
                    sc[k] = patch[k]
            if sc["words"] and sc["words"][-1]["end"] > sc["durationInFrames"] * 1000 / plan["fps"]:
                raise VRSError("A nova duração cortaria a narração da cena.", code="would_cut_words")
            return FilmPlan.model_validate(plan).model_dump(by_alias=True)
    raise VRSError(f"Cena não encontrada: {scene_id}", code="not_found", status=404)


def slugify_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:40]
