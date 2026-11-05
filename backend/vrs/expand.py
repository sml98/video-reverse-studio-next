"""Expansão determinística: storyboard compacto → FilmPlan animado e renderizável.

O agente escreve conteúdo (cenas instaladas + parâmetros + narração); este módulo
valida, importa recursos com procedência, sintetiza a voz local (com cache),
ajusta durações à fala sem cortar palavras e aplica tema/transições do modelo.
"""
from __future__ import annotations

import copy
import math
import re
import shutil
from typing import Any, Callable

from . import catalog, library, projects, voice
from .anchors import resolve_anchor, normalize_token
from .contracts import ASPECTS, PREVIEW_ASPECTS, FilmPlan, Storyboard
from .util import VRSError, read_json, safe_join, write_json

LEAD_MS = 300  # respiro antes da fala (após a transição de entrada)
TAIL_MS = 450  # respiro depois da fala
TRANSITIONS = ["fade", "wipe", "slide", "zoom", "circle"]
NICHE_TRANSITION = {
    "ciencia": "wipe",
    "documentario": "fade",
    "meme": "flash",
    "cta": "zoom",
    "financas": "slide",
    "frases": "fade",
    "tutorial": "slide",
    "historia": "circle",
    "stickman": "wipe",
    "southpark": "slide",
    "roblox": "zoom",
    "multiplane": "fade",
    "pandora": "zoom",
}
NICHE_BGM = {
    "ciencia": "lib:vrs-pro-audio.bgm-lofi-explain",
    "tutorial": "lib:vrs-pro-audio.bgm-lofi-explain",
    "stickman": "lib:vrs-pro-audio.bgm-lofi-explain",
    "southpark": "lib:vrs-pro-audio.bgm-quirky-comedy",
    "meme": "lib:vrs-pro-audio.bgm-quirky-comedy",
    "roblox": "lib:vrs-pro-audio.bgm-blocky-gaming",
    "multiplane": "lib:vrs-pro-audio.bgm-blocky-gaming",
    "cta": "lib:vrs-pro-audio.bgm-blocky-gaming",
    "documentario": "lib:vrs-pro-audio.bgm-doc-suspense",
    "historia": "lib:vrs-pro-audio.bgm-doc-suspense",
    "frases": "lib:vrs-pro-audio.bgm-doc-suspense",
    "financas": "lib:vrs-pro-audio.bgm-corp-finance",
    "pandora": "lib:vrs-pro-audio.bgm-corp-finance",
}
NICHE_CAPTION_STYLE = {
    "southpark": "comic",
    "stickman": "comic",
    "meme": "hormozi",
    "cta": "hormozi",
    "roblox": "karaoke",
    "multiplane": "karaoke",
    "documentario": "cinema",
    "historia": "cinema",
    "frases": "cinema",
    "ciencia": "hormozi",
    "financas": "hormozi",
    "tutorial": "karaoke",
    "pandora": "hormozi",
}
PRIMARY_ASSET = {
    "vrs-pandora-cutout": "presenterAsset",
    "vrs-title": "backgroundAsset",
    "vrs-story-panel": "character",
    "vrs-meme": "image",
    "vrs-3d-stage": "model",
    "vrs-parallax-photo": "image",
    "vrs-stickman-stage": "boardAsset",
    "vrs-multiplane-stage": "character",
    "vrs-news-highlight": "image",
    "vrs-device-mockup": "screenAsset",
    "vrs-video-broll": "videoAsset",
}

Progress = Callable[[str, float], None]


def _auto_sfx(pid: str, idx: int, preset_id: str, tr: str, words: list[dict[str, Any]], opts: dict[str, Any]) -> list[dict[str, Any]]:
    """Injeta SFX cinematográficos da biblioteca local nas transições e palavras-âncora quando disponíveis."""
    if not opts.get("auto_sfx", True):
        return []
    try:
        items = library.search("", "sfx", "", limit=24).get("items") or []
    except Exception:
        return []
    if not items:
        return []
    by_id = {it["id"]: it["id"] for it in items}
    whoosh = by_id.get("vrs-pro-audio.sfx-whoosh") or next((it["id"] for it in items if "rollover" in it["id"] or "switch" in it["id"]), items[0]["id"])
    pop_sfx = by_id.get("vrs-pro-audio.sfx-pop-spring") or next((it["id"] for it in items if "click" in it["id"]), items[-1]["id"])
    sub_sfx = by_id.get("vrs-pro-audio.sfx-sub-drop") or pop_sfx
    marker_sfx = by_id.get("vrs-pro-audio.sfx-marker-write") or pop_sfx
    ding_sfx = by_id.get("vrs-pro-audio.sfx-ding-check") or pop_sfx

    cues: list[dict[str, Any]] = []
    if idx > 0 and tr != "none":
        rel = library.import_into_project(pid, whoosh)
        cues.append({"path": rel, "at_ms": 30, "volume": 0.18, "role": f"transition:{tr}"})
    elif idx == 0 and preset_id in ("vrs-title", "vrs-stat"):
        rel = library.import_into_project(pid, sub_sfx)
        cues.append({"path": rel, "at_ms": 60, "volume": 0.18, "role": "intro:drop"})

    if words and preset_id in (
        "vrs-pandora-cutout",
        "vrs-stat",
        "vrs-meme",
        "vrs-cta",
        "vrs-kinetic-quote",
        "vrs-calc",
        "vrs-code-walkthrough",
        "vrs-parallax-photo",
        "vrs-stickman-stage",
        "vrs-southpark-stage",
        "vrs-roblox-stage",
        "vrs-multiplane-stage",
        "vrs-news-highlight",
        "vrs-device-mockup",
        "vrs-video-broll",
    ):
        anchor = words[min(len(words) - 1, max(0, len(words) // 3))]
        chosen = (
            marker_sfx
            if preset_id in ("vrs-news-highlight", "vrs-stickman-stage")
            else ding_sfx
            if preset_id == "vrs-cta"
            else sub_sfx
            if preset_id == "vrs-stat"
            else pop_sfx
        )
        rel_c = library.import_into_project(pid, chosen)
        cues.append({"path": rel_c, "at_ms": int(anchor["start"]), "volume": 0.16, "role": f"anchor:{anchor['id']}"})
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


def _dossier_sfx(pid: str, params: dict[str, Any], words: list[dict[str, Any]], opts: dict[str, Any]) -> list[dict[str, Any]]:
    """Local foley at the same configurable document/counter cues used by the renderer."""
    if not opts.get("auto_sfx", True) or not params.get("soundEnabled", True):
        return []
    level = float(params.get("soundLevel", .65))
    if level <= 0:
        return []
    cues: list[dict[str, Any]] = []
    def add(resource: str, at: float, volume: float, role: str) -> None:
        try:
            rel = _resolve_asset(pid, f"lib:vrs-dossier.{resource}")
            cues.append({"path": rel, "at_ms": round(at), "volume": volume * level, "role": role})
        except VRSError:
            pass  # Optional pack absent: rendering remains available without sound.
    if params.get("entry") != "none":
        add("paper-slide", 40, .3, "dossier:paper")
    cue_word = params.get("cueWord", "").strip()
    if cue_word:
        matches = [w for w in words if normalize_token(w["word"]) == normalize_token(cue_word)]
        occurrence = max(1, int(params.get("cueOccurrence", 1)))
        if len(matches) < occurrence:
            return cues
        at_ms = matches[occurrence - 1]["start"]
    else:
        at_ms = float(params.get("cueSeconds", .7)) * 1000
    add("focus-click", at_ms, .23, "dossier:reveal")
    if params.get("showCounter"):
        add("counter-roll", at_ms + 50, .15, "dossier:counter")
    return cues


def _chibi_sfx(pid: str, params: dict[str, Any], duration_ms: int, opts: dict[str, Any]) -> list[dict[str, Any]]:
    if not opts.get("auto_sfx",True) or not params.get("soundEnabled",True):
        return []
    level=float(params.get("soundLevel",.65)); mode=params.get("mode","hello")
    if level<=0:return []
    events=[("sfx-whoosh",40,.14)]
    action=float(params.get("actionProgress",.72))
    if mode in ("prompt","edit","styles","finish"):
        events.append(("sfx-marker-write",duration_ms*action,.2))
    if mode=="prompt":
        events.extend(("sfx-marker-write",duration_ms*(.1+i*max(.01,action-.3)/6),.045) for i in range(7))
    if mode=="finish":events.append(("sfx-ding-check",duration_ms*min(.99,action+.12),.2))
    cues=[]
    for resource,at,volume in events:
        try:cues.append({"path":_resolve_asset(pid,"lib:vrs-pro-audio."+resource),"at_ms":round(at),"volume":volume*level,"role":"chibi:"+resource})
        except VRSError:pass
    return cues


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


def _is_duet_scene(preset_id: str, params: dict[str, Any]) -> bool:
    if preset_id == "vrs-stickman-stage" and params.get("action") == "duet_debate":
        return True
    if preset_id == "vrs-southpark-stage" and params.get("mode") == "duet":
        return True
    if preset_id == "vrs-roblox-stage" and params.get("action") == "duet_3d":
        return True
    if preset_id == "vrs-multiplane-stage" and bool(params.get("secondCharacter")):
        return True
    return False


def expand(pid: str, storyboard: dict[str, Any], *, progress: Progress | None = None) -> dict[str, Any]:
    p = projects.get_project(pid)
    opts = p.get("options") or {}
    sb = Storyboard.model_validate(storyboard)
    quality = opts.get("quality", "final")
    w, h = (PREVIEW_ASPECTS if quality == "preview" else ASPECTS)[p["aspect"]]
    if sb.aspect:
        w, h = (PREVIEW_ASPECTS if quality == "preview" else ASPECTS)[sb.aspect]
    fps = int(opts.get("fps", 30))
    voice_id = sb.voice or opts.get("voice", "faber")
    use_voice = opts.get("narration", True) and voice_id != "none"
    captions = sb.captions or opts.get("captions", "word")
    niche_id = p.get("niche_id", "")
    niche = catalog.niches().get(niche_id, {})
    default_tr = NICHE_TRANSITION.get(niche_id, "fade")
    vdir = projects.project_dir(pid) / "voice"
    vdir.mkdir(exist_ok=True)
    installed_voices = {v["id"] for v in voice.list_voices()}

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
        sc_voice = s.voice or ("duet" if (_is_duet_scene(s.preset_id, params) and "duet" in installed_voices) else voice_id)
        if s.narration.strip() and use_voice:
            if progress:
                progress(f"cena {i + 1}/{n}: voz local ({sc_voice})", (i + 0.5) / max(1, n))
            info = voice.synthesize_cached(s.narration, sc_voice if sc_voice in installed_voices else voice_id)
            dst = vdir / f"{sid}.wav"
            shutil.copyfile(info["wav"], dst)
            words = [{**wd, "start": wd["start"] + LEAD_MS, "end": wd["end"] + LEAD_MS} for wd in info["words"]]
            timing = info["timing"]
            min_ms = LEAD_MS + info["duration_ms"] + TAIL_MS
            timings[sid] = {"wav": f"voice/{sid}.wav", "offset_ms": LEAD_MS, "duration_ms": info["duration_ms"], "timing": timing, "cached": info.get("cached", False), "voice": sc_voice}
        elif s.narration.strip():
            timing = "user_text"
        dur_ms = max(int(s.duration * 1000), min_ms)
        if min_ms > s.duration * 1000 + 400:
            warnings.append(f"Cena {sid}: a fala ({min_ms / 1000:.1f}s) não cabe em {s.duration:.1f}s; a cena foi estendida sem cortar palavras.")
        frames = math.ceil(dur_ms * fps / 1000)
        tr = s.transition or (default_tr if i else "fade")
        anchors = [a.model_dump() for a in s.anchors]
        scene_sfx = _dossier_sfx(pid, params, words, opts) if s.preset_id == "vrs-dossier" else _auto_sfx(pid, i, s.preset_id, tr, words, opts)
        if s.preset_id=="vrs-framerise-chibi":
            scene_sfx=_chibi_sfx(pid,params,dur_ms,opts)
        if s.sfx:
            scene_sfx.append({"path": _resolve_asset(pid, s.sfx), "at_ms": words[0]["start"] if words else 0, "volume": 0.16, "role": "scene"})
        for anchor in anchors:
            if anchor["asset"]:
                rel = _resolve_asset(pid, anchor["asset"])
                anchor["asset"] = rel
                assets[rel] = rel
            try:
                start_ms, _ = resolve_anchor(words, anchor)
                if anchor["sfx"]:
                    scene_sfx.append({"path": _resolve_asset(pid, anchor["sfx"]), "at_ms": start_ms, "volume": 0.16, "role": "word_anchor"})
                elif opts.get("auto_sfx", True):
                    auto_id = "lib:vrs-pro-audio.sfx-whoosh" if anchor.get("effect") in ("zoom_punch", "camera_shake") else "lib:vrs-pro-audio.sfx-pop-spring"
                    try:
                        scene_sfx.append({"path": _resolve_asset(pid, auto_id), "at_ms": start_ms, "volume": 0.14, "role": "word_anchor_auto"})
                    except Exception:
                        pass
            except VRSError:
                warnings.append(f"Cena {sid}: âncora '{anchor['word'] or anchor['wordId']}' sem tempo válido nesta narração; efeito não será exibido.")
        scenes.append(
            {
                "id": sid,
                "component": s.preset_id,
                "params": params,
                "durationInFrames": frames,
                "narration": s.narration,
                "voice": sc_voice if timings.get(sid) else "",
                "words": words,
                "timing": timing,
                "assets": assets,
                "layers": [],
                "transitionIn": {"type": tr, "durationInFrames": 10 if tr != "none" else 0, "color": ""},
                "transitionOut": {"type": "none", "durationInFrames": 0, "color": ""},
                "sfx": scene_sfx[:32],
                "anchors": anchors,
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
    wanted_music = sb.music or opts.get("music") or ""
    if wanted_music and wanted_music != "none":
        try:
            music_rel = _resolve_asset(pid, wanted_music)
        except Exception:
            music_rel = ""
    elif not wanted_music and opts.get("auto_bgm", True) and niche_id in NICHE_BGM:
        try:
            music_rel = _resolve_asset(pid, NICHE_BGM[niche_id])
        except Exception:
            music_rel = ""
    override_theme = dict(sb.theme or {})
    for alias, key in (("primary", "accent"), ("secondary", "accent2"), ("text", "foreground")):
        if alias in override_theme:
            override_theme[key] = override_theme.pop(alias)
    cap_style = (sb.captions if sb.captions in ("hormozi", "karaoke", "cinema", "comic") else "") or opts.get("caption_style") or niche.get("captions", {}).get("style") or NICHE_CAPTION_STYLE.get(niche_id, "hormozi")
    plan = {
        "schema": "vrs.filmplan/1",
        "title": sb.title,
        "language": sb.language,
        "width": w,
        "height": h,
        "fps": fps,
        "theme": {**{"background": "#0b1020", "foreground": "#f5f7ff", "accent": "#ffb02e", "accent2": "#5ad1ff", "muted": "#8a93b8", "font": "sans", "visualLanguage": "motion-graphics"}, **theme_for(p), **(opts.get("theme") or {}), **override_theme},
        "captions": {
            "enabled": captions != "off",
            "mode": captions if captions in ("word", "phrase", "off") else "word",
            "position": niche.get("captions", {}).get("position", "bottom"),
            "maxWords": int(niche.get("captions", {}).get("maxWords", 3)),
            "highlight": niche.get("captions", {}).get("highlight", "#ffd23f"),
            "style": cap_style if cap_style in ("hormozi", "karaoke", "cinema", "comic") else "hormozi",
        },
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
        "sources": n.get("sources", []),
        "illustrative_data": any(s["parameters"].get("illustrative") or s["parameters"].get("fictional") for s in n["recipe"]),
        "music": n.get("music", ""),
        "scenes": [
            {
                "preset_id": s["preset_id"],
                "parameters": copy.deepcopy(s["parameters"]),
                "narration": s["narration"],
                "duration": s["duration"],
                **({"voice": s["voice"]} if s.get("voice") else {}),
                **({"transition": s["transition"]} if s.get("transition") else {}),
                **({"anchors": copy.deepcopy(s["anchors"])} if s.get("anchors") else {}),
            }
            for s in n["recipe"]
        ],
    }


def auto_storyboard_from_idea(niche_id: str, idea: str, target_seconds: float | None = None, *, title: str = "", studio_sliders: dict[str, Any] | None = None) -> dict[str, Any]:
    """Diretor local autônomo: adapta a receita editorial do nicho à ideia do usuário sem esperar agente externo."""
    if studio_sliders is not None:
        from .studio import mix_storyboard
        return mix_storyboard(niche_id, idea, float(target_seconds or 30), studio_sliders, title=title)
    n = catalog.get_niche(niche_id)
    clean_idea = re.sub(r"[^\S\n]+", " ", (idea or "").strip())
    if not clean_idea:
        return storyboard_from_recipe(niche_id, title=title or None)

    from .direction import storyboard_from_script
    return storyboard_from_script(niche_id,clean_idea,float(target_seconds or n["defaultDuration"]),title=title)



def patch_scene(plan: dict[str, Any], scene_id: str, patch: dict[str, Any], *, pid: str | None = None) -> dict[str, Any]:
    """Altera parâmetros/componente/duração/transição/narração de uma cena; o cache re-renderiza só ela."""
    plan = copy.deepcopy(plan)
    allowed = {"component", "params", "durationInFrames", "transitionIn", "transitionOut", "layers", "sfx", "notes", "narration", "voice", "anchors"}
    bad = set(patch) - allowed
    if bad:
        raise VRSError(f"Campos não editáveis por patch: {', '.join(sorted(bad))}")
    fps = int(plan.get("fps", 30))
    for sc in plan["scenes"]:
        if sc["id"] == scene_id:
            if "component" in patch and patch["component"] != sc["component"]:
                catalog.get_scene(patch["component"])
                sc["component"] = patch["component"]
                sc["params"] = catalog.validate_params(sc["component"], {})
            if "params" in patch:
                spec_keys = {p["key"] for p in catalog.get_scene(sc["component"])["params"]}
                filtered = {k: v for k, v in {**sc["params"], **patch["params"]}.items() if k in spec_keys}
                sc["params"] = catalog.validate_params(sc["component"], filtered)
                if pid:
                    extra_assets = _apply_assets(pid, sc["component"], sc["params"], "", [])
                    sc["assets"] = {**(sc.get("assets") or {}), **extra_assets}
            for k in ("durationInFrames", "transitionIn", "transitionOut", "layers", "sfx", "notes", "anchors"):
                if k in patch:
                    sc[k] = patch[k]
            previous_narration = sc.get("narration", "")
            previous_words = sc.get("words", [])
            if ("narration" in patch or "voice" in patch) and pid:
                new_narr = str(patch.get("narration", sc.get("narration", ""))).strip()
                new_voice = str(patch.get("voice", sc.get("voice") or plan.get("audio", {}).get("voice") or "faber")).strip() or "faber"
                if new_narr != previous_narration:
                    for anchor in sc.get("anchors", []):
                        if anchor.get("wordId"):
                            old_index = next((i for i,w in enumerate(previous_words) if w["id"] == anchor["wordId"]), -1)
                            if old_index >= 0:
                                anchor["word"] = previous_words[old_index]["word"]
                                anchor["occurrence"] = sum(normalize_token(w["word"]) == normalize_token(anchor["word"]) for w in previous_words[:old_index+1])
                                anchor["wordId"] = ""
                sc["narration"] = new_narr
                sc["voice"] = new_voice
                if new_narr and new_voice != "none":
                    vdir = projects.project_dir(pid) / "voice"
                    vdir.mkdir(exist_ok=True)
                    info = voice.synthesize_cached(new_narr, new_voice)
                    shutil.copyfile(info["wav"], vdir / f"{scene_id}.wav")
                    sc["words"] = [{**wd, "start": wd["start"] + LEAD_MS, "end": wd["end"] + LEAD_MS} for wd in info["words"]]
                    sc["timing"] = info["timing"]
                    min_ms = LEAD_MS + info["duration_ms"] + TAIL_MS
                    sc["durationInFrames"] = max(int(sc["durationInFrames"]), math.ceil(min_ms * fps / 1000))
                    timings = read_json(vdir / "timings.json", {}) or {}
                    timings[scene_id] = {"wav": f"voice/{scene_id}.wav", "offset_ms": LEAD_MS, "duration_ms": info["duration_ms"], "timing": info["timing"], "cached": info.get("cached", False), "voice": new_voice}
                    write_json(vdir / "timings.json", timings)
                    plan["audio"]["narration"] = "voice/narration.wav"
            if pid and "anchors" in patch:
                from .contracts import SceneAnchor
                sc["anchors"] = [SceneAnchor.model_validate(a).model_dump() for a in sc.get("anchors", [])]
                for anchor in sc["anchors"]:
                    if anchor["asset"]:
                        rel = _resolve_asset(pid, anchor["asset"])
                        anchor["asset"] = rel
                        sc["assets"][rel] = rel
            if pid and ("anchors" in patch or "narration" in patch or "voice" in patch):
                sc["sfx"] = [cue for cue in sc.get("sfx", []) if cue.get("role") != "word_anchor"]
                for anchor in sc.get("anchors", []):
                    if anchor.get("sfx"):
                        try:
                            at_ms, _ = resolve_anchor(sc["words"], anchor)
                        except VRSError:
                            continue
                        sc["sfx"].append({"path": _resolve_asset(pid, anchor["sfx"]), "at_ms": at_ms, "volume": 0.16, "role": "word_anchor"})
                sc["sfx"] = sc["sfx"][:32]
            if sc["words"] and sc["words"][-1]["end"] > sc["durationInFrames"] * 1000 / fps:
                raise VRSError("A nova duração cortaria a narração da cena.", code="would_cut_words")
            return FilmPlan.model_validate(plan).model_dump(by_alias=True)
    raise VRSError(f"Cena não encontrada: {scene_id}", code="not_found", status=404)


def manage_scene(pid: str, plan: dict[str, Any], action: str, scene_id: str, *, preset_id: str = "vrs-stickman-stage") -> dict[str, Any]:
    """Adiciona, duplica, move (move_up/move_down) ou remove uma cena na linha do tempo do FilmPlan."""
    scenes: list[dict[str, Any]] = list(plan.get("scenes") or [])
    idx = next((i for i, s in enumerate(scenes) if s["id"] == scene_id), -1)
    if idx < 0 and action != "add":
        raise VRSError(f"Cena não encontrada: {scene_id}", code="not_found", status=404)

    existing_ids = {s["id"] for s in scenes}
    n_idx = len(scenes) + 1
    while f"s{n_idx:02d}" in existing_ids:
        n_idx += 1
    new_sid = f"s{n_idx:02d}"

    vdir = projects.project_dir(pid) / "voice"
    timings = read_json(vdir / "timings.json", {}) or {}

    if action == "move_up" and idx > 0:
        scenes[idx - 1], scenes[idx] = scenes[idx], scenes[idx - 1]
    elif action == "move_down" and 0 <= idx < len(scenes) - 1:
        scenes[idx + 1], scenes[idx] = scenes[idx], scenes[idx + 1]
    elif action == "delete":
        if len(scenes) <= 1:
            raise VRSError("O vídeo precisa ter pelo menos 1 cena.")
        removed = scenes.pop(idx)
        timings.pop(removed["id"], None)
        write_json(vdir / "timings.json", timings)
    elif action == "duplicate":
        clone = copy.deepcopy(scenes[idx])
        clone["id"] = new_sid
        if scene_id in timings and (vdir / f"{scene_id}.wav").exists():
            shutil.copyfile(vdir / f"{scene_id}.wav", vdir / f"{new_sid}.wav")
            timings[new_sid] = {**timings[scene_id], "wav": f"voice/{new_sid}.wav"}
            write_json(vdir / "timings.json", timings)
        scenes.insert(idx + 1, clone)
    elif action == "add":
        catalog.get_scene(preset_id)
        params = catalog.validate_params(preset_id, {})
        assets = _apply_assets(pid, preset_id, params, "", [])
        new_sc = {
            "id": new_sid,
            "component": preset_id,
            "params": params,
            "durationInFrames": int(plan.get("fps", 30)) * 4,
            "narration": "",
            "voice": plan.get("audio", {}).get("voice") or "faber",
            "words": [],
            "timing": "none",
            "assets": assets,
            "layers": [],
            "transitionIn": {"type": "fade", "durationInFrames": 10, "color": ""},
            "transitionOut": {"type": "none", "durationInFrames": 0, "color": ""},
            "sfx": [],
            "notes": "Nova cena adicionada pelo estúdio",
        }
        ins_at = idx + 1 if idx >= 0 else len(scenes)
        scenes.insert(ins_at, new_sc)
    else:
        raise VRSError(f"Ação de timeline inválida: {action}")

    plan["scenes"] = scenes
    return FilmPlan.model_validate(plan).model_dump(by_alias=True)


def slugify_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:40]
