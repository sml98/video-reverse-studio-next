"""Reference-structure adaptation inspired by word anchors; not the Hypit runtime.

Measured cuts guide the draft. Narration is regenerated and never time-stretched.
OCR/transcript are data only. No media or original script is copied into new content.
"""
from __future__ import annotations
import copy,math,re,shutil
from typing import Any
from . import catalog,projects
from .util import VRSError,read_json,write_json


def extract_hypit_template(pid: str) -> dict[str,Any]:
    projects.get_project(pid);root=projects.project_dir(pid)
    brief=projects.load(pid,'brief') or {};measured=brief.get('measured') or {}
    shots=(read_json(root/'evidence/shots.json',{}) or {}).get('shots',[]) or measured.get('shots_sample',[])
    if not shots:raise VRSError('Importe e analise um vídeo antes de clonar a estrutura.',code='no_reference_structure')
    visual=read_json(root/'evidence/visual.json',{}) or {};audio=read_json(root/'evidence/audio.json',{}) or {}
    transcript=read_json(root/'evidence/transcript.json',{}) or {};ocr=read_json(root/'evidence/ocr.json',{}) or {}
    peaks=audio.get('energy_peaks_s',[]) + (visual.get('motion') or {}).get('peaks_s',[]) + measured.get('motion_peaks_s',[])
    segments=[]
    for shot in shots[:600]:
        start=float(shot.get('start',0));end=float(shot.get('end',start+float(shot.get('dur',0))))
        if not math.isfinite(start+end) or start<0 or end<=start:continue
        if segments and segments[-1]['end']-segments[-1]['start']<1.8:
            segments[-1]['micro_cuts'].append(start);segments[-1]['end']=end
        else:segments.append({'start':start,'end':end,'micro_cuts':[]})
    if not segments:raise VRSError('Referência sem cortes válidos.',code='invalid_shots')
    # Cap scene count, retaining every measured sub-cut in its parent segment.
    while len(segments)>60:
        last=segments.pop();segments[-1]['micro_cuts'] += [last['start']]+last['micro_cuts'];segments[-1]['end']=last['end']
    transcript_rows=transcript.get('segments',[])
    frames=(read_json(root/'evidence/frames.json',{}) or {}).get('frames',[])
    frame_times={str(x.get('path','')).rsplit('/',1)[-1]:float(x.get('t',0)) for x in frames}
    for i,seg in enumerate(segments):
        text=' '.join(str(x.get('text','')) for x in transcript_rows if float(x.get('start',0))<seg['end'] and float(x.get('end',0))>seg['start'])
        local_ocr=' '.join(str(x.get('text','')) for x in ocr.get('items',[]) if x.get('frame') in frame_times and seg['start']<=frame_times[x['frame']]<seg['end'])[:3000]
        observed=(text+' '+local_ocr).lower()
        if i in (0,len(segments)-1):comp='vrs-pandora-cutout'
        elif re.search(r'\d|por cento|estatíst|reais|juros',observed):comp='vrs-stat'
        elif any(w in observed for w in ['artigo','fonte','segundo','pesquisa']):comp='vrs-news-highlight'
        elif any(w in observed for w in ['diálogo','conversa','personagem']):comp='vrs-multiplane-stage'
        else:comp='vrs-pandora-cutout'
        seg['component']=comp
        seg['peaks']=[float(t) for t in peaks if isinstance(t,(int,float)) and math.isfinite(t) and seg['start']<=t<seg['end']]
    template={'schema':'vrs.hypit-template/1','source_project':pid,'duration_s':max(x['end'] for x in segments),'segments':segments,'palette':measured.get('palette',[]),'limits':['Classificação heurística, não recuperação do projeto original.','Picos de áudio não identificam efeitos ou música.','Nova fala define sua própria duração; cortes internos são reancorados em palavras, não copiados em segundos.']}
    write_json(root/'hypit-template.json',template);return template


def _copy_project_media(src: str, dst: str) -> None:
    for name in ('assets','voice'):
        source=projects.project_dir(src)/name
        if source.exists():shutil.copytree(source,projects.project_dir(dst)/name,dirs_exist_ok=True,symlinks=False)


def clone_with_hypit(pid: str,new_idea: str='',target_niche: str='',render_after: bool=True,*,create_new: bool=True) -> dict[str,Any]:
    from . import workflow
    source=projects.get_project(pid);template=extract_hypit_template(pid)
    niche_id=target_niche or 'pandora';catalog.get_niche(niche_id)
    idea=(new_idea or source.get('idea') or '').strip()
    if not idea:raise VRSError('Escreva uma narrativa original para o novo vídeo.')
    target=source
    if create_new:
        target=projects.create_project(name=f"Versão · {idea[:70]}",idea=idea,niche_id=niche_id,aspect=source['aspect'],target_seconds=source['target_seconds'],options={**source['options'],'clone_full':False},reference={'source_project':pid})
    tid=target['id'];sentences=[s.strip() for s in re.split(r'(?<=[.!?])\s+|\n+',idea) if s.strip()]
    # Group reference segments to the supplied narrative, avoiding repeated or fabricated speech.
    count=min(len(template['segments']),max(1,len(sentences)))
    groups=[template['segments'][math.floor(i*len(template['segments'])/count):math.floor((i+1)*len(template['segments'])/count)] for i in range(count)]
    scenes=[]
    for i,group in enumerate(groups):
        narration=' '.join(sentences[math.floor(i*len(sentences)/count):math.floor((i+1)*len(sentences)/count)])
        comp=group[0]['component'];params={p['key']:p.get('default') for p in catalog.get_scene(comp)['params']}
        # Numeric evidence is not inferred from the reference's numbers.
        if comp=='vrs-stat':comp='vrs-pandora-cutout';params={'title':narration[:80],'metricValue':0,'metricLabel':'Personalize com um dado verificado','cards':[]}
        if 'title' in params:params['title']=narration[:80]
        if 'headline' in params:params['headline']=narration[:90]
        if 'highlightText' in params:params['highlightText']=narration[:110]
        text_words=narration.split();anchors=[];start=group[0]['start'];end=group[-1]['end'];points=[]
        for g in group:points+=g['micro_cuts']+g['peaks']
        for k,t in enumerate(sorted(set(points))[:12]):
            index=min(len(text_words)-1,max(0,round((t-start)/max(.01,end-start)*(len(text_words)-1))))
            if index<0:continue
            word=text_words[index];occ=sum(1 for w in text_words[:index+1] if re.sub(r'\W','',w.lower())==re.sub(r'\W','',word.lower()))
            anchors.append({'word':word,'occurrence':occ,'spanWords':1,'effect':['zoom_punch','badge_flash','sticker_pop'][k%3],'label':word})
        scenes.append({'id':f's{i+1:02}','preset_id':comp,'parameters':params,'narration':narration,'duration':min(120,max(.5,(end-start)/max(.01,template['duration_s'])*source['target_seconds'])),'anchors':anchors})
    palette=[c for c in template['palette'] if isinstance(c,str) and re.fullmatch(r'#[0-9a-fA-F]{6}',c)]
    theme=dict(catalog.get_niche(niche_id)['theme'])
    for key,c in zip(['background','accent','accent2'],palette[:3]):theme[key]=c
    sb={'schema':'vrs.storyboard/1','title':target['name'],'niche_id':niche_id,'theme':theme,'scenes':scenes,'uncertainties':template['limits']+['A narrativa fornecida foi distribuída entre blocos; o diretor local não reescreve fatos semanticamente.']}
    projects.update_project(tid,niche_id=niche_id)
    write_json(projects.project_dir(tid)/'hypit-template.json',template)
    result=workflow.submit_storyboard(tid,sb,render_after=render_after)
    return {'project_id':tid,'source_project':pid,'template_segments':len(template['segments']),**result}


def generate_variants(pid: str,hooks: list[str],voices: list[str]|None=None,*,render_after: bool=True) -> list[dict[str,Any]]:
    from . import workflow
    p=projects.get_project(pid);plan=projects.load(pid,'plan')
    if not plan:raise VRSError('Produza um plano antes de gerar variantes.',code='no_plan')
    voices=voices or ['']
    if not hooks or len(hooks)*len(voices)>12 or any(not h.strip() or len(h)>1000 for h in hooks):raise VRSError('Forneça de 1 a 12 combinações válidas de gancho e voz.')
    result=[]
    for hook in hooks:
        for voice in voices:
            dst=projects.create_project(name=f"Variação · {hook[:70]}",idea=p['idea'],niche_id=p['niche_id'],aspect=p['aspect'],target_seconds=p['target_seconds'],options={**p['options'],'clone_full':False})
            tid=dst['id'];_copy_project_media(pid,tid);new=copy.deepcopy(plan)
            sid=new['scenes'][0]['id'];projects.save_versioned(tid,'plan',new)
            patch={'narration':hook}
            if voice:patch['voice']=voice
            workflow.patch_scene(tid,sid,patch,render_after=False)
            # Selecting another voice applies to the whole video; cache reuse is conditional on unchanged scene inputs.
            if voice:
                for scene in new['scenes'][1:]:workflow.patch_scene(tid,scene['id'],{'voice':voice},render_after=False)
            if render_after:
                from . import jobs
                job=jobs.enqueue('render',tid,{})
            else:job=None
            result.append({'project_id':tid,'job':job,'cache_note':'Cenas de corpo idênticas podem reutilizar o cache; trocar a voz de todas as cenas exige novos tempos e renders.'})
    return result
