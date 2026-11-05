from __future__ import annotations
import json
from pathlib import Path
import pytest
from vrs import catalog,contracts,expand,voice,supertonic


def test_new_script_cannot_inherit_demo_facts_media_or_speech():
    script="Um laboratório abre suas portas. Observe a experiência. Compare os resultados."
    for niche in ["financas","documentario","dossie-documental","pandora","framerise-chibi","southpark"]:
        sb=expand.auto_storyboard_from_idea(niche,script,18,title="Laboratório")
        contracts.Storyboard.model_validate(sb)
        assert " ".join(s["narration"] for s in sb["scenes"])==script
        assert sb["sources"]==[]
        serialized=json.dumps(sb,ensure_ascii=False)
        for stale in ["Gutenberg","Bíblia","juros","canal dark","Uma viagem pela luz da lua","Um arquivo sem assinatura"]:
            assert stale not in serialized
        for scene in sb["scenes"]:
            catalog.validate_params(scene["preset_id"],scene["parameters"])
        if niche=="framerise-chibi":
            assert sb["scenes"][-1]["parameters"]["mode"]=="cta"
            assert all(not s["parameters"]["previews"] for s in sb["scenes"])


def test_chibi_recipe_is_editable_and_has_all_poses_and_stages():
    n=catalog.get_niche("framerise-chibi")
    assert n["featured"] and n["voice"]=="supertonic-f2"
    assert len(n["recipe"])==15
    for scene in n["recipe"]:
        p=catalog.validate_params(scene["preset_id"],scene["parameters"])
        assert len(p["poses"])==8 and len(p["previews"])==3
    assert {s["parameters"]["mode"] for s in n["recipe"]}>={"prompt","edit","finish","cta"}


def test_asr_keeps_the_approved_script_without_claiming_forced_alignment():
    words,precision=voice.reconcile_asr_words("Você cria FrameRise agora.",[("Você",0,200),("cria",220,500),("frame",510,640),("rise",650,800),("agora",850,1100)],1200)
    assert [w["word"] for w in words]==["Você","cria","FrameRise","agora."]
    assert precision=="asr_estimated"
    assert all(a["end"]<=b["start"] for a,b in zip(words,words[1:]))
    assert words[-1]["end"]<=1200
    words,precision=voice.reconcile_asr_words("Roteiro totalmente diferente.",[("outro",0,800)],1000)
    assert precision=="proportional" and len(words)==3


def test_chibi_sound_retimes_with_the_new_scene_and_respects_mute(monkeypatch):
    monkeypatch.setattr(expand,"_resolve_asset",lambda pid,value:"assets/click.wav")
    params={"mode":"finish","actionProgress":.7,"soundEnabled":True}
    first=expand._chibi_sfx("test",params,5000,{})
    second=expand._chibi_sfx("test",params,10000,{})
    assert first[1]["at_ms"]==3500 and second[1]["at_ms"]==7000
    assert first[-1]["at_ms"]<5000
    assert expand._chibi_sfx("test",params,10000,{"auto_sfx":False})==[]


def test_supertonic_never_downloads_a_missing_model(tmp_path,monkeypatch):
    monkeypatch.setenv("FRAMERISE_SUPERTONIC_MODELS",str(tmp_path/"missing"))
    assert supertonic.voices()==[]
    with pytest.raises(Exception,match="não instalada"):
        supertonic.generate("Uma história.","supertonic-f2")
