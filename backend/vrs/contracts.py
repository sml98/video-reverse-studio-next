"""Contratos versionados: Storyboard compacto (v1) e FilmPlan completo (v1).

Python (Pydantic) é a referência de validação no servidor; o frontend usa
Zod gerado a partir das mesmas especificações de parâmetros
(`frontend/src/contracts/*.json`). Nenhuma propriedade aceita JavaScript.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

STORYBOARD_SCHEMA = "vrs.storyboard/1"
FILMPLAN_SCHEMA = "vrs.filmplan/1"
WORDS_SCHEMA = "vrs.words/1"

MAX_FILM_SECONDS = 600
MAX_SCENE_SECONDS = 120
MAX_SCENES = 60
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_\-]{0,63}$")
COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

ASPECTS: dict[str, tuple[int, int]] = {
    "landscape": (1920, 1080),
    "vertical": (1080, 1920),
    "square": (1080, 1080),
}
PREVIEW_ASPECTS: dict[str, tuple[int, int]] = {
    "landscape": (1280, 720),
    "vertical": (720, 1280),
    "square": (720, 720),
}

Easing = Literal["linear", "smooth", "in", "out", "back", "spring", "cinematic", "elastic", "steps"]
TransitionType = Literal["none", "fade", "wipe", "slide", "zoom", "circle", "flash"]
CaptionMode = Literal["word", "phrase", "off"]
TimingPrecision = Literal["user_text", "proportional", "tts_phonemes", "asr_estimated", "forced_aligned", "none"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# --------------------------------------------------------------------------
# WordAnchor / tempos de palavras (ms)
# --------------------------------------------------------------------------
class WordTiming(Strict):
    id: str = Field(min_length=1, max_length=64)
    word: str = Field(min_length=1, max_length=80)
    start: int = Field(ge=0)
    end: int = Field(ge=0)

    @model_validator(mode="after")
    def _order(self) -> "WordTiming":
        if self.end <= self.start:
            raise ValueError(f"Palavra '{self.word}': end deve ser maior que start.")
        return self


def validate_words(words: list[WordTiming]) -> None:
    seen: set[str] = set()
    prev_start = -1
    for w in words:
        if w.id in seen:
            raise ValueError(f"ID de palavra duplicado: {w.id}")
        seen.add(w.id)
        if w.start < prev_start:
            raise ValueError("Palavras precisam estar em ordem crescente de início.")
        prev_start = w.start


# --------------------------------------------------------------------------
# Storyboard compacto
# --------------------------------------------------------------------------
class SceneAnchor(Strict):
    word: str = Field(default="", max_length=80, validation_alias=AliasChoices("word", "triggerWord"))
    occurrence: int = Field(default=1, ge=1, le=2000)
    spanWords: int = Field(default=1, ge=1, le=100)
    wordId: str = Field(default="", max_length=64)
    effect: Literal["highlight", "zoom_punch", "sticker_pop", "broll_overlay", "badge_flash", "camera_shake"] = "highlight"
    asset: str = Field(default="", max_length=400)
    label: str = Field(default="", max_length=160)
    sfx: str = Field(default="", max_length=400)
    model_config = ConfigDict(extra="forbid", populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="after")
    def _target(self) -> "SceneAnchor":
        if not self.word and not self.wordId:
            raise ValueError("Âncora exige word/triggerWord ou wordId.")
        return self


class StoryboardScene(Strict):
    role: str = Field(default="", max_length=80)
    title: str = Field(default="", max_length=160)
    sfx: str = Field(default="", max_length=400)
    anchors: list[SceneAnchor] = Field(default_factory=list, max_length=24)

    @model_validator(mode="before")
    @classmethod
    def _aliases(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        value = dict(value)
        for alias, canonical in (("presetId", "preset_id"), ("params", "parameters")):
            if alias in value:
                if canonical in value and value[canonical] != value[alias]:
                    raise ValueError(f"{alias} e {canonical} divergem.")
                value[canonical] = value.pop(alias)
        return value
    id: str | None = None
    preset_id: str = Field(min_length=1, max_length=80)
    parameters_json: str | None = Field(default=None, max_length=20000)
    parameters: dict[str, Any] | None = None
    narration: str = Field(default="", max_length=2000)
    voice: str = Field(default="", max_length=40)
    asset_path: str = Field(default="", max_length=400)
    asset_ids: list[str] = Field(default_factory=list, max_length=12)
    duration: float = Field(default=5, gt=0, le=MAX_SCENE_SECONDS)
    transition: TransitionType | None = None

    @field_validator("duration")
    @classmethod
    def _finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("Duração precisa ser finita.")
        return v

    @model_validator(mode="after")
    def _params(self) -> "StoryboardScene":
        if self.parameters_json and self.parameters is not None:
            raise ValueError("Use parameters_json OU parameters, não ambos.")
        if self.parameters_json:
            try:
                parsed = json.loads(self.parameters_json)
            except json.JSONDecodeError as e:
                raise ValueError(f"parameters_json não é JSON válido: {e.msg}") from e
            if not isinstance(parsed, dict):
                raise ValueError("parameters_json precisa ser um objeto JSON.")
            self.parameters = parsed
            self.parameters_json = None
        if self.parameters is None:
            self.parameters = {}
        return self


class Source(Strict):
    claim: str = Field(max_length=400)
    source: str = Field(max_length=400)


class Storyboard(Strict):
    niche_id: str = Field(default="", max_length=80, alias="nicheId")
    aspect: Literal["", "vertical", "landscape", "square"] = ""
    voice: str = Field(default="", max_length=40)
    captions: str = Field(default="", max_length=20)
    theme: dict[str, Any] | None = None
    style_mix: dict[str, Any] | None = None
    schema_: Literal["vrs.storyboard/1"] = Field(default=STORYBOARD_SCHEMA, alias="schema")
    title: str = Field(min_length=1, max_length=160)
    language: str = Field(default="pt-BR", max_length=16)
    uncertainties: list[str] = Field(default_factory=list, max_length=30)
    sources: list[Source] = Field(default_factory=list, max_length=40)
    illustrative_data: bool = False
    music: str = Field(default="", max_length=400)
    scenes: list[StoryboardScene] = Field(min_length=1, max_length=MAX_SCENES)

    model_config = ConfigDict(extra="forbid", populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="after")
    def _total(self) -> "Storyboard":
        total = sum(s.duration for s in self.scenes)
        if total > MAX_FILM_SECONDS:
            raise ValueError(f"Duração total {total:.0f}s excede {MAX_FILM_SECONDS}s.")
        return self


# --------------------------------------------------------------------------
# FilmPlan completo
# --------------------------------------------------------------------------
class Keyframe(Strict):
    frame: int = Field(ge=0)
    value: float
    easing: Easing = "smooth"

    @field_validator("value")
    @classmethod
    def _finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("Keyframe com valor não finito.")
        return v


AnimProp = Literal["x", "y", "scale", "scaleX", "scaleY", "rotate", "opacity", "progress", "blur"]


class Layer(Strict):
    id: str
    type: Literal["group", "text", "image", "rect", "circle", "path", "arrow"]
    parent: str | None = None
    x: float = 0
    y: float = 0
    w: float = 100
    h: float = 100
    pivotX: float = Field(default=0.5, ge=0, le=1)
    pivotY: float = Field(default=0.5, ge=0, le=1)
    text: str = Field(default="", max_length=400)
    src: str = Field(default="", max_length=400)
    d: str = Field(default="", max_length=4000)
    fill: str = "#ffffff"
    stroke: str = ""
    strokeWidth: float = Field(default=0, ge=0, le=200)
    fontSize: float = Field(default=48, gt=0, le=600)
    fontWeight: int = Field(default=700, ge=100, le=900)
    radius: float = Field(default=0, ge=0)
    animations: dict[AnimProp, list[Keyframe]] = Field(default_factory=dict)

    @field_validator("id")
    @classmethod
    def _id(cls, v: str) -> str:
        if not ID_RE.match(v):
            raise ValueError(f"ID de camada inválido: {v!r}")
        return v

    @field_validator("fill", "stroke")
    @classmethod
    def _color(cls, v: str) -> str:
        if v and not COLOR_RE.match(v):
            raise ValueError(f"Cor inválida: {v!r} (use #rrggbb)")
        return v

    @field_validator("d")
    @classmethod
    def _path(cls, v: str) -> str:
        # Só comandos de path SVG; nada de markup, URLs ou script.
        if v and not re.fullmatch(r"[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s\-+]*", v):
            raise ValueError("Path SVG contém caracteres não permitidos.")
        return v

    @model_validator(mode="after")
    def _kf(self) -> "Layer":
        for prop, kfs in self.animations.items():
            frames = [k.frame for k in kfs]
            if frames != sorted(frames) or len(set(frames)) != len(frames):
                raise ValueError(f"Keyframes de {self.id}.{prop} precisam ser estritamente crescentes.")
        return self


class Transition(Strict):
    type: TransitionType = "fade"
    durationInFrames: int = Field(default=12, ge=0, le=90)
    color: str = ""


class PlanScene(Strict):
    anchors: list[SceneAnchor] = Field(default_factory=list, max_length=24)
    id: str
    component: str = Field(min_length=1, max_length=80)
    params: dict[str, Any] = Field(default_factory=dict)
    durationInFrames: int = Field(gt=0)
    narration: str = Field(default="", max_length=2000)
    voice: str = Field(default="", max_length=40)
    words: list[WordTiming] = Field(default_factory=list)
    timing: TimingPrecision = "none"
    assets: dict[str, str] = Field(default_factory=dict)
    layers: list[Layer] = Field(default_factory=list, max_length=80)
    transitionIn: Transition = Field(default_factory=Transition)
    transitionOut: Transition = Field(default_factory=lambda: Transition(type="none", durationInFrames=0))
    sfx: list[dict[str, Any]] = Field(default_factory=list, max_length=32)
    notes: str = Field(default="", max_length=1000)

    @field_validator("id")
    @classmethod
    def _id(cls, v: str) -> str:
        if not ID_RE.match(v):
            raise ValueError(f"ID de cena inválido: {v!r}")
        return v

    @model_validator(mode="after")
    def _check(self) -> "PlanScene":
        validate_words(self.words)
        ids = [l.id for l in self.layers]
        if len(ids) != len(set(ids)):
            raise ValueError(f"Cena {self.id}: IDs de camada duplicados.")
        known = set(ids)
        for l in self.layers:
            if l.parent and l.parent not in known:
                raise ValueError(f"Cena {self.id}: camada {l.id} referencia pai inexistente {l.parent}.")
        return self


class Theme(Strict):
    background: str = "#0b1020"
    foreground: str = "#f5f7ff"
    accent: str = "#ffb02e"
    accent2: str = "#5ad1ff"
    muted: str = "#8a93b8"
    font: Literal["sans", "serif", "display", "mono", "rounded"] = "sans"
    visualLanguage: str = Field(default="motion-graphics", max_length=40)

    @field_validator("background", "foreground", "accent", "accent2", "muted")
    @classmethod
    def _color(cls, v: str) -> str:
        if not COLOR_RE.match(v):
            raise ValueError(f"Cor inválida: {v!r}")
        return v


class CaptionSettings(Strict):
    enabled: bool = True
    mode: CaptionMode = "word"
    position: Literal["bottom", "center", "top"] = "bottom"
    maxWords: int = Field(default=3, ge=1, le=6)
    highlight: str = "#ffd23f"
    style: Literal["hormozi", "karaoke", "cinema", "comic"] = "hormozi"


class AudioSettings(Strict):
    narration: str = ""
    music: str = ""
    musicVolume: float = Field(default=0.12, ge=0, le=1)
    duck: bool = True
    voice: str = ""


class FilmPlan(Strict):
    schema_: Literal["vrs.filmplan/1"] = Field(default=FILMPLAN_SCHEMA, alias="schema")
    title: str = Field(min_length=1, max_length=160)
    language: str = "pt-BR"
    width: int = Field(ge=240, le=3840)
    height: int = Field(ge=240, le=3840)
    fps: Literal[24, 25, 30, 60] = 30
    theme: Theme = Field(default_factory=Theme)
    captions: CaptionSettings = Field(default_factory=CaptionSettings)
    audio: AudioSettings = Field(default_factory=AudioSettings)
    scenes: list[PlanScene] = Field(min_length=1, max_length=MAX_SCENES)
    uncertainties: list[str] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
    illustrativeData: bool = False
    warnings: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid", populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="after")
    def _check(self) -> "FilmPlan":
        if self.width % 2 or self.height % 2:
            raise ValueError("Largura e altura precisam ser pares (H.264/yuv420p).")
        ids = [s.id for s in self.scenes]
        if len(ids) != len(set(ids)):
            raise ValueError("IDs de cena duplicados.")
        total = sum(s.durationInFrames for s in self.scenes) / self.fps
        if total > MAX_FILM_SECONDS:
            raise ValueError(f"Duração total {total:.0f}s excede {MAX_FILM_SECONDS}s.")
        for s in self.scenes:
            if s.durationInFrames / self.fps > MAX_SCENE_SECONDS:
                raise ValueError(f"Cena {s.id} excede {MAX_SCENE_SECONDS}s.")
            if s.words and s.words[-1].end > s.durationInFrames * 1000 / self.fps + 1:
                raise ValueError(f"Cena {s.id}: palavras ultrapassam a duração da cena.")
        return self

    @property
    def total_frames(self) -> int:
        return sum(s.durationInFrames for s in self.scenes)


def json_schemas() -> dict[str, dict[str, Any]]:
    return {
        "storyboard.schema.json": Storyboard.model_json_schema(by_alias=True),
        "filmplan.schema.json": FilmPlan.model_json_schema(by_alias=True),
    }
