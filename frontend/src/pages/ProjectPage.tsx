import React, { useEffect, useState } from "react";
import { Player } from "@remotion/player";
import { api, fmtBytes, media, Project, Voice } from "../api";
import { go } from "../App";
import { Film, totalFrames as calcTotalFrames } from "../remotion/Film";
import sceneSpecs from "../contracts/scene-specs.json";

const STAGE_ORDER = [
  { id: "análise", label: "1. Análise" },
  { id: "roteiro/direção", label: "2. Roteiro/Direção" },
  { id: "recursos/animação", label: "3. Recursos/Animação" },
  { id: "montagem", label: "4. Montagem" },
  { id: "revisão", label: "5. Revisão" },
  { id: "MP4", label: "6. MP4" },
];

const SPEC_MAP: Record<string, any> = Object.fromEntries((sceneSpecs.scenes as any[]).map((s) => [s.id, s]));

const QUICK_ASSETS = [
  { label: "— Selecionar da biblioteca (ou digite abaixo) —", value: "" },
  ...["studio", "moon", "island", "engine", "observatory"].map((name) => ({ label: `FrameRise · ${name}`, value: `lib:framerise-chibi.${name}` })),
  { label: "🐾 Panda Programador (Avatar)", value: "lib:user-avatars.animal-character-coder-red-panda" },
  { label: "🦈 Tubarão Advogado (Avatar)", value: "lib:user-avatars.animal-character-lawyer-shark" },
  { label: "🐧 Pinguim Professor (Avatar)", value: "lib:user-avatars.animal-character-professor-penguin" },
  { label: "🐕 Corgi Chefe (Avatar)", value: "lib:user-avatars.animal-character-boss-corgi" },
  { label: "🦉 Coruja Juíza (Avatar)", value: "lib:user-avatars.animal-character-judge-owl" },
  { label: "🐹 Hamster Trader (Avatar)", value: "lib:user-avatars.animal-character-trader-hamster" },
  { label: "🐱 Gato Laranja CEO (Avatar)", value: "lib:user-avatars.animal-character-ceo-orange-tabby" },
  { label: "🧑 Professor Gen-Z Miles (Humano)", value: "lib:user-avatars.human-archetypes-gen-z-professor-miles" },
  { label: "🎧 DJ Lukas Berlim (Humano)", value: "lib:user-avatars.human-archetypes-berlin-dj-lukas" },
  { label: "🛹 Contador Skatista Kevin (Humano)", value: "lib:user-avatars.human-archetypes-skater-accountant-kevin" },
  { label: "🧍 Open Peep 2 (Recorte P&B)", value: "lib:open-peeps.peep-2" },
  { label: "🧍 Open Peep 15 (Recorte P&B)", value: "lib:open-peeps.peep-15" },
  { label: "🏰 Castelo 2D (Kenney)", value: "lib:kenney-background-elements.castle" },
  { label: "⛰️ Montanhas 2D (Kenney)", value: "lib:kenney-background-elements.mountain1" },
  { label: "🌄 Colinas Verdes 2D (Kenney)", value: "lib:kenney-background-elements.hills1" },
  { label: "☁️ Céu 2D (Kenney)", value: "lib:kenney-background-elements.sky" },
  { label: "🏃 Personagem 3D Quaternius (.glb)", value: "lib:quaternius-standard.animationlibrary-standard" },
  { label: "✅ Sticker Die-Cut: VERIFICADO", value: "lib:vrs-pro-stickers.sticker-verificado" },
  { label: "❌ Sticker Die-Cut: MITO!", value: "lib:vrs-pro-stickers.sticker-alerta-mito" },
  { label: "⚡ Sticker Die-Cut: FOCO 10X", value: "lib:vrs-pro-stickers.sticker-foco-10x" },
  { label: "🚨 Sticker Die-Cut: URGENTE", value: "lib:vrs-pro-stickers.sticker-urgente" },
  { label: "🛡️ Sticker Die-Cut: 100% REAL", value: "lib:vrs-pro-stickers.sticker-aprovado" },
];

/** Etapa do backend (texto livre em PT) → índice do stepper de 6 etapas. */
function stageIndex(stage: string, awaiting: boolean): number {
  const s = (stage || "").toLowerCase();
  if (s.includes("mp4")) return 5;
  if (s.includes("revis")) return 4;
  if (s.includes("montagem")) return 3;
  if (s.includes("recursos") || s.includes("anima")) return 2;
  if (awaiting || s.includes("dire") || s.includes("roteiro")) return 1;
  return 0;
}

export const ProjectPage: React.FC<{ id: string }> = ({ id }) => {
  const [proj, setProj] = useState<Project | null>(null);
  const [viewMode, setViewMode] = useState<"mp4" | "player" | "compare">("mp4");
  const [version, setVersion] = useState<number>(0);
  const [rev, setRev] = useState<any>(null);
  const [anchorEffect,setAnchorEffect]=useState<"highlight"|"zoom_punch"|"sticker_pop"|"broll_overlay"|"badge_flash"|"camera_shake">("badge_flash");
  const [anchorAsset,setAnchorAsset]=useState("");
  const [selectedSceneIdx, setSelectedSceneIdx] = useState<number>(0);
  const [sceneEdit, setSceneEdit] = useState<any>(null);
  const [adjustMsg, setAdjustMsg] = useState<string>("");
  const [agentTask, setAgentTask] = useState<any>(null);
  const [evidenceId, setEvidenceId] = useState<string>("brief");
  const [evidenceData, setEvidenceData] = useState<any>(null);
  const [sbJson, setSbJson] = useState<string>("");
  const [planJson, setPlanJson] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [voices, setVoices] = useState<Voice[]>([]);

  useEffect(() => {
    api.get<{ voices: Voice[] }>("/api/settings").then((s) => setVoices(s.voices || [])).catch(() => {});
  }, []);

  const load = async () => {
    try {
      const p = await api.get<Project & { brief_available?: boolean }>(`/api/projects/${id}`);
      setProj(p);
      const latestV = p.latest_render?.version ?? p.renders?.[p.renders.length - 1]?.version ?? 0;
      if (latestV && (!version || version > latestV)) setVersion(latestV);
      if (p.storyboard && !sbJson) setSbJson(JSON.stringify(p.storyboard, null, 2));
      if (p.plan && !planJson) setPlanJson(JSON.stringify(p.plan, null, 2));
      if (p.plan?.scenes?.length && !sceneEdit) {
        const sc = p.plan.scenes[selectedSceneIdx] || p.plan.scenes[0];
        setSceneEdit(JSON.parse(JSON.stringify(sc)));
      }
      if (latestV) {
        api.get(`/api/projects/${id}/review?version=${version || latestV}`).then(setRev).catch(() => {});
      }
      if (p.jobs?.some((j) => j.state === "awaiting_agent")) {
        api.get(`/api/projects/${id}/agent-task`).then(setAgentTask).catch(() => {});
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  };

  useEffect(() => {
    setVersion(0);
    setSceneEdit(null);
    setSbJson("");
    setPlanJson("");
    load();
  }, [id]);

  useEffect(() => {
    if (!proj) return;
    const hasRunning = proj.status === "running" || proj.status === "queued" || proj.jobs?.some((j) => j.state === "queued" || j.state === "running");
    if (!hasRunning) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [proj?.status, proj?.jobs]);

  useEffect(() => {
    if (proj && version) {
      api.get(`/api/projects/${id}/review?version=${version}`).then(setRev).catch(() => setRev(null));
    }
  }, [id, version]);

  const selectScene = (idx: number) => {
    setSelectedSceneIdx(idx);
    const sc = proj?.plan?.scenes?.[idx];
    if (sc) setSceneEdit(JSON.parse(JSON.stringify(sc)));
  };

  const saveScenePatch = async () => {
    if (!proj || !sceneEdit) return;
    setMsg("Salvando alterações da cena e re-renderizando apenas a cena modificada…");
    setErr("");
    try {
      await api.post(`/api/projects/${id}/scene-patch`, {
        scene_id: sceneEdit.id,
        patch: {
          component: sceneEdit.component,
          durationInFrames: Number(sceneEdit.durationInFrames) || 180,
          notes: sceneEdit.notes || "",
          narration: sceneEdit.narration ?? "",
          voice: sceneEdit.voice || "",
          params: sceneEdit.params,
          anchors: sceneEdit.anchors || [],
          ...(Array.isArray(sceneEdit.sfx) ? { sfx: sceneEdit.sfx } : {}),
        },
        render: true,
      });
      await load();
      setMsg("Cena atualizada e render enfileirado.");
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  };

  const reframeAspect = async (aspect: string) => {
    if (!proj) return;
    setErr("");
    setMsg(`Reenquadrando projeto para ${aspect}…`);
    try {
      await api.post(`/api/projects/${id}/reframe`, { aspect, render: false });
      await load();
      setViewMode("player");
      setMsg(`Plano reenquadrado para ${aspect}.Confira na prévia interativa ou clique em Re-renderizar MP4.`);
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  };

  const uploadSceneVoice = async (file: File) => {
    if (!proj || !sceneEdit) return;
    setErr("");
    setMsg(`Alinhando voz própria na cena ${sceneEdit.id}…`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("transcript", sceneEdit.narration || "");
      fd.append("render", "false");
      const r = await api.post<any>(`/api/projects/${id}/scenes/${sceneEdit.id}/voice-upload`, fd);
      await load();
      setMsg(`Voz alinhada (${r.timing}, ${r.words?.length || 0} palavras).`);
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  };

  const toggleWordEmphasis = (word: string) => {
    if (!sceneEdit) return;
    const clean = word.replace(/[.,!?;:"'()]/g, "").trim();
    if (!clean) return;
    const cur = String(sceneEdit.params?.emphasis || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const next = cur.includes(clean) ? cur.filter((w) => w !== clean) : [...cur, clean];
    setSceneEdit({
      ...sceneEdit,
      params: { ...sceneEdit.params, ...(sceneEdit.params && "emphasis" in sceneEdit.params ? { emphasis: next.join(", ") } : {}) },
      notes: `Âncora selecionada: ${clean}`,
    });
  };

  const askAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustMsg.trim()) return;
    setErr("");
    setMsg("Enviando pedido de ajuste…");
    try {
      await api.post(`/api/projects/${id}/adjust`, { message: adjustMsg.trim() });
      setAdjustMsg("");
      await load();
      setMsg("Pedido registrado no projeto.");
    } catch (ex: any) {
      setErr(ex.message || String(ex));
    }
  };

  const generateWithRecipeFallback = async () => {
    if (!proj) return;
    setErr("");
    setMsg("Expandindo receita editorial local e iniciando render…");
    try {
      const niche = await api.get<any>(`/api/creation/niches/${proj.niche_id}`);
      const sb = niche.example_storyboard;
      sb.title = proj.name;
      await api.post(`/api/projects/${id}/creation/storyboard`, sb);
      await load();
      setMsg("Storyboard local enviado para renderização.");
    } catch (ex: any) {
      setErr(ex.message || String(ex));
    }
  };

  const generateWithAutoDirect = async () => {
    if (!proj) return;
    setErr("");
    setMsg("Gerando roteiro adaptado à sua ideia na CPU e iniciando render…");
    try {
      await api.post(`/api/projects/${id}/auto-direct`, {});
      await load();
      setMsg("Roteiro adaptado enviado para renderização.");
    } catch (ex: any) {
      setErr(ex.message || String(ex));
    }
  };

  const manageSceneAction = async (action: "add" | "duplicate" | "move_up" | "move_down" | "delete") => {
    if (!proj || !sceneEdit) return;
    setErr("");
    setMsg(`Atualizando linha do tempo (${action})…`);
    try {
      await api.post(`/api/projects/${id}/scene-manage`, {
        action,
        scene_id: sceneEdit.id,
        preset_id: sceneEdit.component || "vrs-stickman-stage",
        render: false,
      });
      setSceneEdit(null);
      await load();
      setMsg(`Linha do tempo atualizada (${action}). Clique em Re-renderizar MP4 quando terminar.`);
    } catch (ex: any) {
      setErr(ex.message || String(ex));
    }
  };

  const toggleAnchor=(w:any)=>{
    if(!sceneEdit)return;
    const list=sceneEdit.anchors||[];const found=list.find((a:any)=>a.wordId===w.id&&a.effect===anchorEffect);
    setSceneEdit({...sceneEdit,anchors:found?list.filter((a:any)=>a!==found):[...list,{word:w.word,wordId:w.id,occurrence:1,spanWords:1,effect:anchorEffect,label:w.word,asset:anchorAsset,sfx:""}]});
  };
  const cloneHypit=async()=>{
    setErr('');setMsg('Adaptando estrutura medida da referência…');
    try{const r=await api.post<any>(`/api/projects/${id}/hypit-clone`,{render:true});go(`#/projetos/${r.project_id}`);}catch(e:any){setErr(e.message||String(e));}
  };
  const uploadCutout=async(file:File)=>{
    if(!sceneEdit)return;setErr('');
    try{const fd=new FormData();fd.append('file',file);const r=await api.post<any>(`/api/projects/${id}/cutout-upload`,fd);const key=sceneEdit.component==='vrs-pandora-cutout'?'presenterAsset':'character';setSceneEdit({...sceneEdit,params:{...sceneEdit.params,[key]:r.path},assets:{...sceneEdit.assets,[r.path]:r.path}});setMsg('PNG recortado. Confira as bordas e salve a cena.');}catch(e:any){setErr(e.message||String(e));}
  };
  const cloneReferenceStyle = async () => {
    if (!proj) return;
    setErr("");
    setMsg("Clonando paleta medida da referência para o tema do projeto…");
    try {
      const r = await api.post<any>(`/api/projects/${id}/clone-reference-style`, { render: false });
      await load();
      setViewMode("player");
      setMsg(`Cores da referência aplicadas (${(r.palette || []).join(", ")}).`);
    } catch (ex: any) {
      setErr(ex.message || String(ex));
    }
  };

  const approveContent = async (decision: "approved" | "needs_adjustment") => {
    if (!version) return;
    try {
      await api.post(`/api/projects/${id}/review/content`, {
        version,
        decision,
        notes: [decision === "approved" ? "Aprovado após inspeção de quadros, áudio e legendas." : "Marcado para ajuste."],
      });
      await load();
    } catch (ex: any) {
      setErr(ex.message || String(ex));
    }
  };

  const loadEvidence = async (eid: string) => {
    setEvidenceId(eid);
    try {
      const d = await api.get(`/api/projects/${id}/evidence/${eid}`);
      setEvidenceData(d);
    } catch (ex: any) {
      setEvidenceData({ error: ex.message || String(ex) });
    }
  };

  if (!proj) {
    return <div className="panel muted">Carregando projeto {id}…</div>;
  }

  const awaiting = proj.jobs?.some((j) => j.state === "awaiting_agent") ?? false;
  const stageIdx = stageIndex(proj.stage, awaiting);
  const finished = proj.stage === "MP4 pronto";
  const activeJob = proj.jobs?.find((j) => j.state === "running" || j.state === "queued");
  const curRender = proj.renders?.find((r) => r.version === version) || proj.latest_render;
  const plan = proj.plan;
  const fps = plan?.fps || 30;
  const totalFrames = plan ? Math.max(30, calcTotalFrames(plan)) : 300;
  const assetUrls: Record<string, string> = {};
  for (const sc of plan?.scenes || []) {
    for (const [k, rel] of Object.entries((sc.assets || {}) as Record<string, string>)) {
      assetUrls[k] = media(proj.id, rel);
    }
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <header className="row spread">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={() => go("#/projetos")}>
              ← Projetos
            </button>
            <h1 style={{ fontSize: 22 }}>{proj.name}</h1>
            <span className="pill ok">{proj.niche_id}</span>
            <span className="pill">{proj.aspect}</span>
          </div>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            Ideia: {proj.idea || "Demonstração do modelo"}
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="row" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Formato:</span>
            {[
              { id: "landscape", label: "16:9" },
              { id: "vertical", label: "9:16" },
              { id: "square", label: "1:1" },
            ].map((a) => (
              <button
                key={a.id}
                type="button"
                className={`btn ${proj.aspect === a.id ? "primary" : ""}`}
                onClick={() => reframeAspect(a.id)}
                style={{ padding: "4px 8px", fontSize: 12 }}
                title={`Reenquadrar projeto para ${a.label}`}
              >
                {a.label}
              </button>
            ))}
          </div>
          {(proj as any).brief_available && (
            <><button type="button" className="btn" onClick={cloneReferenceStyle} title="Aplicar paleta medida do vídeo de referência">
              🎨 Clonar Cores da Referência
            </button><button type="button" className="btn" onClick={cloneHypit}>🧬 Clonar estrutura e gatilhos (Hypit)</button></>
          )}
          <a className="btn" href={`/api/projects/${proj.id}/export`} download>
            ⬇ Exportar projeto (.zip)
          </a>
          <button className="btn" onClick={() => api.post(`/api/projects/${proj.id}/render`).then(load)}>
            ↻ Re-renderizar MP4
          </button>
        </div>
      </header>

      <div className="stages">
        {STAGE_ORDER.map((s, idx) => (
          <div
            key={s.id}
            className={`stage ${idx < stageIdx || finished ? "done" : idx === stageIdx ? "active" : ""}`}
          >
            {s.label}
          </div>
        ))}
      </div>

      {activeJob && (
        <div className="panel row spread" style={{ borderColor: "var(--warn)" }}>
          <div>
            <strong>Tarefa em andamento ({activeJob.kind}):</strong> {activeJob.step || activeJob.state}
          </div>
          <span className="pill warn">{Math.round((activeJob.progress || 0) * 100)}%</span>
        </div>
      )}

      {awaiting && (
        <div className="panel col" style={{ borderColor: "var(--warn)", gap: 10 }}>
          <div className="row spread">
            <strong>⏳ Aguardando direção do agente externo (MCP / CLI)</strong>
            <span className="pill warn">awaiting_agent</span>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            A referência e o contexto do projeto <code>{proj.id}</code> estão prontos. O agente conectado pode chamar{" "}
            <code>vrs_get_agent_task(project_id="{proj.id}")</code> e enviar o storyboard original em{" "}
            <code>vrs_submit_storyboard</code>. Se quiser ver algo agora, o botão abaixo renderiza só o <strong>rascunho do modelo</strong> (o exemplo do nicho, sem adaptar à sua ideia).
          </p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={generateWithAutoDirect}>
              ⚡ Gerar Vídeo Adaptado à Minha Ideia Agora (Autônomo)
            </button>
            <button className="btn" onClick={generateWithRecipeFallback}>
              📄 Renderizar rascunho do modelo
            </button>
            {agentTask && (
              <span className="muted" style={{ fontSize: 12 }}>
                Brief compacto pronto ({JSON.stringify(agentTask).length} bytes)
              </span>
            )}
          </div>
        </div>
      )}

      {msg && <div className="panel" style={{ borderColor: "var(--ok)", fontSize: 13 }}>{msg}</div>}
      {err && <div className="panel" style={{ borderColor: "var(--bad)", color: "#fecaca", fontSize: 13 }}>{err}</div>}

      <div className="create-layout">
        <div className="col" style={{ gap: 16 }}>
          <div className="panel col" style={{ gap: 12 }}>
            <div className="row spread">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className={`btn ${viewMode === "mp4" ? "primary" : ""}`} onClick={() => setViewMode("mp4")}>
                  ▶ Vídeo MP4
                </button>
                <button className={`btn ${viewMode === "player" ? "primary" : ""}`} onClick={() => setViewMode("player")} disabled={!plan}>
                  ✦ Prévia interativa (Remotion Player)
                </button>
                {(proj as any).reference?.file && (
                  <button className={`btn ${viewMode === "compare" ? "primary" : ""}`} onClick={() => setViewMode("compare")}>
                    ⇄ Comparar c/ Referência
                  </button>
                )}
              </div>
              {proj.renders?.length > 0 && (
                <div className="row" style={{ gap: 8 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Versão:</span>
                  <select value={version} onChange={(e) => setVersion(Number(e.target.value))} style={{ width: 110, padding: "4px 8px" }}>
                    {proj.renders.map((r) => (
                      <option key={r.version} value={r.version}>
                        v{r.version} ({fmtBytes(r.size)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {viewMode === "mp4" ? (
              curRender ? (
                <div className="col" style={{ gap: 10 }}>
                  <div style={{ background: "#000", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <video
                      key={media(proj.id, curRender.mp4)}
                      src={media(proj.id, curRender.mp4)}
                      poster={rev?.frames?.[1]?.path ? media(proj.id, rev.frames[1].path) : undefined}
                      controls
                      playsInline
                      style={{ width: "100%", maxHeight: 460, display: "block" }}
                    />
                  </div>
                  <div className="row spread">
                    <div className="row" style={{ gap: 8 }}>
                      <a className="btn primary" href={media(proj.id, curRender.mp4)} download={`${proj.id}-v${curRender.version}.mp4`}>
                        ⬇ Baixar MP4 (v{curRender.version} · {fmtBytes(curRender.size)})
                      </a>
                      <a className="btn" href={media(proj.id, `renders/v${curRender.version}/captions.srt`)} download={`${proj.id}-v${curRender.version}.srt`}>
                        Legendas .SRT
                      </a>
                      <a className="btn" href={media(proj.id, `renders/v${curRender.version}/captions.vtt`)} download={`${proj.id}-v${curRender.version}.vtt`}>
                        Legendas .VTT
                      </a>
                      {rev?.thumbnail_pro && (
                        <a className="btn primary" href={media(proj.id, rev.thumbnail_pro)} download={`${proj.id}-v${curRender.version}-capa-pro.jpg`}>
                          🔥 Capa Pro .JPG
                        </a>
                      )}
                      {rev?.thumbnail && (
                        <a className="btn" href={media(proj.id, rev.thumbnail)} download={`${proj.id}-v${curRender.version}-thumb.jpg`}>
                          🖼 Capa .JPG
                        </a>
                      )}
                    </div>
                    <span className={`pill ${curRender.review_state === "approved" || curRender.review_state === "technical_passed" ? "ok" : "warn"}`}>
                      Revisão: {curRender.review_state}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 36, textAlign: "center" }} className="muted">
                  O MP4 ainda não foi renderizado para este projeto.
                </div>
              )
            ) : viewMode === "compare" && (proj as any).reference?.file ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="col" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Referência original (somente leitura):</span>
                  <video src={media(proj.id, (proj as any).reference.file)} controls playsInline style={{ width: "100%", maxHeight: 340, background: "#000", borderRadius: 8 }} />
                </div>
                <div className="col" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Vídeo gerado pelo FrameRise:</span>
                  {curRender ? (
                    <video src={media(proj.id, curRender.mp4)} controls playsInline style={{ width: "100%", maxHeight: 340, background: "#000", borderRadius: 8 }} />
                  ) : (
                    <div className="muted" style={{ padding: 24 }}>Renderize o MP4 para comparar lado a lado.</div>
                  )}
                </div>
              </div>
            ) : plan ? (
              <div style={{ background: "#000", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
                <Player
                  component={Film}
                  inputProps={{
                    plan,
                    assetUrls,
                    withAudio: true,
                    audioUrls: {
                      narration: plan.audio?.narration ? media(proj.id, plan.audio.narration) : undefined,
                      music: plan.audio?.music ? media(proj.id, plan.audio.music) : undefined,
                    },
                  }}
                  durationInFrames={totalFrames}
                  fps={fps}
                  compositionWidth={plan.width || 1280}
                  compositionHeight={plan.height || 720}
                  controls
                  style={{ width: "100%", maxHeight: 460 }}
                />
              </div>
            ) : null}

            {/* Mini-timeline visual proporcional das cenas */}
            {plan?.scenes?.length ? (
              <div className="col" style={{ gap: 6, marginTop: 4 }}>
                <div className="row spread">
                  <span className="muted" style={{ fontSize: 12 }}>
                    Linha do tempo ({plan.scenes.length} cenas · {(totalFrames / fps).toFixed(1)}s total · clique para editar):
                  </span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {plan.width}×{plan.height} @ {fps}fps
                  </span>
                </div>
                <div style={{ display: "flex", gap: 4, width: "100%", overflowX: "auto", paddingBottom: 4 }}>
                  {plan.scenes.map((s: any, idx: number) => {
                    const sec = (s.durationInFrames || 90) / fps;
                    const active = idx === selectedSceneIdx;
                    const sfxCount = Array.isArray(s.sfx) ? s.sfx.length : 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectScene(idx)}
                        style={{
                          flex: `${Math.max(1, s.durationInFrames || 90)} 1 0`,
                          minWidth: 74,
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: active ? "2px solid var(--accent, #38bdf8)" : "1px solid var(--border)",
                          background: active ? "rgba(56, 189, 248, 0.14)" : "var(--bg-elev)",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div className="row spread" style={{ fontSize: 11, fontWeight: 700 }}>
                          <span>#{idx + 1} {s.id}</span>
                          <span className="muted">{sec.toFixed(1)}s</span>
                        </div>
                        <div className="muted" style={{ fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.component.replace(/^vrs-/, "")} {sfxCount ? `· 🔊${sfxCount}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* Pedir ajustes ao agente */}
          <form onSubmit={askAdjustment} className="panel col" style={{ gap: 10 }}>
            <h3>Pedir ajustes ao agente</h3>
            <div className="row" style={{ gap: 10 }}>
              <input
                placeholder="Ex.: Aumente o destaque do gráfico na cena 3 e deixe a conclusão mais curta…"
                value={adjustMsg}
                onChange={(e) => setAdjustMsg(e.target.value)}
              />
              <button type="submit" className="btn primary" style={{ whiteSpace: "nowrap" }}>
                Pedir ajuste
              </button>
            </div>
          </form>

          {/* Revisão real de quadros, movimento, áudio e Kinocut gate */}
          {rev && (
            <div className="panel col" style={{ gap: 12 }}>
              <div className="row spread">
                <h3>Revisão técnica, visual e de movimento (v{rev.version})</h3>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary" onClick={() => approveContent("approved")}>
                    ✓ Aprovar revisão de conteúdo
                  </button>
                  <button className="btn" onClick={() => approveContent("needs_adjustment")}>
                    Solicitar correção
                  </button>
                </div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className={`pill ${rev.technical === "aprovado_tecnicamente" ? "ok" : "bad"}`}>
                  Técnico: {rev.technical} ({rev.probe?.duration?.toFixed?.(1) ?? rev.probe?.duration}s · {rev.probe?.video?.width}x{rev.probe?.video?.height})
                </span>
                <span className={`pill ${rev.kinocut?.exit_code === 0 ? "ok" : "warn"}`}>
                  Kinocut gate: {rev.kinocut?.exit_code === 0 ? `OK (score ${rev.kinocut?.report?.overall_score ?? ""})` : "Atenção"}
                </span>
                {Array.isArray(rev.motion) && rev.motion.length > 0 && (
                  <span className="pill ok">
                    Movimento medido: {(rev.motion.reduce((a: number, m: any) => a + (m.motion || 0), 0) / rev.motion.length).toFixed(2)} ({rev.motion.length} cenas)
                  </span>
                )}
                {rev.audio?.integrated_lufs !== undefined && (
                  <span className="pill ok">
                    Áudio: {rev.audio.integrated_lufs} LUFS (pico {rev.audio.true_peak_dbfs} dBFS)
                  </span>
                )}
                <span className={`pill ${rev.content === "aprovado_conteudo" ? "ok" : "warn"}`}>
                  Conteúdo: {rev.content}
                </span>
              </div>

              {rev.contact_sheet && (
                <div>
                  <span className="muted" style={{ fontSize: 12 }}>Folha de contato extraída do MP4 real:</span>
                  <img
                    src={media(proj.id, rev.contact_sheet)}
                    alt="Folha de contato"
                    style={{ width: "100%", borderRadius: 8, marginTop: 6, border: "1px solid var(--border)" }}
                  />
                </div>
              )}

              {rev.frames?.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                  {rev.frames.map((f: any) => {
                    const p = typeof f === "string" ? f : f.path;
                    return (
                      <img
                        key={p}
                        src={media(proj.id, p)}
                        alt={p}
                        style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border)" }}
                      />
                    );
                  })}
                </div>
              )}

              {rev.publish_kit && (
                <div className="col" style={{ gap: 8, marginTop: 6, padding: 12, background: "var(--bg-elev)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div className="row spread">
                    <strong>🚀 Kit de Publicação Automático (YouTube / Reels / TikTok)</strong>
                    {rev.thumbnail_pro && (
                      <a className="btn" href={media(proj.id, rev.thumbnail_pro)} download={`${proj.id}-capa-pro.jpg`} style={{ fontSize: 12, padding: "4px 10px" }}>
                        ⬇ Baixar Capa Pro .JPG
                      </a>
                    )}
                  </div>
                  <div className="col" style={{ gap: 4, fontSize: 12.5 }}>
                    <span className="muted">Sugestões de título:</span>
                    {(rev.publish_kit.titles || []).map((t: string, i: number) => (
                      <div key={i} className="mono" style={{ padding: "4px 8px", background: "rgba(0,0,0,0.22)", borderRadius: 6 }}>
                        {t}
                      </div>
                    ))}
                  </div>
                  {rev.publish_kit.chapters_text && (
                    <div className="col" style={{ gap: 4, fontSize: 12 }}>
                      <span className="muted">Capítulos automáticos (copie para a descrição):</span>
                      <pre className="mono" style={{ margin: 0, padding: 8, background: "rgba(0,0,0,0.28)", borderRadius: 6, whiteSpace: "pre-wrap" }}>
                        {rev.publish_kit.chapters_text}
                      </pre>
                    </div>
                  )}
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {(rev.publish_kit.hashtags || []).map((tag: string) => (
                      <span key={tag} className="pill">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Evidências de engenharia reversa da referência */}
          {(proj as any).brief_available && (
            <div className="panel col" style={{ gap: 10 }}>
              <div className="row spread">
                <h3>Engenharia reversa do vídeo de referência</h3>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {["brief", "metadata", "shots", "visual", "audio", "transcript", "ocr", "contact-sheet"].map((eid) => (
                    <button key={eid} type="button" className={`btn ${evidenceId === eid ? "primary" : ""}`} onClick={() => loadEvidence(eid)} style={{ padding: "4px 10px", fontSize: 12 }}>
                      {eid}
                    </button>
                  ))}
                </div>
              </div>
              {evidenceId === "contact-sheet" ? (
                <img src={media(proj.id, "evidence/contact-sheet.jpg")} alt="Contact sheet da referência" style={{ width: "100%", borderRadius: 8 }} />
              ) : (
                <pre className="mono" style={{ fontSize: 11.5, background: "var(--bg-elev)", padding: 10, borderRadius: 8, maxHeight: 240, overflow: "auto" }}>
                  {evidenceData ? JSON.stringify(evidenceData, null, 2) : "Clique em uma evidência acima para inspecionar sob demanda."}
                </pre>
              )}
            </div>
          )}

          {/* Editores avançados (JSON) */}
          <details className="panel">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              Recursos avançados: Storyboard JSON, FilmPlan JSON e Diagnóstico
            </summary>
            <div className="col" style={{ gap: 14, marginTop: 12 }}>
              <div className="col" style={{ gap: 6 }}>
                <label>Storyboard compacto (storyboard.json)</label>
                <textarea rows={8} className="mono" style={{ fontSize: 12 }} value={sbJson} onChange={(e) => setSbJson(e.target.value)} />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    try {
                      api.post(`/api/projects/${id}/creation/storyboard`, JSON.parse(sbJson)).then(load);
                    } catch (e: any) {
                      setErr(e.message);
                    }
                  }}
                >
                  Validar, expandir e renderizar Storyboard JSON
                </button>
              </div>
              <div className="col" style={{ gap: 6 }}>
                <label>Plano determinístico completo (plan.json)</label>
                <textarea rows={8} className="mono" style={{ fontSize: 12 }} value={planJson} onChange={(e) => setPlanJson(e.target.value)} />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    try {
                      api.put(`/api/projects/${id}/plan`, JSON.parse(planJson)).then(load);
                    } catch (e: any) {
                      setErr(e.message);
                    }
                  }}
                >
                  Salvar FilmPlan JSON e renderizar
                </button>
              </div>
            </div>
          </details>
        </div>

        {/* Coluna lateral: Editor visual de cenas e parâmetros */}
        <aside className="panel col" style={{ gap: 14, alignSelf: "start" }}>
          <h2>Cenas e parâmetros editáveis</h2>
          {plan?.scenes?.length ? (
            <>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {plan.scenes.map((s: any, idx: number) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`btn ${ idx === selectedSceneIdx ? "primary" : ""}`}
                    onClick={() => selectScene(idx)}
                    style={{ padding: "6px 10px", fontSize: 12 }}
                  >
                    {idx + 1}. {s.title || s.id}
                  </button>
                ))}
              </div>

              {sceneEdit && (
                <div className="col" style={{ gap: 10 }}>
                  <div className="row spread">
                    <span className="pill ok">{sceneEdit.component}</span>
                    <span className="muted mono" style={{ fontSize: 12 }}>id: {sceneEdit.id}</span>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11.5 }} onClick={() => manageSceneAction("add")} title="Adicionar nova cena após esta">
                      ➕ Cena
                    </button>
                    <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11.5 }} onClick={() => manageSceneAction("duplicate")} title="Duplicar esta cena">
                      📄 Duplicar
                    </button>
                    <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11.5 }} onClick={() => manageSceneAction("move_up")} disabled={selectedSceneIdx === 0} title="Mover cena para trás">
                      ⬅️
                    </button>
                    <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11.5 }} onClick={() => manageSceneAction("move_down")} disabled={selectedSceneIdx >= plan.scenes.length - 1} title="Mover cena para frente">
                      ➡️
                    </button>
                    <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11.5 }} onClick={() => manageSceneAction("delete")} disabled={plan.scenes.length <= 1} title="Excluir cena">
                      🗑️
                    </button>
                  </div>
                  <div>
                    <label>Motor / Estilo visual da cena</label>
                    <select
                      value={sceneEdit.component}
                      onChange={(e) => {
                        const nextComp = e.target.value;
                        const nextSpec = SPEC_MAP[nextComp];
                        const defaults = Object.fromEntries((nextSpec?.params || []).map((p: any) => [p.key, p.default]));
                        setSceneEdit({
                          ...sceneEdit,
                          component: nextComp,
                          params: { ...defaults, ...(sceneEdit.params?.title ? { title: sceneEdit.params.title } : {}) },
                        });
                      }}
                    >
                      {(sceneSpecs.scenes as any[]).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} ({s.id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Notas da cena</label>
                    <input
                      value={sceneEdit.notes || ""}
                      onChange={(e) => setSceneEdit({ ...sceneEdit, notes: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Duração (quadros @ {fps} fps = {((sceneEdit.durationInFrames || 180) / fps).toFixed(1)}s)</label>
                    <input
                      type="number"
                      step={fps}
                      min={60}
                      max={fps * 60}
                      value={sceneEdit.durationInFrames || 180}
                      onChange={(e) => setSceneEdit({ ...sceneEdit, durationInFrames: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col" style={{ gap: 6 }}>
                    <div className="row spread">
                      <label style={{ margin: 0 }}>Fala / Narração da cena (re-sintetiza voz ao salvar)</label>
                      <select
                        value={sceneEdit.voice || plan?.audio?.voice || "faber"}
                        onChange={(e) => setSceneEdit({ ...sceneEdit, voice: e.target.value })}
                        style={{ width: 150, padding: "3px 6px", fontSize: 11.5 }}
                        title="Voz desta cena"
                      >
                        {!voices.some((v) => v.id === (sceneEdit.voice || plan?.audio?.voice || "faber")) && <option value={sceneEdit.voice || plan?.audio?.voice || "faber"}>{sceneEdit.voice || plan?.audio?.voice || "faber"} · usada no projeto</option>}
                        {voices.map((v) => <option key={v.id} value={v.id}>{v.label || v.id} ({v.language})</option>)}
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      value={sceneEdit.narration || ""}
                      onChange={(e) => setSceneEdit({ ...sceneEdit, narration: e.target.value })}
                      placeholder="Digite a fala desta cena em português…"
                    />
                  </div>

                  {['vrs-pandora-cutout','vrs-multiplane-stage','vrs-story-panel'].includes(sceneEdit.component) && <label>✂️ Recortar apresentador/imagem<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)uploadCutout(f);}}/></label>}
                  {!!sceneEdit.anchors?.length && <div className="col">{sceneEdit.anchors.map((a:any,i:number)=><div key={i} className="row"><span>{a.word}: {a.effect}</span><button type="button" className="btn ghost" onClick={()=>setSceneEdit({...sceneEdit,anchors:sceneEdit.anchors.filter((_:any,j:number)=>j!==i)})}>Remover</button></div>)}</div>}
                  {/* Pílulas clicáveis de palavras sincronizadas (WordAnchor) */}
                  {Array.isArray(sceneEdit.words) && sceneEdit.words.length > 0 && (
                    <div className="col" style={{ gap: 6 }}>
                      <label>Efeito na palavra<select value={anchorEffect} onChange={e=>setAnchorEffect(e.target.value as any)}>{['highlight','zoom_punch','sticker_pop','broll_overlay','badge_flash','camera_shake'].map(x=><option key={x}>{({highlight:"Destaque",zoom_punch:"Zoom rápido",sticker_pop:"Sticker animado",broll_overlay:"Vídeo ou imagem de apoio",badge_flash:"Selo de destaque",camera_shake:"Tremor leve"} as Record<string,string>)[x] || x}</option>)}</select></label>
                      <label>Mídia do efeito (caminho do projeto ou lib:id)<input value={anchorAsset} onChange={e=>setAnchorAsset(e.target.value)} placeholder="assets/… ou lib:…"/></label>
                      <label>
                        Palavras sincronizadas ({sceneEdit.timing || "tts"} · clique p/ marcar ênfase/âncora):
                      </label>
                      <div className="row" style={{ gap: 4, flexWrap: "wrap", maxHeight: 110, overflowY: "auto", padding: 6, background: "var(--bg-elev)", borderRadius: 8 }}>
                        {sceneEdit.words.map((w: any) => {
                          const clean = String(w.word || "").replace(/[.,!?;:"'()]/g, "").trim();
                          const emphList = String(sceneEdit.params?.emphasis || "").toLowerCase().split(",").map((x) => x.trim());
                          const isEmph = (sceneEdit.anchors||[]).some((a:any)=>a.wordId===w.id) || (clean && emphList.includes(clean.toLowerCase()));
                          return (
                            <button
                              key={w.id}
                              type="button"
                              className={`pill ${isEmph ? "ok" : ""}`}
                              style={{ cursor: "pointer", border: "1px solid var(--border)", fontSize: 11 }}
                              onClick={() => toggleAnchor(w)}
                              title={`${w.id}: ${(w.start / 1000).toFixed(2)}s – ${(w.end / 1000).toFixed(2)}s`}
                            >
                              {w.word} <span className="muted" style={{ fontSize: 9.5 }}>{(w.start / 1000).toFixed(1)}s</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Upload opcional de gravação de voz própria (forced_aligned) */}
                  <div className="col" style={{ gap: 4 }}>
                    <label>Substituir por gravação de voz própria (.wav/.mp3 · alinhamento local):</label>
                    <input
                      type="file"
                      accept=".wav,.mp3,.ogg,.m4a"
                      style={{ fontSize: 11.5 }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadSceneVoice(f);
                      }}
                    />
                  </div>

                  {/* Parâmetros do preset baseados em scene-specs.json */}
                  {(SPEC_MAP[sceneEdit.component]?.params || []).map((p: any) => {
                    const val = sceneEdit.params?.[p.key] ?? p.default;
                    if (p.type === "boolean") {
                      return <label key={p.key} className="row"><input type="checkbox" checked={val === true} onChange={(e) => setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: e.target.checked } })} />{p.label}</label>;
                    }
                    if (p.type === "list") {
                      const items: any[] = Array.isArray(val) ? val : [];
                      const isObjList = p.item?.type === "object" && Array.isArray(p.item?.fields);
                      return (
                        <div key={p.key} className="col" style={{ gap: 6, padding: 8, background: "var(--bg-elev)", borderRadius: 8, border: "1px solid var(--border)" }}>
                          <div className="row spread">
                            <label style={{ margin: 0 }}>{p.label} ({items.length})</label>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: "2px 8px", fontSize: 11 }}
                              onClick={() => {
                                const newItem = isObjList
                                  ? Object.fromEntries((p.item.fields as any[]).map((f: any) => [f.key, f.default ?? ""]))
                                  : p.item?.default ?? "Novo item";
                                setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: [...items, newItem] } });
                              }}
                            >
                              + Adicionar
                            </button>
                          </div>
                          {items.map((it: any, idxItem: number) => (
                            <div key={idxItem} className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap", padding: "4px 6px", background: "rgba(0,0,0,0.18)", borderRadius: 6 }}>
                              {isObjList ? (
                                (p.item.fields as any[]).map((f: any) => (
                                  <input
                                    key={f.key}
                                    type={f.type === "number" ? "number" : "text"}
                                    placeholder={f.label || f.key}
                                    value={String(it?.[f.key] ?? "")}
                                    style={{ flex: "1 1 90px", fontSize: 11.5, padding: "4px 6px" }}
                                    onChange={(e) => {
                                      const next = items.map((row, rIdx) =>
                                        rIdx === idxItem ? { ...row, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value } : row,
                                      );
                                      setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: next } });
                                    }}
                                  />
                                ))
                              ) : (
                                <input
                                  type="text"
                                  value={String(it ?? "")}
                                  style={{ flex: 1, fontSize: 12, padding: "4px 6px" }}
                                  onChange={(e) => {
                                    const next = items.map((row, rIdx) => (rIdx === idxItem ? e.target.value : row));
                                    setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: next } });
                                  }}
                                />
                              )}
                              <button
                                type="button"
                                className="btn ghost"
                                style={{ padding: "2px 6px", fontSize: 11 }}
                                onClick={() => {
                                  const next = items.filter((_, rIdx) => rIdx !== idxItem);
                                  setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: next } });
                                }}
                                title="Remover item"
                              >
                                🗑
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    if (p.type === "select") {
                      return (
                        <div key={p.key}>
                          <label>{p.label}</label>
                          <select
                            value={String(val ?? "")}
                            onChange={(e) => setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: e.target.value } })}
                          >
                            {(p.options || []).map((o: string) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    if (p.type === "color") {
                      return (
                        <div key={p.key}>
                          <label>{p.label}</label>
                          <div className="row" style={{ gap: 8 }}>
                            <input
                              type="color"
                              value={String(val || "#38bdf8")}
                              onChange={(e) => setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: e.target.value } })}
                              style={{ width: 44, height: 34, padding: 2 }}
                            />
                            <input
                              type="text"
                              value={String(val ?? "")}
                              onChange={(e) => setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: e.target.value } })}
                            />
                          </div>
                        </div>
                      );
                    }
                    if (p.type === "asset") {
                      return (
                        <div key={p.key} className="col" style={{ gap: 4 }}>
                          <label>{p.label}</label>
                          <select
                            value={QUICK_ASSETS.some((qa) => qa.value === String(val ?? "")) ? String(val ?? "") : ""}
                            onChange={(e) => {
                              if (e.target.value) {
                                setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: e.target.value } });
                              }
                            }}
                          >
                            {QUICK_ASSETS.map((qa) => (
                              <option key={qa.label} value={qa.value}>
                                {qa.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Ex.: lib:user-avatars.animal-character-coder-red-panda"
                            value={String(val ?? "")}
                            onChange={(e) => setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: e.target.value } })}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={p.key}>
                        <label>{p.label}</label>
                        <input
                          type={p.type === "number" ? "number" : "text"}
                          value={String(val ?? "")}
                          onChange={(e) =>
                            setSceneEdit({
                              ...sceneEdit,
                              params: { ...sceneEdit.params, [p.key]: p.type === "number" ? Number(e.target.value) : e.target.value },
                            })
                          }
                        />
                      </div>
                    );
                  })}

                  <button type="button" className="btn primary" onClick={saveScenePatch}>
                    💾 Salvar cena e re-renderizar (cache incremental)
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="muted">Nenhuma cena expandida ainda.</div>
          )}
        </aside>
      </div>
    </div>
  );
};
