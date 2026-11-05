#!/usr/bin/env python3
"""Local CPU visual preview, with original synthetic media. No TTS or network calls.

Run with .venv/bin/python scripts/preview-dossier.py --output data/outputs/dossier-preview
The MP4 is a silent motion/layout specimen, not a narrated finished story.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw
from vrs import catalog
from vrs.contracts import FilmPlan


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def make_media(out: Path) -> None:
    """An original fictional map and its animated scan, never reference footage."""
    im = Image.new("RGB", (960, 540), "#dcd9c9")
    d = ImageDraw.Draw(im)
    for y in range(0, 540, 30):
        d.line((0, y, 960, y), fill="#c4c2b4")
    for x in range(0, 960, 30):
        d.line((x, 0, x, 540), fill="#c4c2b4")
    for i in range(17):
        pts = [(x, 50 + i * 26 + math.sin(x / 90 + i * .4) * 45) for x in range(-10, 990, 8)]
        d.line(pts, fill="#8c9583", width=2)
    route = [(190, 330), (450, 140), (750, 310)]
    d.line(route, fill="#434c49", width=5)
    for i, (x, y) in enumerate(route):
        d.ellipse((x-18, y-18, x+18, y+18), fill="#efe9dc", outline="#c64d43", width=4)
        d.text((x+27, y-15), f"0{i+1}", fill="#262522", font_size=28)
    d.text((50, 40), "ARQ. 001 / MAPA FICTICIO", fill="#262522", font_size=28)
    im.save(out / "mapa.png")
    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-threads", "2", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "960x540", "-r", "24", "-i", "pipe:0", "-an", "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", str(out / "mapa-animado.mp4")], stdin=subprocess.PIPE)
    try:
        for frame in range(96):
            layer = im.copy()
            draw = ImageDraw.Draw(layer)
            x = 80 + frame * 8
            draw.line((x, 25, x, 515), fill="#d95348", width=3)
            draw.rectangle((x-25, 480, x+25, 486), fill="#d95348")
            assert ff.stdin is not None
            ff.stdin.write(layer.tobytes())
    finally:
        if ff.stdin:
            ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError("FFmpeg failed creating the original demo clip")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("data/outputs/dossier-preview"))
    parser.add_argument("--aspect", choices=["landscape", "vertical", "square"], default="landscape")
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    make_media(out)
    niche = catalog.get_niche("dossie-documental")
    width, height = {"landscape": (960, 540), "vertical": (540, 960), "square": (720, 720)}[args.aspect]
    scenes = []
    for i, step in enumerate(niche["recipe"]):
        params = catalog.validate_params("vrs-dossier", step["parameters"])
        params["cueWord"] = ""  # silent preview has no aligned narration
        params["cueSeconds"] = .6
        params["documentImage"] = "assets/mapa.png"
        if params["mode"] == "frame":
            params.update(media="assets/mapa-animado.mp4", mediaType="video", videoLoopSeconds=4)
        tokens = step["narration"].split()
        words = [{"id": f"w{k}", "word": word, "start": round(k*3400/len(tokens)), "end": round((k+1)*3400/len(tokens))} for k, word in enumerate(tokens)]
        scenes.append(dict(id=f"s{i+1}", component="vrs-dossier", params=params, durationInFrames=96, narration=step["narration"], words=words, timing="proportional", transitionIn={"type":"none","durationInFrames":0}, transitionOut={"type":"none","durationInFrames":0}))
    plan = FilmPlan.model_validate(dict(title="Dossiê documental · prévia visual sem narração", width=width, height=height, fps=24, theme=niche["theme"], captions=dict(mode="phrase", style="cinema", highlight="#e95d52"), scenes=scenes, illustrativeData=True)).model_dump(by_alias=True)
    write_json(out / "plan.json", plan)
    job = dict(cacheDir=str(out / "cache"), concurrency=1, jobs=[dict(composition="VrsFilm", props=dict(plan=plan, withAudio=False), out=str(out / "dossie-preview.mp4"), assetFiles={"assets/mapa.png": str(out/"mapa.png"), "assets/mapa-animado.mp4": str(out/"mapa-animado.mp4")})])
    write_json(out / "render-job.json", job)
    write_json(out / "media-provenance.json", dict(kind="original_synthetic_demo", fictional=True, source="scripts/preview-dossier.py", reference_media_reused=False, license="Same license as project source", audio="Silent visual specimen; no narration or sound effects"))
    if not args.prepare_only:
        root = Path(__file__).resolve().parents[1]
        env = {**os.environ, "NODE_OPTIONS": "--max-old-space-size=1536"}
        subprocess.run(["node", "render/render.mjs", str(out/"render-job.json")], cwd=root/"frontend", env=env, check=True)


if __name__ == "__main__":
    main()
