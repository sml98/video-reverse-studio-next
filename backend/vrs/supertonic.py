"""Optional Supertonic 3 provider. Installed weights only, CPU only, no network."""
from __future__ import annotations

import importlib.util
import os
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from .config import settings
from .util import VRSError, sha256_file, sha256_text

_lock = threading.Lock()
_engine: tuple[str, Any, Any] | None = None


def model_dir() -> Path:
    return Path(os.environ.get("FRAMERISE_SUPERTONIC_MODELS", str(settings().tools / "supertonic3-models"))).expanduser()


def voices() -> list[dict[str, Any]]:
    root = model_dir()
    required = ["duration_predictor.onnx", "text_encoder.onnx", "vector_estimator.onnx", "vocoder.onnx", "tts.json", "unicode_indexer.json"]
    if not importlib.util.find_spec("onnxruntime") or not all((root / "onnx" / f).is_file() for f in required):
        return []
    return [{"id":f"supertonic-{style.lower()}", "label":f"{style} · feminina · Supertonic 3", "engine":"supertonic3", "language":"pt", "quality":"feminina · altura natural", "file":f"{style}.json", "sample_rate":44100, "model_card":"Supertonic 3: inferência local CPU; código MIT, pesos Open RAIL-M. Português sem seletor exclusivo pt-BR. Sem alteração de pitch.", "audition":f"/media/voices/supertonic-{style.lower()}/audition.wav" if (settings().voices_dir/f"supertonic-{style.lower()}"/"audition.wav").is_file() else ""} for style in ["F2","F4","F5"] if (root/"voice_styles"/f"{style}.json").is_file()]


def _style(voice_id: str) -> str:
    if voice_id not in {v["id"] for v in voices()}:
        raise VRSError("Voz Supertonic não instalada. Configure FRAMERISE_SUPERTONIC_MODELS com os pesos locais e a pasta voice_styles.", code="voice_missing")
    return voice_id.split("-")[-1].upper()


@lru_cache(maxsize=12)
def _fingerprint(root: str, signatures: tuple[tuple[str, int, int], ...]) -> str:
    return sha256_text("supertonic3", [(name, sha256_file(Path(root)/name)) for name, _, _ in signatures])


def fingerprint(voice_id: str) -> str:
    root = model_dir()
    style = _style(voice_id)
    paths = sorted((root/"onnx").glob("*")) + [root/"voice_styles"/f"{style}.json"]
    signatures = tuple((p.relative_to(root).as_posix(),p.stat().st_size,p.stat().st_mtime_ns) for p in paths if p.is_file())
    return _fingerprint(str(root), signatures)


def generate(text: str, voice_id: str, *, length_scale: float = 1.0) -> tuple[np.ndarray, int]:
    global _engine
    root = model_dir()
    style = _style(voice_id)
    from .vendor.supertonic import helper
    import onnxruntime as ort
    with _lock:
        if _engine is None or _engine[0] != str(root):
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = settings().threads
            opts.inter_op_num_threads = 1
            opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            sessions = helper.load_onnx_all(str(root/"onnx"), opts, ["CPUExecutionProvider"])
            tts = helper.TextToSpeech(helper.load_cfgs(str(root/"onnx")),helper.load_text_processor(str(root/"onnx")),*sessions)
            _engine = (str(root),tts,helper)
        _, tts, helper = _engine
        voice = helper.load_voice_style([str(root/"voice_styles"/f"{style}.json")])
        # Local PRNG state is restored so synthesis cannot change other generators.
        state = np.random.get_state()
        try:
            np.random.seed(2404)
            wav, duration = tts(text,"pt",voice,total_step=12,speed=1.0/length_scale,silence_duration=.15)
        finally:
            np.random.set_state(state)
        sr = tts.sample_rate
        audio = wav[0,:int(sr*duration[0].item())].astype(np.float32)
    if not len(audio) or not np.isfinite(audio).all():
        raise VRSError("A voz local produziu áudio inválido.", code="voice_failed")
    window = max(1,round(sr*.01)); count = len(audio)//window
    active = np.flatnonzero(np.sqrt(np.mean(audio[:count*window].reshape(count,window)**2,axis=1)) > .0025) if count else []
    if len(active):
        audio = audio[max(0,int(active[0]*window-.1*sr)):min(len(audio),int((active[-1]+1)*window+.18*sr))]
    return np.clip(audio*32767,-32768,32767).astype(np.int16),sr
