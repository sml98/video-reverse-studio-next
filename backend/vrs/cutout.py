"""Optional local cutout. No model download is ever initiated by an upload."""
from __future__ import annotations
from collections import deque
from pathlib import Path
from io import BytesIO
from typing import Any
import numpy as np
from PIL import Image, ImageFilter, UnidentifiedImageError
from . import projects
from .util import VRSError, new_id, sha256_file, write_json


def create_cutout(pid: str, data: bytes, *, use_model: bool = False) -> dict[str, Any]:
    projects.get_project(pid)
    if len(data) > 25*1024*1024:
        raise VRSError("Imagem excede 25 MB.")
    try:
        with Image.open(BytesIO(data)) as source:
            if source.width*source.height > 16_000_000:
                raise VRSError("Imagem excede 16 megapixels.")
            im=source.convert("RGBA")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise VRSError("Imagem inválida.") from e
    method="existing_alpha"
    if im.getchannel("A").getextrema()[0] == 255:
        if use_model:
            # Only a preinstalled model: rembg otherwise attempts an implicit weight download.
            raise VRSError("Remoção por modelo não configurada. Use o recorte de fundo simples, sem download.", code="model_not_configured")
        small=im.copy();small.thumbnail((768,768));rgb=np.asarray(small)[...,:3].astype(np.int16)
        h,w=rgb.shape[:2];corners=np.array([rgb[0,0],rgb[0,-1],rgb[-1,0],rgb[-1,-1]])
        eligible=np.zeros((h,w),dtype=bool)
        for c in corners:eligible |= np.max(np.abs(rgb-c),axis=2)<30
        seen=np.zeros_like(eligible);queue=deque()
        for y,x in [(0,x) for x in range(w)]+[(h-1,x) for x in range(w)]+[(y,0) for y in range(h)]+[(y,w-1) for y in range(h)]:
            if eligible[y,x] and not seen[y,x]:seen[y,x]=True;queue.append((y,x))
        while queue:
            y,x=queue.popleft()
            for yy,xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
                if 0<=yy<h and 0<=xx<w and eligible[yy,xx] and not seen[yy,xx]:seen[yy,xx]=True;queue.append((yy,xx))
        mask=Image.fromarray(np.where(seen,0,255).astype('uint8')).resize(im.size,Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.65))
        if mask.getextrema()[1] < 128:
            raise VRSError("Não foi possível separar o objeto do fundo. Envie PNG transparente ou fundo mais uniforme.",code="cutout_empty")
        im.putalpha(mask);method="border_flood_fill"
    rel=f"assets/cutout/{new_id('cut')}.png";out=projects.resolve(pid,rel);out.parent.mkdir(parents=True,exist_ok=True);im.save(out)
    meta={'path':rel,'method':method,'sha256':sha256_file(out),'width':im.width,'height':im.height,'limits':'Fundo simples conectado às bordas. Não é segmentação semântica; confira cabelo e detalhes.'}
    write_json(out.with_suffix('.json'),meta);projects.history(pid,'cutout_created',**meta)
    return meta
