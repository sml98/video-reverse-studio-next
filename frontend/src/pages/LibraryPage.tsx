import React, { useEffect, useState } from "react";
import { api, fmtBytes, Resource } from "../api";
import { GlbViewer } from "../components/GlbViewer";
import sceneSpecs from "../contracts/scene-specs.json";

const KIND_CAPABILITY: Record<string, string> = {
  image: "Imagem / prop 2D recortado — animável por posição, escala, rotação e parallax em camada.",
  pose: "Ilustração 2D estática (pose) — não possui rig esquelético; usada com entrada animada, fala e composição.",
  sfx: "Efeito sonoro CC0 — mixado de forma determinística nos pontos de transição e destaque.",
  video: "Vídeo real de domínio público — usável como referência estrutural ou clipe documental.",
  model3d: "Malha 3D glTF/GLB — visualizável no navegador; exige rig compatível para animação esquelética.",
  anim_library: "Biblioteca esquelética 3D (.glb) — contém clipes de movimento reais inspecionáveis em 3D abaixo.",
  texture: "Textura PBR CC0 — fundo ou superfície material.",
};

export const LibraryPage: React.FC = () => {
  const [tab, setTab] = useState<"resources" | "scenes">("resources");
  const [q, setQ] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const [pack, setPack] = useState<string>("");
  const [packs, setPacks] = useState<any[]>([]);
  const [items, setItems] = useState<Resource[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [scenes, setScenes] = useState<any[]>([]);
  const [active3d, setActive3d] = useState<Resource | null>(null);

  const loadResources = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (kind) params.set("kind", kind);
    if (pack) params.set("pack", pack);
    params.set("limit", "48");
    api.get<{ packs: any[]; items: Resource[]; total: number }>(`/api/library?${params.toString()}`).then((r) => {
      setPacks(r.packs || []);
      setItems(r.items || []);
      setTotal(r.total || 0);
    });
  };

  const loadScenes = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("limit", "100");
    api.get<{ items: any[] }>(`/api/creation/scenes?${params.toString()}`).then((r) => {
      setScenes(r.items || []);
    });
  };

  useEffect(() => {
    if (tab === "resources") loadResources();
    else loadScenes();
  }, [tab, kind, pack]);

  return (
    <div className="col" style={{ gap: 18 }}>
      <header className="row spread">
        <div>
          <h1 style={{ fontSize: 24 }}>Biblioteca</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            Materiais locais com licença e procedência, personagens, cenários, sons e {sceneSpecs.scenes.length} componentes de cenas.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className={`btn ${tab === "resources" ? "primary" : ""}`} onClick={() => setTab("resources")}>
            Materiais e pacotes ({total})
          </button>
          <button className={`btn ${tab === "scenes" ? "primary" : ""}`} onClick={() => setTab("scenes")}>
            Cenas e animações ({sceneSpecs.scenes.length})
          </button>
        </div>
      </header>

      <div className="panel row" style={{ gap: 10, flexWrap: "wrap" }}>
        <input
          placeholder="Buscar por nome ou tag em português/inglês (ex.: abóbora, fantasma, gráfico, caminhada)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (tab === "resources" ? loadResources() : loadScenes())}
          style={{ flex: "2 1 260px" }}
        />
        {tab === "resources" && (
          <>
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ flex: "1 1 160px" }}>
              <option value="">Todos os tipos</option>
              <option value="image">Imagem / Prop 2D</option>
              <option value="pose">Personagem 2D (Pose)</option>
              <option value="sfx">Efeito sonoro (SFX)</option>
              <option value="video">Vídeo de referência</option>
              <option value="anim_library">Biblioteca de animação 3D</option>
              <option value="model3d">Modelo 3D</option>
              <option value="texture">Textura</option>
            </select>
            <select value={pack} onChange={(e) => setPack(e.target.value)} style={{ flex: "1 1 180px" }}>
              <option value="">Todos os pacotes</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.id} ({p.license})
                </option>
              ))}
            </select>
          </>
        )}
        <button className="btn primary" onClick={() => (tab === "resources" ? loadResources() : loadScenes())}>
          Buscar
        </button>
      </div>

      {active3d && (
        <div className="panel col" style={{ gap: 10 }}>
          <div className="row spread">
            <div>
              <strong>Visualizador 3D interativo (Three.js): {active3d.name}</strong>
              <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>
                {KIND_CAPABILITY[active3d.kind] || active3d.kind}
              </span>
            </div>
            <button className="btn" onClick={() => setActive3d(null)}>
              Fechar 3D
            </button>
          </div>
          <GlbViewer url={active3d.url} height={320} />
        </div>
      )}

      {tab === "resources" ? (
        <div className="grid-niches">
          {items.map((r) => (
            <div key={r.id} className="niche-card" style={{ cursor: "default" }}>
              <div className="thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
                {r.kind === "image" || r.kind === "pose" || r.kind === "texture" ? (
                  <img src={r.preview || r.url} alt={r.name} loading="lazy" style={{ objectFit: "contain", maxHeight: "100%" }} />
                ) : r.kind === "video" ? (
                  <video src={r.url} poster={r.preview || undefined} controls preload="none" style={{ width: "100%", height: "100%" }} />
                ) : r.kind === "sfx" ? (
                  <audio src={r.url} controls preload="none" style={{ width: "90%" }} />
                ) : r.kind === "model3d" || r.kind === "anim_library" ? (
                  <button className="btn primary" onClick={() => setActive3d(r)}>
                    🧊 Inspecionar em 3D ({fmtBytes(r.size)})
                  </button>
                ) : (
                  <span className="muted">{r.kind}</span>
                )}
              </div>
              <div className="body col" style={{ gap: 6 }}>
                <div className="row spread">
                  <strong style={{ fontSize: 14 }}>{r.name}</strong>
                  <span className="pill ok">{r.license}</span>
                </div>
                <span className="mono muted" style={{ fontSize: 11 }}>
                  lib:{r.id}
                </span>
                <p className="muted" style={{ fontSize: 11.5 }}>
                  {r.capability || KIND_CAPABILITY[r.kind] || r.kind}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid-niches">
          {scenes.map((s) => (
            <div key={s.id} className="niche-card" style={{ cursor: "default" }}>
              {s.thumbnail && (
                <div className="thumb">
                  <img src={s.thumbnail} alt={s.title} />
                </div>
              )}
              <div className="body col" style={{ gap: 6 }}>
                <div className="row spread">
                  <strong style={{ fontSize: 14 }}>{s.title}</strong>
                  <span className="pill">{s.source}</span>
                </div>
                <span className="mono muted" style={{ fontSize: 11.5 }}>
                  {s.id}
                </span>
                <p className="muted" style={{ fontSize: 12 }}>
                  {s.summary}
                </p>
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  {(s.motion || []).map((m: string) => (
                    <span key={m} className="pill" style={{ fontSize: 10.5 }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
