import React, { useEffect, useState } from "react";
import { Player } from "@remotion/player";
import { api, fmtBytes, media, Project } from "../api";
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
  const [viewMode, setViewMode] = useState<"mp4" | "player">("mp4");
  const [version, setVersion] = useState<number>(0);
  const [rev, setRev] = useState<any>(null);
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
          durationInFrames: Number(sceneEdit.durationInFrames) || 180,
          notes: sceneEdit.notes || "",
          params: sceneEdit.params,
        },
        render: true,
      });
      await load();
      setMsg("Cena atualizada e render enfileirado.");
    } catch (e: any) {
      setErr(e.message || String(e));
    }
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
        <div className="row" style={{ gap: 8 }}>
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
          <div className="row" style={{ gap: 10 }}>
            <button className="btn primary" onClick={generateWithRecipeFallback}>
              ⚡ Renderizar rascunho do modelo
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
              <div className="row" style={{ gap: 8 }}>
                <button className={`btn ${viewMode === "mp4" ? "primary" : ""}`} onClick={() => setViewMode("mp4")}>
                  ▶ Vídeo MP4
                </button>
                <button className={`btn ${viewMode === "player" ? "primary" : ""}`} onClick={() => setViewMode("player")} disabled={!plan}>
                  ✦ Prévia interativa (Remotion Player)
                </button>
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
                  <div>
                    <label>Fala / Narração (somente leitura no patch rápido; edite via Storyboard p/ re-sintetizar voz)</label>
                    <textarea rows={2} value={sceneEdit.narration || ""} readOnly style={{ opacity: 0.75 }} />
                  </div>

                  {/* Parâmetros do preset baseados em scene-specs.json */}
                  {(SPEC_MAP[sceneEdit.component]?.params || []).map((p: any) => {
                    const val = sceneEdit.params?.[p.key] ?? p.default;
                    if (p.type === "list") {
                      return (
                        <div key={p.key}>
                          <label>{p.label} (JSON)</label>
                          <textarea
                            rows={4}
                            className="mono"
                            style={{ fontSize: 11.5 }}
                            value={typeof val === "string" ? val : JSON.stringify(val, null, 2)}
                            onChange={(e) => {
                              try {
                                const parsed = JSON.parse(e.target.value);
                                setSceneEdit({ ...sceneEdit, params: { ...sceneEdit.params, [p.key]: parsed } });
                              } catch {
                                // aguarda JSON válido
                              }
                            }}
                          />
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
