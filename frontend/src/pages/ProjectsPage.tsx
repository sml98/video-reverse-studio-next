import React, { useEffect, useState } from "react";
import { api, fmtBytes, media, Project } from "../api";
import { go } from "../App";

const STAGE_PT: Record<string, string> = {
  analysis: "Análise",
  direction: "Roteiro/Direção",
  animation: "Recursos/Animação",
  assembly: "Montagem",
  review: "Revisão",
  mp4: "MP4 Pronto",
};

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  aprovado_tecnicamente: { cls: "ok", label: "MP4 aprovado" },
  aprovado_com_achados: { cls: "warn", label: "MP4 com achados" },
  reprovado: { cls: "bad", label: "Reprovado na revisão" },
  draft: { cls: "", label: "Em andamento" },
};

export const ProjectsPage: React.FC = () => {
  const [items, setItems] = useState<Project[]>([]);
  const [showExamples, setShowExamples] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: Project[] }>(`/api/projects?examples=${showExamples}`)
      .then((r) => setItems(r.items || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [showExamples]);

  return (
    <div className="col" style={{ gap: 18 }}>
      <header className="row spread">
        <div>
          <h1 style={{ fontSize: 24 }}>Meus projetos</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            Acompanhe o andamento, assista às versões renderizadas, revise quadros reais ou edite parâmetros de cada cena.
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <label className="row" style={{ margin: 0, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={showExamples}
              onChange={(e) => setShowExamples(e.target.checked)}
              style={{ width: 15, height: 15 }}
            />
            Mostrar projetos dos exemplos de nicho
          </label>
          <button className="btn" onClick={load}>
            ↻ Atualizar
          </button>
          <button className="btn primary" onClick={() => go("#/criar")}>
            ✦ Novo vídeo
          </button>
        </div>
      </header>

      {loading ? (
        <div className="panel muted">Carregando projetos…</div>
      ) : items.length === 0 ? (
        <div className="panel col" style={{ alignItems: "flex-start", gap: 10 }}>
          <h3>Nenhum projeto criado ainda</h3>
          <p className="muted">Comece escolhendo um nicho em Criar vídeo ou carregue um exemplo pronto.</p>
          <button className="btn primary" onClick={() => go("#/criar")}>
            Criar meu primeiro vídeo
          </button>
        </div>
      ) : (
        <div className="grid-niches">
          {items.map((p) => {
            const st = STATUS_BADGE[p.status] ?? { cls: "", label: p.status };
            const lr = p.latest_render;
            return (
              <div
                key={p.id}
                className="niche-card"
                onClick={() => go(`#/projetos/${p.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && go(`#/projetos/${p.id}`)}
              >
                <div className="thumb">
                  {lr ? (
                    <video
                      src={media(p.id, lr.mp4)}
                      poster={media(p.id, `renders/v${lr.version}/review/contact-sheet.jpg`)}
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  ) : (
                    <div className="row" style={{ height: "100%", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>
                      Etapa: {STAGE_PT[p.stage] ?? p.stage}
                    </div>
                  )}
                </div>
                <div className="body col" style={{ gap: 8 }}>
                  <div className="row spread">
                    <strong style={{ fontSize: 15 }}>{p.name}</strong>
                    <span className={`pill ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    {p.idea || "Sem descrição"}
                  </p>
                  <div className="row spread" style={{ fontSize: 12, marginTop: 4 }}>
                    <span className="pill">{p.niche_id}</span>
                    <span className="muted">
                      {p.stage}
                      {lr ? ` · v${lr.version} (${fmtBytes(lr.size)})` : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
