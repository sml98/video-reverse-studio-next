"""CPU-only studio recipe: explicit mix budgets and honest local draft narration."""
from __future__ import annotations
import math,re
from typing import Any,Literal
from pydantic import Field,field_validator
from .contracts import Strict,Theme
from . import catalog

class StudioSliders(Strict):
    motion_pct: float = Field(default=40, ge=0,le=100)
    cutout_pct: float = Field(default=30, ge=0,le=100)
    gameplay_pct: float = Field(default=10, ge=0,le=100)
    broll_pct: float = Field(default=20, ge=0,le=100)
    pacing: Literal['fast','medium','doc']='medium'
    sfx_density: Literal['high','normal','none']='normal'
    caption_style: Literal['hormozi','karaoke','cinema','comic']='hormozi'
    theme_override: dict[str,str] = Field(default_factory=dict)

    @field_validator('theme_override')
    @classmethod
    def _theme(cls,value):
        Theme.model_validate(value)
        return value


def mix_storyboard(niche_id: str, idea: str, target_seconds: float, sliders: dict[str,Any], *, title: str='') -> dict[str,Any]:
    cfg=StudioSliders.model_validate(sliders)
    groups=['motion','cutout','gameplay','broll'];weights=[getattr(cfg,k+'_pct') for k in groups];total=sum(weights)
    if total<=0:
        from .util import VRSError
        raise VRSError('Escolha pelo menos uma linguagem visual.',code='empty_style_mix')
    fps=30;frames=max(90,min(18000,round(target_seconds*fps)))
    quotas=[frames*w/total for w in weights];budget=[math.floor(x) for x in quotas]
    for i in sorted(range(4),key=lambda i:quotas[i]-budget[i],reverse=True)[:frames-sum(budget)]:budget[i]+=1
    pace={'fast':3.5,'medium':5,'doc':8}[cfg.pacing]
    scenes=[];sentences=[x.strip() for x in re.split(r'(?<=[.!?])\s+|\n+',idea) if x.strip()]
    components={'motion':['vrs-pandora-cutout','vrs-stat'],'cutout':['vrs-pandora-cutout'],'gameplay':['vrs-multiplane-stage','vrs-stickman-stage'],'broll':['vrs-video-broll']}
    buckets=[]
    for k,nframes in zip(groups,budget):
        count=min(15,max(1,round(nframes/(fps*pace)))) if nframes else 0
        for j in range(count):
            d=nframes//count+(j<nframes%count)
            buckets.append((k,d,components[k][j%len(components[k])]))
    # Interleave categories: avoid long isolated blocks of one media type.
    ordered=[]
    queues={k:[b for b in buckets if b[0]==k] for k in groups}
    while any(queues.values()):
        for k in groups:
            if queues[k]:ordered.append(queues[k].pop(0))
    buckets=ordered
    for i,(group,nframes,component) in enumerate(buckets):
        spec=catalog.get_scene(component);params={p['key']:p.get('default') for p in spec['params']}
        narration=sentences[i] if i<len(sentences) else ''
        headline=(narration or title or idea)[:80]
        if 'title' in params:params['title']=headline
        if component=='vrs-stat':
            # No invented numeric claims when a source value is absent.
            component='vrs-pandora-cutout';params={'title':headline,'metricValue':0,'metricLabel':'Rascunho visual — personalize o indicador','cards':[]}
        anchors=[]
        words=narration.split()
        if words and cfg.sfx_density!='none':
            trigger=words[min(2,len(words)-1)];anchors=[{'word':trigger,'occurrence':1,'spanWords':1,'effect':'badge_flash','label':trigger}]
            if cfg.sfx_density=='high' and len(words)>7:anchors.append({'word':words[-2],'effect':'zoom_punch'})
        scenes.append({'id':f's{i+1:02}','preset_id':component,'parameters':params,'narration':narration,'duration':nframes/fps,'role':group,'anchors':anchors})
    if len(sentences)>len(scenes):scenes[-1]['narration']=' '.join([scenes[-1]['narration']]+sentences[len(scenes):])
    notes=['Rascunho determinístico: a ideia fornecida é preservada; não há pesquisa factual ou reescrita semântica por LLM neste modo.', 'Proporções calculadas por frames planejados; a síntese estende cenas se a fala não couber, sem acelerar a voz.','B-roll sem mídia fica como composição ilustrativa até você selecionar um recurso.']
    return {'schema':'vrs.storyboard/1','title':(title or idea[:100] or 'Novo vídeo'),'niche_id':niche_id,'aspect':'vertical','theme':cfg.theme_override,'captions':cfg.caption_style,'style_mix':{'requested':cfg.model_dump(),'planned_frames':dict(zip(groups,budget)),'fps':fps},'scenes':scenes,'uncertainties':notes}
