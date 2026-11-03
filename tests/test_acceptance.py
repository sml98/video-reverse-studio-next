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
    # Copia um pacote da biblioteca para testar importação com procedência sem symlink externo
    real_pack = config.ROOT / "data" / "library" / "packs" / "kenney-halloween"
    if real_pack.exists():
        dst_pack = data_dir / "library" / "packs" / "kenney-halloween"
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
    assert "vrs-3d-stage" in catalog.scenes()
    assert "vrs-parallax-photo" in catalog.scenes()
    assert "vrs-code-walkthrough" in catalog.scenes()

    p = projects.create_project(name="Novas Cenas", idea="Teste incremental", niche_id="tutorial", aspect="landscape", target_seconds=12, options={"narration": False})
    pid = p["id"]
    sb = {
        "schema": "vrs.storyboard/1",
        "title": "Teste Novas Cenas",
        "scenes": [
            {
                "id": "s1",
                "preset_id": "vrs-code-walkthrough",
                "duration": 5,
                "narration": "Veja a linha dois do código.",
                "parameters": {"title": "Exemplo", "filename": "calc.py", "code": "x = 10\ny = x * 2", "focusLine": 2},
            },
            {
                "id": "s2",
                "preset_id": "vrs-parallax-photo",
                "duration": 5,
                "narration": "Foto em destaque.",
                "parameters": {"title": "Arquivo", "callout": "Ponto focal", "focusX": 0.5, "focusY": 0.5},
            },
        ],
    }
    plan = expand.expand(pid, sb)
    projects.save_versioned(pid, "plan", plan)
    assert plan["width"] == 1920 and plan["height"] == 1080

    # Reenquadramento 1-clique para vertical (9:16)
    ref = workflow.reframe_project(pid, "vertical", render_after=False)
    assert ref["aspect"] == "vertical"
    plan_v = projects.load(pid, "plan")
    assert plan_v["width"] == 1080 and plan_v["height"] == 1920
