from __future__ import annotations

import json
import os
import shutil
import stat
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from vrs import api, catalog, config, contracts, db, expand, jobs, library, projects, sogni, util, voice


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Isola completamente banco SQLite, projetos e cache dos dados reais do usuário."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    # Small fixture packs needed by the recipes; user storage remains isolated.
    for pack in ("kenney-halloween", "vrs-dossier", "vrs-pro-audio"):
        real_pack = config.ROOT / "data" / "library" / "packs" / pack
        if real_pack.exists():
            dst_pack = data_dir / "library" / "packs" / pack
            dst_pack.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(real_pack, dst_pack)
    monkeypatch.setenv("VRS_DATA_DIR", str(data_dir))
    monkeypatch.delenv("VRS_SOGNI_ENABLED", raising=False)
    monkeypatch.delenv("VRS_SOGNI_LAUNCHER", raising=False)
    monkeypatch.delenv("VRS_SOGNI_LAUNCHER_SHA256", raising=False)
    db.reset_for_tests()
    catalog.index_catalog()
    if (data_dir / "library" / "packs").exists():
        library.index_library()
    yield data_dir
    db.reset_for_tests()


def test_storyboard_and_filmplan_validation():
    # Storyboard válido
    sb = contracts.Storyboard.model_validate(
        {
            "schema": "vrs.storyboard/1",
            "title": "Teste de validação",
            "scenes": [
                {"preset_id": "vrs-title", "duration": 6, "narration": "Olá mundo.", "parameters": {"title": "Olá"}}
            ],
        }
    )
    assert sb.title == "Teste de validação"

    # Rejeita campos desconhecidos, duração negativa e JSON inválido
    with pytest.raises(ValidationError):
        contracts.Storyboard.model_validate({"title": "X", "campo_invalido": 1, "scenes": []})
    with pytest.raises(ValidationError):
        contracts.Storyboard.model_validate(
            {"title": "X", "scenes": [{"preset_id": "vrs-title", "duration": -3}]}
        )

    # Rejeita resolução ímpar (H.264 yuv420p exige par) e SVG path malicioso
    with pytest.raises(ValidationError):
        contracts.FilmPlan.model_validate(
            {
                "title": "Ímpar",
                "width": 1281,
                "height": 720,
                "fps": 30,
                "scenes": [{"id": "s1", "component": "vrs-title", "durationInFrames": 90}],
            }
        )
    with pytest.raises(ValidationError):
        contracts.Layer.model_validate(
            {"id": "l1", "type": "path", "d": "M0 0 <script>alert(1)</script>"}
        )


def test_dossier_catalog_expansion_and_caption_theme():
    niche = catalog.get_niche("dossie-documental")
    assert niche["recipe"][0]["parameters"]["fictional"] is True
    assert catalog.search_catalog("dossiê", "scene")["items"][0]["id"] == "vrs-dossier"
    sb = expand.storyboard_from_recipe("dossie-documental")
    assert sb["illustrative_data"] is True
    for aspect, dimensions in [("landscape", (1920, 1080)), ("vertical", (1080, 1920)), ("square", (1080, 1080))]:
        p = projects.create_project(name="Dossiê", idea="Ficção", niche_id="dossie-documental", aspect=aspect, target_seconds=30, options={"narration": False})
        plan = expand.expand(p["id"], sb)
        assert (plan["width"], plan["height"]) == dimensions
        assert {s["component"] for s in plan["scenes"]} == {"vrs-dossier"}
        assert plan["captions"]["highlight"] == "#e95d52"
        assert plan["captions"]["style"] == "cinema"
        assert plan["audio"]["music"]
        assert all(s["assets"] for s in plan["scenes"])
        assert all(s["sfx"] for s in plan["scenes"])
    with pytest.raises(util.VRSError):
        catalog.validate_params("vrs-dossier", {"media": "../private.mp4"})


def test_dossier_sound_matches_cue_and_respects_mute(monkeypatch):
    monkeypatch.setattr(expand, "_resolve_asset", lambda pid, value: "assets/" + value.split(".")[-1] + ".wav")
    words = [{"word": "três,", "start": 1200}, {"word": "três", "start": 2800}]
    params = {"cueWord": "tres", "cueOccurrence": 2, "entry": "perspective", "showCounter": True}
    cues = expand._dossier_sfx("test", params, words, {})
    assert next(c["at_ms"] for c in cues if c["role"] == "dossier:reveal") == 2800
    assert len(cues) == 3
    assert expand._dossier_sfx("test", params, words, {"auto_sfx": False}) == []
    assert expand._dossier_sfx("test", {**params, "soundEnabled": False}, words, {}) == []
    assert [c["role"] for c in expand._dossier_sfx("test", {**params, "cueWord": "removed"}, words, {})] == ["dossier:paper"]


def test_path_traversal_and_executable_svg_blocked(tmp_path: Path):
    with pytest.raises(util.VRSError):
        util.safe_join(tmp_path, "../etc/passwd")
    with pytest.raises(util.VRSError):
        util.safe_join(tmp_path, "/etc/passwd")


def test_library_import_provenance_and_deterministic_expansion():
    p = projects.create_project(name="Teste Expansão", idea="Origem do Halloween", niche_id="documentario", aspect="landscape", target_seconds=16)
    pid = p["id"]
    rel = library.import_into_project(pid, "kenney-halloween.pumpkincarved-ne")
    assert (projects.project_dir(pid) / rel).is_file()
    prov = json.loads((projects.project_dir(pid) / "assets" / "provenance.json").read_text())
    assert prov[rel]["resource_id"] == "kenney-halloween.pumpkincarved-ne"
    assert "CC0" in prov[rel]["license"]
    # Render isométrico Kenney (objeto ~30 px em 512²) vira derivado recortado; origem intacta
    assert prov[rel]["transform"].startswith("auto-trim")
    assert len(prov[rel]["source_sha256"]) == 64 and prov[rel]["source_sha256"] != prov[rel]["sha256"]
    assert len(prov[rel]["sha256"]) == 64

    # Expansão determinística com voz desativada para verificar estrutura pura e depois com voz Piper real
    sb = {
        "schema": "vrs.storyboard/1",
        "title": "Teste Halloween",
        "scenes": [
            {
                "id": "c1",
                "preset_id": "vrs-title",
                "duration": 6,
                "narration": "O festival de Samhain marcava o fim do verão.",
                "parameters": {"title": "Samhain", "backgroundAsset": "lib:kenney-halloween.crypt-ne"},
            }
        ],
    }
    plan = expand.expand(pid, sb)
    assert plan["schema"] == "vrs.filmplan/1"
    assert plan["scenes"][0]["id"] == "c1"
    assert plan["scenes"][0]["timing"] == "tts_phonemes"
    assert len(plan["scenes"][0]["words"]) >= 6

    # Verifica cache de voz na segunda chamada
    info2 = voice.synthesize_cached("O festival de Samhain marcava o fim do verão.", "faber")
    assert info2["cached"] is True

    # Verifica patch_scene seletivo
    patched = expand.patch_scene(plan, "c1", {"params": {"title": "Samhain Editado"}})
    assert patched["scenes"][0]["params"]["title"] == "Samhain Editado"


def test_job_recovery_on_restart():
    p = projects.create_project(name="Recuperação", idea="Teste", niche_id="ciencia")
    j_local = jobs.enqueue("render", p["id"], {})
    j_ext = jobs.enqueue("agent_run", p["id"], {})
    # Simula interrupção abrupta enquanto ambos estavam 'running'
    db.conn().execute("UPDATE jobs SET state = 'running' WHERE id IN (?, ?)", (j_local["id"], j_ext["id"]))
    rec = jobs.recover_interrupted()
    assert rec["requeued"] == 1
    assert rec["failed"] == 1
    assert jobs.get(j_local["id"])["state"] == "queued"
    assert jobs.get(j_ext["id"])["state"] == "failed"


def test_sogni_unlimited_only_guardrails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    p = projects.create_project(name="Sogni Guard", idea="Teste", niche_id="ciencia")
    pid = p["id"]

    # 1. Desativado por padrão -> bloqueia imediatamente
    with pytest.raises(sogni.SogniBlocked, match="desativado"):
        sogni.submit(pid, "s1", "image", {"prompt": "gato"})

    # 2. Habilitado, mas sem grant explícito para cena/operação -> bloqueia
    monkeypatch.setenv("VRS_SOGNI_ENABLED", "1")
    with pytest.raises(sogni.SogniBlocked, match="autorização explícita"):
        sogni.submit(pid, "s1", "image", {"prompt": "gato"})

    sogni.grant(pid, "s1", "image")

    # 3. Bloqueia qualquer tentativa de passar créditos, Spark, SOGNI ou fallback
    for forbidden_key, forbidden_val in [("billing_mode", "spark"), ("tokenType", "sogni"), ("payment", "credits"), ("fallback", "auto")]:
        with pytest.raises(sogni.SogniBlocked, match="créditos|bloqueado"):
            sogni.submit(pid, "s1", "image", {"prompt": "gato", forbidden_key: forbidden_val})

    # 4. Cria launcher falso para testar hash fixado, cobertura incerta e bloqueio de reenvio ambíguo
    launcher = tmp_path / "fake_sogni_launcher.py"
    launcher.write_text(
        "#!/usr/bin/env python3\nimport json, sys\n"
        "data = json.loads(sys.stdin.read())\n"
        "mode = open(sys.argv[0] + '.mode').read().strip()\n"
        "if '--check' in sys.argv:\n"
        "    if mode == 'uncertain':\n"
        "        print(json.dumps({'billing': 'subscription_unlimited', 'subscription': 'unlimited_active', 'covered': False, 'certain': False}))\n"
        "    elif mode == 'spark':\n"
        "        print(json.dumps({'billing': 'spark', 'subscription': 'unlimited_active', 'covered': True, 'certain': True}))\n"
        "    else:\n"
        "        print(json.dumps({'billing': 'subscription_unlimited', 'subscription': 'unlimited_active', 'covered': True, 'certain': True}))\n"
        "else:\n"
        "    if mode == 'crash':\n"
        "        sys.exit(2)\n"
        "    print(json.dumps({'billing': 'subscription_unlimited', 'ok': True}))\n"
    )
    launcher.chmod(stat.S_IRWXU)
    mode_file = Path(str(launcher) + ".mode")

    monkeypatch.setenv("VRS_SOGNI_LAUNCHER", str(launcher))
    monkeypatch.setenv("VRS_SOGNI_LAUNCHER_SHA256", "0" * 64)
    with pytest.raises(sogni.SogniBlocked, match="Hash do launcher"):
        sogni.submit(pid, "s1", "image", {"prompt": "gato"})

    monkeypatch.setenv("VRS_SOGNI_LAUNCHER_SHA256", util.sha256_file(launcher))

    # Cobertura incerta -> bloqueia antes de submeter
    mode_file.write_text("uncertain")
    with pytest.raises(sogni.SogniBlocked, match="incerta"):
        sogni.submit(pid, "s1", "image", {"prompt": "gato"})

    # Launcher reportando Spark -> bloqueia antes de submeter
    mode_file.write_text("spark")
    with pytest.raises(sogni.SogniBlocked, match="não é assinatura Unlimited"):
        sogni.submit(pid, "s1", "image", {"prompt": "gato"})

    # Falha após submissão -> grava recibo 'ambiguous' e bloqueia segunda tentativa automática
    mode_file.write_text("crash")
    with pytest.raises(sogni.SogniBlocked, match="ambíguo"):
        sogni.submit(pid, "s1", "image", {"prompt": "gato"})
    mode_file.write_text("ok")
    with pytest.raises(sogni.SogniBlocked, match="reenvio bloqueado"):
        sogni.submit(pid, "s1", "image", {"prompt": "gato"})


def test_secret_sanitization_and_clean_export_zip():
    raw = "Erro com token sk-1234567890abcdefghijklmnop e Authorization: Bearer segredo_super_longo_12345"
    clean = util.sanitize(raw)
    assert "sk-1234567890" not in clean
    assert "segredo_super_longo_12345" not in clean

    p = projects.create_project(name="Export Limpo", idea="Teste", niche_id="frases")
    pid = p["id"]
    # Mesmo que alguém crie um arquivo .env indevido, o exportador jamais inclui segredos, .env, banco ou pesos
    (projects.project_dir(pid) / ".env").write_text("SECRET=123")
    zpath = projects.export_project(pid)
    with zipfile.ZipFile(zpath) as zf:
        names = zf.namelist()
        assert not any(n.endswith((".env", ".sqlite3", ".onnx", ".bin")) or "provider-grants.json" in n for n in names)


def test_api_loopback_and_csrf_protection():
    assert config.HOST == "127.0.0.1"
    client = TestClient(api.app)
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["host"] == "127.0.0.1"

    # Bloqueia Host spoofing (DNS rebinding)
    bad_host = client.get("/api/health", headers={"host": "evil.example.com"})
    assert bad_host.status_code == 403

    # Bloqueia POST cross-origin (CSRF)
    bad_origin = client.post("/api/library/reindex", headers={"origin": "https://evil.example.com"})
    assert bad_origin.status_code == 403


def test_new_scenes_reframe_and_auto_sfx(tmp_path: Path):
    from vrs import workflow

    catalog._specs.cache_clear()
    catalog.scenes.cache_clear()
    catalog.niches.cache_clear()
    assert "vrs-3d-stage" in catalog.scenes()
    assert "vrs-parallax-photo" in catalog.scenes()
    assert "vrs-code-walkthrough" in catalog.scenes()
    assert "vrs-stickman-stage" in catalog.scenes()
    assert "vrs-southpark-stage" in catalog.scenes()
    assert "vrs-roblox-stage" in catalog.scenes()
    assert "vrs-multiplane-stage" in catalog.scenes()
    for nid in ("stickman", "southpark", "roblox", "multiplane"):
        assert nid in catalog.niches()

    p = projects.create_project(name="Novas Cenas", idea="Teste incremental", niche_id="stickman", aspect="landscape", target_seconds=12, options={"narration": False})
    pid = p["id"]
    sb = {
        "schema": "vrs.storyboard/1",
        "title": "Teste Novas Cenas",
        "scenes": [
            {
                "id": "s1",
                "preset_id": "vrs-stickman-stage",
                "duration": 4,
                "narration": "Boneco palito explicando no quadro.",
                "parameters": {"title": "Stickman", "action": "explain_board", "expression": "happy", "accessory": "cap"},
            },
            {
                "id": "s2",
                "preset_id": "vrs-southpark-stage",
                "duration": 4,
                "narration": "Recorte de papel estilo South Park.",
                "parameters": {"title": "Cutout", "mode": "duet", "environment": "snow_town", "expression": "shocked"},
            },
            {
                "id": "s3",
                "preset_id": "vrs-roblox-stage",
                "duration": 4,
                "narration": "Pulando no Obby 3D.",
                "parameters": {"title": "Roblox 3D", "action": "obby_jump", "environment": "obby_sky"},
            },
        ],
    }
    plan = expand.expand(pid, sb)
    projects.save_versioned(pid, "plan", plan)
    assert plan["width"] == 1920 and plan["height"] == 1080

    # Troca de componente via patch_scene
    workflow.patch_scene(pid, "s2", {"component": "vrs-multiplane-stage", "params": {"title": "Multiplane"}}, render_after=False)
    plan_patched = projects.load(pid, "plan")
    assert plan_patched["scenes"][1]["component"] == "vrs-multiplane-stage"

    # Reenquadramento 1-clique para vertical (9:16)
    ref = workflow.reframe_project(pid, "vertical", render_after=False)
    assert ref["aspect"] == "vertical"
    plan_v = projects.load(pid, "plan")
    assert plan_v["width"] == 1080 and plan_v["height"] == 1920


def test_pro_pillars_and_autonomous_director(tmp_path: Path):
    from vrs import review, workflow

    catalog._specs.cache_clear()
    catalog.scenes.cache_clear()
    catalog.niches.cache_clear()

    # 1. Novas cenas profissionais registradas
    for sc_id in ("vrs-news-highlight", "vrs-device-mockup", "vrs-video-broll"):
        assert sc_id in catalog.scenes()

    # 2. Normalização fonética PT-BR preservando tokens visuais
    assert "dois dê" in voice._spoken_word("2D")
    assert "inteligência artificial" in voice._spoken_word("IA")
    assert "por cento" in voice._spoken_word("50%")

    # 3. Diretor autônomo local adapta a ideia do usuário e gerencia timeline
    p = projects.create_project(
        name="Diretor Pro",
        idea="Como a inteligência artificial acelera o código em 10x sem perder segurança. Primeiro planeje a arquitetura. Depois automatize os testes.",
        niche_id="southpark",
        aspect="landscape",
        target_seconds=15,
        options={"narration": False},
    )
    pid = p["id"]
    sb = expand.auto_storyboard_from_idea("southpark", p["idea"], 15, title="IA e Código 10x")
    assert len(sb["scenes"]) >= 3
    assert "IA" in sb["scenes"][0]["parameters"].get("title", "")

    plan = expand.expand(pid, sb)
    assert plan["captions"]["style"] in ("hormozi", "karaoke", "cinema", "comic")
    projects.save_versioned(pid, "plan", plan)

    # 4. Operações de timeline (add, duplicate, move_up, delete)
    n0 = len(plan["scenes"])
    plan = expand.manage_scene(pid, plan, "add", "", preset_id="vrs-news-highlight")
    assert len(plan["scenes"]) == n0 + 1
    added_id = plan["scenes"][-1]["id"]
    plan = expand.manage_scene(pid, plan, "move_up", added_id)
    assert plan["scenes"][-2]["id"] == added_id
    plan = expand.manage_scene(pid, plan, "delete", added_id)
    assert len(plan["scenes"]) == n0

    # 5. Kit de publicação automático (títulos, capítulos 00:00 e hashtags)
    kit = review._build_publish_kit(plan)
    assert len(kit["titles"]) == 3
    assert kit["chapters_text"].startswith("00:00 ")
    assert len(kit["hashtags"]) >= 3



def test_scene_anchor_aliases_limits_and_conflicts():
    anchor=contracts.SceneAnchor.model_validate({'triggerWord':'Olá','effect':'zoom_punch'})
    assert anchor.word=='Olá'
    scene=contracts.StoryboardScene.model_validate({'presetId':'vrs-pandora-cutout','params':{},'anchors':[anchor.model_dump()]})
    assert scene.preset_id=='vrs-pandora-cutout'
    for data in [{'word':'oi','occurrence':0},{'word':'oi','spanWords':0},{'effect':'zoom_punch'}]:
        with pytest.raises(ValidationError):contracts.SceneAnchor.model_validate(data)
    with pytest.raises(ValidationError):contracts.StoryboardScene.model_validate({'presetId':'vrs-title','preset_id':'vrs-stat'})


def test_word_anchor_expansion_and_patch(monkeypatch, tmp_path):
    import wave
    from vrs import anchors
    source=tmp_path/'voice.wav'
    with wave.open(str(source),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(b'\0\0'*16000)
    def synth(text,voice_id):
        return {'wav':str(source),'duration_ms':1000,'timing':'tts_phonemes','words':[{'id':f'w{i}','word':w,'start':i*180,'end':i*180+150} for i,w in enumerate(text.split())]}
    monkeypatch.setattr(voice,'synthesize_cached',synth)
    monkeypatch.setattr(voice,'list_voices',lambda:[{'id':'faber'}])
    p=projects.create_project(name='Anchor test',niche_id='pandora',options={'voice':'faber','auto_sfx':False})
    sb={'title':'Cue test','theme':{'primary':'#12ff34'},'scenes':[{'preset_id':'vrs-pandora-cutout','narration':'Veja a lua','duration':2,'anchors':[{'word':'lua','effect':'zoom_punch'}]}]}
    plan=expand.expand(p['id'],sb);sc=plan['scenes'][0]
    assert plan['theme']['accent']=='#12ff34'
    assert anchors.resolve_anchor(sc['words'],sc['anchors'][0])[0]==660
    patched=expand.patch_scene(plan,sc['id'],{'narration':'Agora veja a lua'},pid=p['id'])
    assert anchors.resolve_anchor(patched['scenes'][0]['words'],patched['scenes'][0]['anchors'][0])[0]==840
    assert patched['scenes'][0]['durationInFrames']>=sc['durationInFrames']


def test_studio_mix_budgets_and_bad_requests():
    from vrs.studio import mix_storyboard
    cfg={'motion_pct':40,'cutout_pct':30,'gameplay_pct':10,'broll_pct':20,'pacing':'fast'}
    sb=mix_storyboard('pandora','Uma ideia. Uma história. Um final.',30,cfg)
    assert sb['style_mix']['planned_frames']=={'motion':360,'cutout':270,'gameplay':90,'broll':180}
    assert abs(sum(s['duration'] for s in sb['scenes'])-30)<1e-8
    contracts.Storyboard.model_validate(sb)
    for sc in sb['scenes']:catalog.validate_params(sc['preset_id'],sc['parameters'])
    with pytest.raises(util.VRSError):mix_storyboard('pandora','Ideia',30,{k:0 for k in cfg if k.endswith('_pct')})
    c=TestClient(api.app)
    assert c.post('/api/creation/start',json={'niche_id':'pandora','idea':'Uma ideia','studio_sliders':{'motion_pct':101}}).status_code==422


def test_cutout_preserves_transparency_and_separates_border():
    from vrs.cutout import create_cutout
    from PIL import Image,ImageDraw
    from io import BytesIO
    p=projects.create_project(name='Cutout test')
    im=Image.new('RGB',(128,128),'white');ImageDraw.Draw(im).rectangle((40,30,90,110),fill='purple')
    data=BytesIO();im.save(data,format='PNG')
    result=create_cutout(p['id'],data.getvalue());out=Image.open(projects.resolve(p['id'],result['path']))
    assert out.getpixel((0,0))[3]==0 and out.getpixel((65,65))[3]>240
    assert result['method']=='border_flood_fill'
    im=Image.new('RGBA',(24,24),(10,20,30,100));data=BytesIO();im.save(data,format='PNG')
    result=create_cutout(p['id'],data.getvalue());assert result['method']=='existing_alpha'
    assert Image.open(projects.resolve(p['id'],result['path'])).getpixel((0,0))[3]==100
    with pytest.raises(util.VRSError):create_cutout(p['id'],b'not an image')


def test_hypit_template_microcuts_and_clone_does_not_mutate_source():
    from vrs import hypit
    p=projects.create_project(name='Original',idea='Primeira parte. Segunda parte.',niche_id='pandora',options={'voice':'none','narration':False})
    d=projects.project_dir(p['id'])
    util.write_json(d/'brief.json',{'measured':{'palette':['#111111','#88ff33','#aa88ff']}})
    util.write_json(d/'evidence/shots.json',{'shots':[{'start':0,'end':.6},{'start':.6,'end':1.2},{'start':1.2,'end':4},{'start':4,'end':8}]})
    util.write_json(d/'evidence/audio.json',{'energy_peaks_s':[.7,5]})
    template=hypit.extract_hypit_template(p['id']);assert template['segments'][0]['micro_cuts']==[.6,1.2]
    cloned=hypit.clone_with_hypit(p['id'],render_after=False)
    assert cloned['project_id']!=p['id'] and projects.load(p['id'],'storyboard') is None
    sb=projects.load(cloned['project_id'],'storyboard');assert sb['scenes'][0]['anchors']
    assert sb['theme']['accent']=='#88ff33'
    assert cloned['job']['kind']=='produce'


def test_hypit_variants_retain_body_scene_cache(monkeypatch,tmp_path):
    from vrs import hypit,render
    import wave
    wav=tmp_path/'s.wav'
    with wave.open(str(wav),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(b'\0\0'*16000)
    monkeypatch.setattr(voice,'list_voices',lambda:[{'id':'faber'}])
    monkeypatch.setattr(voice,'synthesize_cached',lambda text,vid:{'wav':str(wav),'duration_ms':1000,'timing':'tts_phonemes','words':[{'id':'w0','word':text,'start':0,'end':900}]})
    p=projects.create_project(name='Variants',niche_id='pandora',options={'voice':'none'})
    plan=expand.expand(p['id'],{'title':'Body stays','scenes':[{'preset_id':'vrs-title','duration':2},{'preset_id':'vrs-title','duration':2}]})
    projects.save_versioned(p['id'],'plan',plan)
    out=hypit.generate_variants(p['id'],['Novo gancho'],render_after=False);new=projects.load(out[0]['project_id'],'plan')
    assert render.scene_cache_key(p['id'],plan,plan['scenes'][1],'source')==render.scene_cache_key(out[0]['project_id'],new,new['scenes'][1],'source')
    assert new['scenes'][0]['narration']=='Novo gancho'
    assert projects.load(p['id'],'plan')['scenes'][0]['narration']==''


def test_mcp_aliases_have_real_signatures():
    import asyncio
    from vrs.mcp_server import mcp
    tools=asyncio.run(mcp.list_tools());by_name={t.name:t for t in tools}
    assert 'vrs_get_agent_task' in by_name and 'hypit_clone_workflow' in by_name
    schema=by_name['vrs_get_agent_task'].inputSchema
    assert 'project_id' in schema['properties'] and 'a' not in schema['properties']


def test_legacy_mcp_arguments_are_compatible(monkeypatch):
    from vrs import mcp_server
    monkeypatch.setattr(mcp_server,'_ensure_worker',lambda:None)
    assert 'items' in mcp_server.vrs_search_catalog('Pandora',kind='scene')
    assert 'items' in mcp_server.vrs_search_library('',kind='image',pack='')
    p=projects.create_project(name='MCP alias',niche_id='pandora',options={'voice':'none'})
    result=mcp_server.vrs_submit_storyboard(p['id'],{'title':'Aliases','scenes':[{'presetId':'vrs-title','params':{},'duration':2}]},render=False)
    assert result['job']['kind']=='produce'
    assert mcp_server.vrs_get_evidence(p['id'],kind='brief') is None
