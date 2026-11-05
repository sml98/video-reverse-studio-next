"""Deterministic script layout. Never carries example facts into another subject."""
from __future__ import annotations
import copy
import re
from typing import Any
from . import catalog
from .util import VRSError


def split_script(text: str, maximum: int) -> list[str]:
    sentences = []
    for sentence in re.split(r"(?<=[.!?])\s+|\n+",text.strip()):
        words=sentence.split()
        sentences.extend(" ".join(words[i:i+28]) for i in range(0,len(words),28))
    if len(sentences) <= maximum:
        return sentences
    # Adjacent sentences stay ordered; no cycling or repeating of earlier speech.
    return [" ".join(sentences[i*len(sentences)//maximum:(i+1)*len(sentences)//maximum]) for i in range(maximum)]


def storyboard_from_script(niche_id: str, text: str, seconds: float, title: str="") -> dict[str,Any]:
    niche = catalog.get_niche(niche_id)
    recipe = niche["recipe"]
    blocks = split_script(text,len(recipe))
    headline = title.strip() or text.strip().splitlines()[0][:70]
    if not blocks:
        raise VRSError("Cole um roteiro para montar uma versão original.")
    scenes=[]
    for i,block in enumerate(blocks):
        source = recipe[i*(len(recipe)-1)//max(1,len(blocks)-1)]
        sid = source["preset_id"]
        spec = catalog.get_scene(sid)
        defaults = {p["key"]:copy.deepcopy(p.get("default")) for p in spec["params"]}
        # Retain only layout/style selections, never the example's text/data.
        params = defaults
        for field in spec["params"]:
            key,kind = field["key"],field["type"]
            if kind in ("text","longtext"): params[key]=""
            elif kind=="asset": params[key]=""
            elif kind=="list": params[key]=[]
            elif kind=="select" and key in source["parameters"]: params[key]=source["parameters"][key]
        short = (headline if i==0 else block)[:60]
        for key in ("title","headline","text","quote","highlightText","caption","documentText","calloutText","closingTitle","boardTitle"):
            if key in params:
                field = next(p for p in spec["params"] if p["key"]==key)
                params[key]=(short if key in ("title","headline","boardTitle") else block)[:field.get("maxLength",160)]
        if sid=="vrs-framerise-chibi":
            params.update(poses=copy.deepcopy(source["parameters"].get("poses",[])),backgroundAsset="lib:framerise-chibi.studio",appName="FrameRise",prompt=block[:180],cta=blocks[-1][:38],fileName="meu-video.mp4",footer="FrameRise · demonstração visual",pose=source["parameters"].get("pose",0))
        elif sid=="vrs-dossier":
            params.update(documentId=f"CENA {i+1:02}",calloutLabel="EM DESTAQUE",showCounter=False,credit="Roteiro do projeto",cueWord="",fictional=False)
        elif sid=="vrs-news-highlight":
            params.update(sourceName="ROTEIRO DO PROJETO",publishDate="",bodySnippet="")
        elif sid in ("vrs-stickman-stage","vrs-southpark-stage","vrs-roblox-stage","vrs-multiplane-stage"):
            if "bullets" in params:params["bullets"]=[block[:48]]
            if "dialogue" in params:params["dialogue"]=block[:140]
        elif sid not in ("vrs-title","vrs-kinetic-quote","vrs-story-panel","vrs-cta","vrs-code-walkthrough"):
            # Numerical charts, dates and routes require authored data. Do not reuse demo values.
            sid="vrs-title";params={"title":short,"subtitle":block[:110],"label":"SEU ROTEIRO"}
        if "authorship" in params:params["authorship"]="autoral"
        try:
            params=catalog.validate_params(sid,params)
        except VRSError:
            sid="vrs-title";params=catalog.validate_params(sid,{"title":short,"subtitle":block[:110],"label":"SEU ROTEIRO"})
        scenes.append({"preset_id":sid,"parameters":params,"narration":block,"duration":round(max(2.5,seconds/len(blocks)),2),"transition":"none" if sid=="vrs-framerise-chibi" else "fade"})
    return {"schema":"vrs.storyboard/1","title":headline[:160],"language":"pt-BR","music":niche.get("music",""),"sources":[],"illustrative_data":False,"uncertainties":["Texto fornecido pelo usuário; fatos não verificados automaticamente.","O modo local organiza o roteiro. Pesquisa e redação a partir de um tema exigem um agente conectado.","Mídias do exemplo anterior removidas; escolha imagens próprias para o novo assunto."],"scenes":scenes}
