"""Revisão pós-render: validação técnica, gates Kinocut, quadros reais, movimento e áudio.

Estados distintos (validação de codec NÃO é aprovação artística):
  technical: aprovado_tecnicamente | aprovado_com_achados | reprovado
  content:   aguardando_revisao_conteudo | aprovado_conteudo | ajustes_pedidos
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from . import projects
from .render import kinocut_bin
from .util import VRSError, read_json, run, sanitize, write_json

MEDIA_SCENES = {"vrs-doc-montage", "vrs-story-panel"}


def probe(path: Path) -> dict[str, Any]:
    out = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)], timeout=60).stdout
    info = json.loads(out)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    fps = 0.0
    if v and v.get("avg_frame_rate", "0/0") != "0/0":
        n, d = v["avg_frame_rate"].split("/")
        fps = float(n) / float(d) if float(d) else 0.0
    return {
        "duration": float(info["format"].get("duration", 0)),
        "size": int(info["format"].get("size", 0)),
        "video": {"codec": v.get("codec_name"), "width": v.get("width"), "height": v.get("height"), "fps": round(fps, 3), "pix_fmt": v.get("pix_fmt")} if v else None,
        "audio": {"codec": a.get("codec_name"), "sample_rate": int(a.get("sample_rate", 0)), "channels": a.get("channels")} if a else None,
    }


def _filters_report(path: Path) -> dict[str, Any]:
    proc = run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-vf", "blackdetect=d=0.5:pix_th=0.08,freezedetect=n=0.002:d=2.5", "-af", "silencedetect=n=-45dB:d=1.5,volumedetect,ebur128=peak=true", "-f", "null", "-"],
        timeout=900,
        check=False,
    )
    err = proc.stderr.decode("utf-8", "replace")
    black = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", err)]
    freeze_s = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", err)]
    freeze_e = [float(x) for x in re.findall(r"freeze_end: ([\d.]+)", err)]
    sil_s = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    sil_e = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    maxv = re.findall(r"max_volume: ([\-\d.]+) dB", err)
    meanv = re.findall(r"mean_volume: ([\-\d.]+) dB", err)
    lufs = re.findall(r"I:\s+([\-\d.]+) LUFS", err)
    tp = re.findall(r"Peak:\s+([\-\d.]+) dBFS", err)
    decode_errors = len(re.findall(r"(?i)error while decoding|invalid data found|corrupt", err))
    return {
        "black": black,
        "freeze": list(zip(freeze_s, freeze_e + [None] * (len(freeze_s) - len(freeze_e)))),
        "silence": list(zip(sil_s, sil_e + [None] * (len(sil_s) - len(sil_e)))),
        "max_volume_db": float(maxv[-1]) if maxv else None,
        "mean_volume_db": float(meanv[-1]) if meanv else None,
        "integrated_lufs": float(lufs[-1]) if lufs else None,
        "true_peak_dbfs": float(tp[-1]) if tp else None,
        "decode_errors": decode_errors,
        "exit_code": proc.returncode,
    }


def _frame(path: Path, t: float, out: Path, width: int = 640) -> Path | None:
    try:
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, t):.3f}", "-i", str(path), "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "3", str(out)], timeout=60)
    except VRSError:
        return None
    return out if out.exists() else None


def _gray(p: Path, size: int = 160) -> np.ndarray:
    im = Image.open(p).convert("L")
    im = im.resize((size, max(2, int(size * im.height / im.width))))
    return np.asarray(im, dtype=np.float32)


def _edge_activity(p: Path) -> float:
    a = _gray(p, 320)
    h, w = a.shape
    bw = max(2, int(w * 0.015))
    bh = max(2, int(h * 0.015))
    strips = np.concatenate([a[:, :bw].ravel(), a[:, -bw:].ravel(), a[:bh, :].ravel(), a[-bh:, :].ravel()])
    return float(np.std(strips))


def review_render(pid: str, version: int | None = None) -> dict[str, Any]:
    pdir = projects.project_dir(pid)
    renders = projects.list_renders(pid)
    if not renders:
        raise VRSError("Projeto ainda não tem render.", code="no_render", status=404)
    r = next((x for x in renders if x["version"] == version), renders[-1]) if version else renders[-1]
    rdir = pdir / "renders" / f"v{r['version']}"
    mp4 = rdir / "final.mp4"
    plan = read_json(rdir / "plan.json") or projects.load(pid, "plan")
    fdir = rdir / "review"
    fdir.mkdir(exist_ok=True)
    findings: list[dict[str, Any]] = []
    errors: list[str] = []

    info = probe(mp4)
    fps = plan["fps"]
    expected = sum(s["durationInFrames"] for s in plan["scenes"]) / fps
    if not info["video"]:
        errors.append("MP4 sem trilha de vídeo.")
    else:
        if (info["video"]["width"], info["video"]["height"]) != (plan["width"], plan["height"]):
            errors.append(f"Dimensões {info['video']['width']}x{info['video']['height']} ≠ plano {plan['width']}x{plan['height']}.")
        if abs(info["video"]["fps"] - fps) > 0.05:
            errors.append(f"FPS {info['video']['fps']} ≠ plano {fps}.")
    if abs(info["duration"] - expected) > max(0.25, 2 / fps):
        errors.append(f"Duração {info['duration']:.2f}s ≠ esperada {expected:.2f}s.")
    has_narr = any(s["words"] for s in plan["scenes"])
    if not info["audio"]:
        errors.append("MP4 sem trilha de áudio.")

    flt = _filters_report(mp4)
    if flt["decode_errors"]:
        errors.append(f"{flt['decode_errors']} erro(s) de decodificação.")
    for a, b in flt["black"]:
        findings.append({"kind": "trecho_preto", "at": a, "detail": f"{a:.1f}–{b:.1f}s (pode ser intencional: transição/fade)"})
    for a, b in flt["freeze"]:
        findings.append({"kind": "quadro_congelado", "at": a, "detail": f"a partir de {a:.1f}s{f' até {b:.1f}s' if b else ''} (pausa de leitura é normal; verifique se é intencional)"})
    if flt["max_volume_db"] is not None and flt["max_volume_db"] >= -0.1:
        findings.append({"kind": "clipping", "detail": f"pico {flt['max_volume_db']} dB"})
    if has_narr and flt["mean_volume_db"] is not None and flt["mean_volume_db"] < -40:
        errors.append("Áudio praticamente mudo apesar de haver narração.")

    # Quadros reais: início, meio de cada cena, fronteiras de corte.
    frames: list[dict[str, Any]] = []
    motion: list[dict[str, Any]] = []
    off = 0.0
    for i, sc in enumerate(plan["scenes"]):
        dur = sc["durationInFrames"] / fps
        mid = _frame(mp4, off + dur * 0.55, fdir / f"{i:02d}-{sc['id']}-mid.jpg")
        if mid:
            frames.append({"scene": sc["id"], "kind": "meio", "t": round(off + dur * 0.55, 2), "path": str(mid.relative_to(pdir))})
            if sc["component"] not in MEDIA_SCENES:
                ea = _edge_activity(mid)
                if ea > 28:
                    findings.append({"kind": "conteudo_na_borda", "scene": sc["id"], "detail": f"atividade nas margens {ea:.0f} — verificar texto cortado"})
        if i > 0:
            b = _frame(mp4, off + 2 / fps, fdir / f"{i:02d}-{sc['id']}-cut.jpg", 480)
            if b:
                frames.append({"scene": sc["id"], "kind": "fronteira", "t": round(off, 2), "path": str(b.relative_to(pdir))})
        # Movimento: diferença média entre 5 amostras na cena.
        samples = []
        for k, frac in enumerate((0.15, 0.3, 0.45, 0.6, 0.8)):
            fp = _frame(mp4, off + dur * frac, fdir / f"_m{i:02d}{k}.jpg", 320)
            if fp:
                samples.append(_gray(fp))
                fp.unlink(missing_ok=True)
        diffs = [float(np.mean(np.abs(samples[j + 1] - samples[j]))) for j in range(len(samples) - 1)]
        score = round(float(np.mean(diffs)) if diffs else 0.0, 2)
        motion.append({"scene": sc["id"], "component": sc["component"], "motion": score, "first_half": round(float(np.mean(diffs[:2])) if diffs else 0, 2)})
        if score < 0.15 and max(diffs or [0]) < 0.4:
            findings.append({"kind": "cena_estatica", "scene": sc["id"], "detail": f"movimento medido {score} — pouca mudança visual entre 15% e 80% da cena"})
        # Fala cortada? (a voz precisa terminar antes do fim da cena)
        if sc["words"] and sc["words"][-1]["end"] > dur * 1000 - 120:
            findings.append({"kind": "fala_no_limite", "scene": sc["id"], "detail": "última palavra termina a <120 ms do corte"})
        off += dur
    start = _frame(mp4, 0.2, fdir / "start.jpg")
    if start:
        frames.insert(0, {"scene": plan["scenes"][0]["id"], "kind": "inicio", "t": 0.2, "path": str(start.relative_to(pdir))})
    sheet = _contact_sheet([pdir / f["path"] for f in frames if f["kind"] in ("meio", "inicio")], fdir / "contact-sheet.jpg")

    kin: dict[str, Any] = {"available": False}
    kb = kinocut_bin()
    if kb:
        try:
            proc = run([kb, "video-quality-check", str(mp4), "--format", "json"], timeout=600, check=False)
            txt = proc.stdout.decode("utf-8", "replace")
            j = json.loads(txt[txt.index("{") :]) if "{" in txt else {"raw": sanitize(txt, 800)}
            kin = {"available": True, "exit_code": proc.returncode, "report": j}
            if proc.returncode != 0:
                findings.append({"kind": "kinocut_gate", "detail": "Kinocut video-quality-check retornou falha/avisos; ver relatório."})
        except (VRSError, ValueError) as e:
            kin = {"available": True, "error": sanitize(str(e), 400)}

    technical = "reprovado" if errors else ("aprovado_com_achados" if findings else "aprovado_tecnicamente")
    prev = read_json(rdir / "review.json", {}) or {}
    review = {
        "version": r["version"],
        "state": technical,
        "technical": technical,
        "content": prev.get("content", "aguardando_revisao_conteudo"),
        "content_notes": prev.get("content_notes", []),
        "errors": errors,
        "findings": findings,
        "probe": info,
        "expected": {"duration": round(expected, 3), "width": plan["width"], "height": plan["height"], "fps": fps, "narration": has_narr},
        "audio": {k: flt[k] for k in ("max_volume_db", "mean_volume_db", "integrated_lufs", "true_peak_dbfs")},
        "motion": motion,
        "frames": frames,
        "contact_sheet": str(sheet.relative_to(pdir)) if sheet else "",
        "timing_precision": sorted({s["timing"] for s in plan["scenes"] if s["words"]}),
        "kinocut": kin,
        "limits": [
            "Validação técnica não é aprovação artística nem prova de que a explicação está correta.",
            "Movimento medido por diferença de quadros não prova caminhada, atuação ou sincronização labial.",
            "Revise os quadros e o conteúdo antes de entregar.",
        ],
    }
    write_json(rdir / "review.json", review)
    projects.history(pid, "reviewed", version=r["version"], technical=technical, findings=len(findings), errors=len(errors))
    return review


def _contact_sheet(paths: list[Path], out: Path, cols: int = 4, tw: int = 360) -> Path | None:
    ims = [Image.open(p).convert("RGB") for p in paths if p.exists()]
    if not ims:
        return None
    th = int(tw * ims[0].height / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), (12, 12, 16))
    for i, im in enumerate(ims):
        sheet.paste(im.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
    sheet.save(out, quality=85)
    return out


def set_content_review(pid: str, version: int, decision: str, notes: list[str]) -> dict[str, Any]:
    alias = {"approved": "aprovado_conteudo", "needs_adjustment": "ajustes_pedidos", "pending": "aguardando_revisao_conteudo"}
    decision = alias.get(decision, decision)
    if decision not in ("aprovado_conteudo", "ajustes_pedidos", "aguardando_revisao_conteudo"):
        raise VRSError("Decisão inválida.")
    rdir = projects.project_dir(pid) / "renders" / f"v{int(version)}"
    review = read_json(rdir / "review.json")
    if not review:
        raise VRSError("Revisão técnica ainda não existe.", code="no_review", status=404)
    review["content"] = decision
    review["content_notes"] = [n[:500] for n in notes][:20]
    write_json(rdir / "review.json", review)
    projects.history(pid, "content_review", version=version, decision=decision)
    return review
