"""Voz local em CPU com Piper; tempos de palavras derivados do próprio sintetizador.

Precisão dos tempos (nunca promovida além do que é):
  - "tts_phonemes": durações de fonemas emitidas pelo modelo Piper, agrupadas por palavra
    (quando a contagem de palavras do texto e dos fonemas coincide na frase);
  - "proportional": distribuição proporcional ao número de letras dentro da frase.
Sem fallback de rede: se não houver modelo local, a síntese falha com mensagem clara.
"""
from __future__ import annotations

import json
import re
import threading
import wave
from pathlib import Path
from typing import Any

import numpy as np

from . import ENGINE_VERSION
from .config import settings
from .util import VRSError, sha256_file, sha256_text, write_json

SAMPLE_FADE_MS = 30
_lock = threading.Lock()
_voices: dict[str, Any] = {}


def list_voices() -> list[dict[str, Any]]:
    out = []
    vd = settings().voices_dir
    for onnx in sorted(vd.glob("*/*.onnx")):
        cfg = onnx.with_suffix(".onnx.json")
        if not cfg.exists():
            continue
        meta = json.loads(cfg.read_text(encoding="utf-8"))
        card = onnx.parent / "MODEL_CARD"
        out.append(
            {
                "id": onnx.parent.name,
                "file": onnx.name,
                "language": meta.get("language", {}).get("code", meta.get("espeak", {}).get("voice", "")),
                "quality": meta.get("audio", {}).get("quality", ""),
                "sample_rate": meta.get("audio", {}).get("sample_rate", 22050),
                "model_card": card.read_text(encoding="utf-8", errors="ignore")[:600] if card.exists() else "",
                "audition": f"/media/voices/{onnx.parent.name}/audition.wav" if (onnx.parent / "audition.wav").exists() else "",
            }
        )
    return out


def _model_path(voice_id: str) -> Path:
    if not re.fullmatch(r"[a-z0-9_\-]{1,40}", voice_id or ""):
        raise VRSError("ID de voz inválido.")
    d = settings().voices_dir / voice_id
    onnx = next(iter(sorted(d.glob("*.onnx"))), None)
    if not onnx:
        raise VRSError(f"Voz '{voice_id}' não instalada em .tools/voices. Rode scripts/install-assets.sh --voices (instalação explícita).", code="voice_missing")
    return onnx


def _load(voice_id: str):
    with _lock:
        if voice_id not in _voices:
            try:
                from piper import PiperVoice
            except ImportError as e:  # pragma: no cover
                raise VRSError("piper-tts não instalado (pip install '.[voice]').", code="missing_dep") from e
            onnx = _model_path(voice_id)
            try:
                _voices[voice_id] = (PiperVoice.load(onnx, include_alignments=True), True)
            except Exception:
                _voices[voice_id] = (PiperVoice.load(onnx), False)
        return _voices[voice_id]


WORD_RE = re.compile(r"\S+")


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?…])\s+", text.strip())
    return [p for p in parts if p.strip()]


def _word_timings_for_chunk(chunk_words: list[str], phoneme_words: list[float] | None, start_ms: float, dur_ms: float) -> tuple[list[tuple[str, float, float]], bool]:
    """Retorna [(palavra, ini, fim)] e se veio de fonemas."""
    if phoneme_words and len(phoneme_words) == len(chunk_words):
        total = sum(phoneme_words) or 1.0
        out, t = [], start_ms
        scale = dur_ms / total
        for w, d in zip(chunk_words, phoneme_words):
            out.append((w, t, t + d * scale))
            t += d * scale
        return out, True
    weights = [max(1, len(re.sub(r"\W", "", w))) + 1 for w in chunk_words]
    total = sum(weights) or 1
    lead = min(80.0, dur_ms * 0.05)
    usable = max(1.0, dur_ms - 2 * lead)
    out, t = [], start_ms + lead
    for w, wt in zip(chunk_words, weights):
        d = usable * wt / total
        out.append((w, t, t + d))
        t += d
    return out, False


def _phoneme_word_durations(voice, chunk) -> list[float] | None:
    """Agrupa amostras por fonema em palavras (separador = espaço do eSpeak)."""
    al = getattr(chunk, "phoneme_alignments", None)
    if not al:
        return None
    words: list[float] = []
    cur = 0.0
    started = False
    for a in al:
        ph = getattr(a, "phoneme", None)
        n = float(getattr(a, "num_samples", 0))
        if ph == " ":
            if started:
                words.append(cur)
            cur, started = n, False  # espaço conta para a palavra seguinte
            continue
        if ph in ("^", "$", "_"):
            if ph == "$" and started:
                words.append(cur)
                cur, started = 0.0, False
            else:
                cur += n
            continue
        cur += n
        started = True
    if started:
        words.append(cur)
    return words or None


def _regroup(voice, text_words: list[str], ph_words: list[float]) -> list[float] | None:
    """Números/siglas viram várias palavras faladas: conta quantas cada palavra escrita gera."""
    counts = []
    for w in text_words:
        try:
            sents = voice.phonemize(w)
            n = sum(len([x for x in "".join(s).split(" ") if x.strip()]) for s in sents)
        except Exception:
            return None
        counts.append(max(1, n))
    if sum(counts) != len(ph_words):
        return None
    out, i = [], 0
    for n in counts:
        out.append(sum(ph_words[i : i + n]))
        i += n
    return out


def synthesize(text: str, voice_id: str, out_wav: Path, *, length_scale: float = 1.0) -> dict[str, Any]:
    """Sintetiza `text` em WAV mono 16-bit, com fades anti-click e tempos de palavras (ms)."""
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        raise VRSError("Texto vazio para narração.")
    voice, has_align = _load(voice_id)
    from piper import SynthesisConfig

    cfg = SynthesisConfig(length_scale=length_scale, normalize_audio=True)
    sr = voice.config.sample_rate
    audio_parts: list[np.ndarray] = []
    words: list[dict[str, Any]] = []
    pos = 0
    precise_all = True
    gap = np.zeros(int(sr * 0.12), dtype=np.int16)
    sentences = _split_sentences(text)
    widx = 0
    for si, sentence in enumerate(sentences):
        chunks = list(voice.synthesize(sentence, syn_config=cfg, include_alignments=has_align))
        if not chunks:
            continue
        s_words = WORD_RE.findall(sentence)
        # Piper pode dividir em vários chunks; tratamos a frase inteira como bloco.
        arr = np.concatenate([c.audio_int16_array for c in chunks]).astype(np.int16)
        ph_words: list[float] | None = []
        for c in chunks:
            pw = _phoneme_word_durations(voice, c) if has_align else None
            if pw is None:
                ph_words = None
                break
            ph_words.extend(pw)  # type: ignore[union-attr]
        if ph_words is not None and len(ph_words) != len(s_words):
            ph_words = _regroup(voice, s_words, ph_words)
        start_ms = pos * 1000 / sr
        dur_ms = len(arr) * 1000 / sr
        timings, precise = _word_timings_for_chunk(s_words, ph_words, start_ms, dur_ms)
        precise_all = precise_all and precise
        for w, a, b in timings:
            widx += 1
            words.append({"id": f"w-{widx}", "word": w, "start": int(a), "end": int(max(a + 1, b))})
        audio_parts.append(arr)
        pos += len(arr)
        if si < len(sentences) - 1:
            audio_parts.append(gap)
            pos += len(gap)
    audio = np.concatenate(audio_parts) if audio_parts else np.zeros(1, dtype=np.int16)
    audio = apply_fades(audio, sr, SAMPLE_FADE_MS)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    write_wav(out_wav, audio, sr)
    # Garante monotonicidade e ausência de sobreposição.
    for i in range(1, len(words)):
        if words[i]["start"] < words[i - 1]["end"]:
            words[i]["start"] = words[i - 1]["end"]
        if words[i]["end"] <= words[i]["start"]:
            words[i]["end"] = words[i]["start"] + 1
    return {"wav": str(out_wav), "duration_ms": int(len(audio) * 1000 / sr), "sample_rate": sr, "words": words, "timing": "tts_phonemes" if precise_all else "proportional", "voice": voice_id}


def apply_fades(audio: np.ndarray, sr: int, ms: int) -> np.ndarray:
    n = min(len(audio) // 2, int(sr * ms / 1000))
    if n <= 0:
        return audio
    a = audio.astype(np.float32)
    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
    a[:n] *= ramp
    a[-n:] *= ramp[::-1]
    return np.clip(a, -32768, 32767).astype(np.int16)


def write_wav(path: Path, audio: np.ndarray, sr: int) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(audio.astype(np.int16).tobytes())


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        if w.getnchannels() == 2:
            data = data.reshape(-1, 2).mean(axis=1).astype(np.int16)
    return data, sr


def voice_hash(voice_id: str) -> str:
    onnx = _model_path(voice_id)
    marker = onnx.with_suffix(".sha256")
    if marker.exists() and marker.stat().st_mtime >= onnx.stat().st_mtime:
        return marker.read_text().strip()
    h = sha256_file(onnx)
    try:
        marker.write_text(h)
    except OSError:
        pass
    return h


def synthesize_cached(text: str, voice_id: str, *, length_scale: float = 1.0) -> dict[str, Any]:
    """Cache por hash(texto, bytes do modelo, versão do motor, parâmetros)."""
    key = sha256_text("voice", ENGINE_VERSION, text.strip(), voice_hash(voice_id), length_scale, "piper-1.8.0")
    d = settings().cache / "voice" / key[:2]
    wav = d / f"{key}.wav"
    meta = d / f"{key}.json"
    if wav.exists() and meta.exists():
        info = json.loads(meta.read_text(encoding="utf-8"))
        info["cached"] = True
        info["wav"] = str(wav)
        return info
    info = synthesize(text, voice_id, wav, length_scale=length_scale)
    info["cache_key"] = key
    write_json(meta, info)
    info["cached"] = False
    return info
