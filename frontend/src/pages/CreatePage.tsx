import React, { useEffect, useState } from "react";
import { api, Catalog, Niche, Resource } from "../api";
import { go } from "../App";

const ASPECT_LABELS: Record<string, string> = {
  landscape: "Horizontal (16:9)",
  vertical: "Vertical (9:16)",
  square: "Quadrado (1:1)",
};

export const CreatePage: React.FC = () => {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [libVideos, setLibVideos] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Niche | null>(null);
  const [idea, setIdea] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [aspect, setAspect] = useState<string>("landscape");
  const [duration, setDuration] = useState<number>(36);
  const [refKind, setRefKind] = useState<"none" | "library" | "upload" | "url">("none");
  const [refLibraryId, setRefLibraryId] = useState<string>("nasa-documentary.sunlight-asteroids");
  const [refUrl, setRefUrl] = useState<string>("");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [voiceId, setVoiceId] = useState<string>("faber");
  const [captions, setCaptions] = useState<string>("word");
  const [agent, setAgent] = useState<string>("mcp");
  const [sogni, setSogni] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    api.get<Catalog>("/api/creation/catalog").then((c) => {
      setCat(c);
      if (c.niches.length > 0) {
        const first = c.niches[0];
        setSelected(first);
        setDuration(first.defaultDuration);
        setAspect(first.example.aspect || "landscape");
      }
    }).catch((e) => setErr(String(e.message || e)));
    api.get<{ items: Resource[] }>("/api/creation/resources?kind=video&limit=30").then((r) => {
      setLibVideos(r.items || []);
      if (r.items?.[0]?.id) setRefLibraryId(r.items[0].id);
    }).catch(() => {});
  }, []);

  const chooseNiche = (n: Niche) => {
    setSelected(n);
    setDuration(n.defaultDuration);
    if (n.aspects.includes(n.example.aspect)) setAspect(n.example.aspect);
  };

  const applyQuickPreset = (nicheId: string, title: string, promptIdea: string, asp = "landscape", dur = 16, refLib = "") => {
    const target = cat?.niches.find((n) => n.id === nicheId);
    if (target) chooseNiche(target);
    if (refLib) {
      setRefKind("library");
      setRefLibraryId(refLib);
    } else {
      setRefKind("none");
    }
    setDuration(dur);
    setAspect(asp);
    setName(title);
    setIdea(promptIdea);
  };

  const applyQuickHalloween = () =>
    applyQuickPreset(
      "documentario",
      "A origem histórica do Halloween",
      "Explique a origem do Halloween em português, em 45 segundos. Quero cenas animadas, gráficos e legendas.",
      "landscape",
      45,
      "nasa-documentary.sunlight-asteroids",
    );

  const applyQuickQuote = () =>
    applyQuickPreset(
      "frases",
      "Disciplina silenciosa",
      "A clareza não nasce da pressa: ela aparece quando você remove o excesso e sustenta o ritmo todos os dias.",
      "vertical",
      20,
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setErr("");
    try {
      let res: any;
      if (refKind === "upload") {
        if (!refFile) throw new Error("Selecione um arquivo de vídeo MP4, WebM ou MOV para enviar.");
        const fd = new FormData();
        fd.append("file", refFile);
        fd.append("niche_id", selected.id);
        fd.append("idea", idea);
        fd.append("aspect", aspect);
        fd.append("duration", String(duration));
        fd.append("voice_id", voiceId);
        fd.append("captions", captions);
        fd.append("agent", agent);
        fd.append("quality", "final");
        res = await api.post("/api/creation/start-upload", fd);
      } else {
        const reference =
          refKind === "library"
            ? { kind: "library", resource_id: refLibraryId }
            : refKind === "url"
              ? { kind: "link", url: refUrl.trim() }
              : { kind: "niche_example" };
        res = await api.post("/api/creation/start", {
          niche_id: selected.id,
          idea,
          name,
          aspect,
          duration,
          reference,
          voice: voiceId,
          captions,
          agent,
          quality: "final",
          sogni,
        });
      }
      go(`#/projetos/${res.project.id}`);
    } catch (ex: any) {
      setErr(ex.message || String(ex));
    } finally {
      setBusy(false);
    }
  };

  const selectedVoice = cat?.voices.find((v) => v.id === voiceId);
  const selectedAgent = cat?.agents.find((a) => a.id === agent);

  return (
    <div className="col" style={{ gap: 22 }}>
      <header className="row spread">
        <div>
          <h1 style={{ fontSize: 24 }}>Criar vídeo</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            Escolha um modelo completo por nicho, assista ao exemplo animado, escreva sua ideia e gere seu MP4 localmente na CPU.
          </p>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              applyQuickPreset(
                "stickman",
                "O Paradoxo da Produtividade",
                "Por que trabalhar 12 horas seguidas derruba o foco, explicado com bonecos palito articulados no quadro branco.",
                "landscape",
                16,
              )
            }
          >
            ✏️ Preset: Boneco Palito 2D
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              applyQuickPreset(
                "southpark",
                "O Plano Infalível na Neve",
                "Dois amigos estilo recorte de papel South Park discutindo um plano maluco no ponto de ônibus.",
                "landscape",
                16,
                "vrs-templates.paper-cutout-demo",
              )
            }
          >
            ✂️ Preset: Estilo South Park
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              applyQuickPreset(
                "roblox",
                "Desafio no Obby das Nuvens",
                "Bonecos 3D estilo Roblox saltando obstáculos no céu e comemorando no acampamento.",
                "landscape",
                16,
                "vrs-templates.roblox-demo",
              )
            }
          >
            🧱 Preset: Mundo Roblox 3D
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              applyQuickPreset(
                "multiplane",
                "Podcast dos Avatares: IA vs Código",
                "O Panda Programador e o Tubarão Advogado debatendo em um estúdio multi-plano com stickers die-cut.",
                "landscape",
                16,
                "vrs-templates.stickers-demo",
              )
            }
          >
            🎭 Preset: Avatares + Stickers
          </button>
          <button type="button" className="btn ghost" onClick={applyQuickHalloween}>
            🎃 Exemplo: Halloween
          </button>
          <button type="button" className="btn ghost" onClick={applyQuickQuote}>
            ✦ Exemplo: Frase
          </button>
        </div>
      </header>

      {err && (
        <div className="panel" style={{ borderColor: "var(--bad)", color: "#fecaca" }}>
          {err}
        </div>
      )}

      <section className="col" style={{ gap: 10 }}>
        <div className="row spread">
          <h2>1. Escolha um nicho e modelo completo</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {cat?.niches.length ?? 0} modelos completos com cenas, transições, voz e legendas
          </span>
        </div>
        <div className="grid-niches">
          {cat?.niches.map((n) => {
            const isSel = selected?.id === n.id;
            return (
              <div
                key={n.id}
                className={`niche-card ${isSel ? "selected" : ""}`}
                onClick={() => chooseNiche(n)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && chooseNiche(n)}
              >
                <div className="thumb">
                  {n.example_video ? (
                    <video
                      src={n.example_video}
                      poster={n.thumbnail || undefined}
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  ) : n.thumbnail ? (
                    <img src={n.thumbnail} alt={n.title} />
                  ) : (
                    <div className="row" style={{ height: "100%", justifyContent: "center", color: "var(--muted)" }}>
                      {n.emoji} {n.title}
                    </div>
                  )}
                </div>
                <div className="body col" style={{ gap: 6 }}>
                  <div className="row spread">
                    <strong style={{ fontSize: 15 }}>
                      {n.emoji} {n.title}
                    </strong>
                    <span className="pill">{n.defaultDuration}s</span>
                  </div>
                  <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                    {n.description}
                  </p>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                    {n.arc.map((step, idx) => (
                      <span key={idx} className="pill" style={{ fontSize: 10.5 }}>
                        {step}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selected && (
        <form onSubmit={submit} className="create-layout">
          <div className="panel col" style={{ gap: 16 }}>
            <h2>2. Descreva sua ideia e referências</h2>

            <div className="col" style={{ gap: 6 }}>
              <label htmlFor="idea-input" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                Qual é a sua ideia?
              </label>
              <textarea
                id="idea-input"
                rows={4}
                placeholder={`Ex.: ${selected.example.idea}`}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                style={{ fontSize: 15 }}
              />
              <span className="muted" style={{ fontSize: 12 }}>
                O agente criará roteiro, falas, textos, cenas animadas e legendas originais para a sua ideia. Se deixar em branco, usará o tema de demonstração do modelo.
              </span>
            </div>

            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "2 1 240px" }}>
                <label htmlFor="proj-name">Título do projeto (opcional)</label>
                <input
                  id="proj-name"
                  placeholder={selected.example.title}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label htmlFor="proj-aspect">Formato</label>
                <select id="proj-aspect" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  {selected.aspects.map((a) => (
                    <option key={a} value={a}>
                      {ASPECT_LABELS[a] ?? a}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <label htmlFor="proj-dur">Duração alvo (s)</label>
                <input
                  id="proj-dur"
                  type="number"
                  min={8}
                  max={180}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) || selected.defaultDuration)}
                />
              </div>
            </div>

            <div className="col" style={{ gap: 8 }}>
              <label>Referência estrutural e de ritmo</label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {[
                  { id: "none", label: "Exemplo do modelo" },
                  { id: "library", label: "Vídeo da biblioteca" },
                  { id: "upload", label: "Enviar vídeo" },
                  { id: "url", label: "Link público" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`btn ${refKind === opt.id ? "primary" : ""}`}
                    onClick={() => setRefKind(opt.id as any)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {refKind === "none" && (
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Segue diretamente a receita editorial de <strong>{selected.title}</strong> ({selected.arc.join(" → ")}).
                </div>
              )}

              {refKind === "library" && (
                <div className="col" style={{ gap: 6 }}>
                  <select value={refLibraryId} onChange={(e) => setRefLibraryId(e.target.value)}>
                    {libVideos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.id}) — {v.license}
                      </option>
                    ))}
                  </select>
                  <span className="muted" style={{ fontSize: 12 }}>
                    O vídeo da biblioteca será medido (cortes, ritmo, áudio, transcrição) sem precisar reenviar arquivo. O conteúdo final será 100% adaptado à sua ideia.
                  </span>
                </div>
              )}

              {refKind === "upload" && (
                <div className="col" style={{ gap: 6 }}>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
                  />
                  <span className="muted" style={{ fontSize: 12 }}>
                    A referência orienta estrutura, ritmo e mecanismos visuais; o vídeo final terá roteiro e visual originais para o seu tema.
                  </span>
                </div>
              )}

              {refKind === "url" && (
                <div className="col" style={{ gap: 6 }}>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={refUrl}
                    onChange={(e) => setRefUrl(e.target.value)}
                  />
                  <span className="muted" style={{ fontSize: 12 }}>
                    Baixado localmente via yt-dlp com limite de tamanho e analisado em segundo plano.
                  </span>
                </div>
              )}
            </div>

            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px" }}>
                <label htmlFor="voice-sel">Voz local PT-BR (CPU)</label>
                <select id="voice-sel" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                  {cat?.voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} ({v.language} · {v.quality})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <label htmlFor="cap-sel">Legendas sincronizadas</label>
                <select id="cap-sel" value={captions} onChange={(e) => setCaptions(e.target.value)}>
                  <option value="word">Destaque palavra por palavra</option>
                  <option value="phrase">Por frase (bloco limpo)</option>
                  <option value="off">Desativadas</option>
                </select>
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <label htmlFor="agent-sel">Direção pelo agente</label>
                <select id="agent-sel" value={agent} onChange={(e) => setAgent(e.target.value)}>
                  {cat?.agents.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.available}>
                      {a.label} {!a.available ? "(indisponível)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedVoice?.audition && (
              <div className="row spread" style={{ padding: "8px 12px", background: "var(--bg-elev)", borderRadius: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  Prévia da voz <strong>{selectedVoice.id}</strong>:
                </span>
                <audio controls preload="none" src={selectedVoice.audition} style={{ height: 30 }} />
              </div>
            )}

            {selectedAgent && (
              <div style={{ padding: "10px 12px", background: "var(--bg-elev)", borderRadius: 8, fontSize: 12.5, border: "1px solid var(--border)" }}>
                <strong>Modo {selectedAgent.label}:</strong> {selectedAgent.note}
                {selectedAgent.id === "mcp" && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    Depois de medir a referência, o projeto fica aguardando o agente conectado por MCP/CLI enviar o roteiro original. Nada é gerado sozinho nesse modo: a tela do projeto mostra claramente essa espera. O modo <em>Sem agente (rascunho do modelo)</em> renderiza na hora, mas apenas o exemplo do modelo, sem adaptar à sua ideia.
                  </div>
                )}
              </div>
            )}

            <div className="row spread" style={{ padding: "8px 12px", background: "var(--bg-elev)", borderRadius: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, cursor: "pointer", color: "var(--text)" }}>
                <input
                  type="checkbox"
                  checked={sogni}
                  onChange={(e) => setSogni(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                Habilitar mídia opcional Sogni (somente assinatura Unlimited; zero créditos)
              </label>
              <span className="pill">{cat?.sogni.enabled ? "Sogni ativo" : "Desligado por padrão"}</span>
            </div>

            <div className="row spread" style={{ marginTop: 4 }}>
              <div className="stages" style={{ flex: 1, marginRight: 14 }}>
                {["análise", "roteiro/direção", "recursos/animação", "montagem", "revisão", "MP4"].map((st) => (
                  <div key={st} className="stage">
                    {st}
                  </div>
                ))}
              </div>
              <button type="submit" className="btn primary" disabled={busy} style={{ padding: "12px 22px", fontSize: 15 }}>
                {busy ? "Iniciando projeto…" : "✦ Criar minha versão"}
              </button>
            </div>
          </div>

          <aside className="panel col" style={{ gap: 14, alignSelf: "start", position: "sticky", top: 18 }}>
            <div className="row spread">
              <h2>Prévia do modelo selecionado</h2>
              <span className="pill ok">{selected.id}</span>
            </div>
            <div style={{ borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid var(--border)" }}>
              {selected.example_video ? (
                <video
                  key={selected.example_video}
                  src={selected.example_video}
                  poster={selected.thumbnail || undefined}
                  controls
                  playsInline
                  style={{ width: "100%", maxHeight: 300, display: "block" }}
                />
              ) : (
                <div style={{ padding: 32, textAlign: "center" }} className="muted">
                  Exemplo em geração…
                </div>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {selected.emoji} {selected.example.title}
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Ideia do exemplo: “{selected.example.idea}”
              </p>
            </div>
            <div className="col" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                Receita de cenas ({selected.scenes.length} cenas animadas):
              </span>
              {selected.scenes.map((s, i) => (
                <div
                  key={i}
                  className="row spread"
                  style={{ padding: "6px 10px", background: "var(--bg-elev)", borderRadius: 7, fontSize: 12.5 }}
                >
                  <span>
                    <strong>{i + 1}. {s.label}</strong> <span className="muted">({s.preset_id})</span>
                  </span>
                  <span className="mono muted">{s.duration}s</span>
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 12 }}>Linguagens visuais:</span>
              {selected.visualLanguages.map((vl) => (
                <span key={vl} className="pill">{vl}</span>
              ))}
            </div>
          </aside>
        </form>
      )}
    </div>
  );
};
