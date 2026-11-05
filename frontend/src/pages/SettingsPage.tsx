import React, { useEffect, useState } from "react";
import { api } from "../api";

export const SettingsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [theme, setTheme] = useState<string>(() => document.documentElement.getAttribute("data-theme") || "dark");
  const [ttsText, setTtsText] = useState<string>("Olá! Esta voz foi sintetizada localmente na CPU pelo FrameRise.");
  const [ttsVoice, setTtsVoice] = useState<string>("faber");
  const [ttsJob, setTtsJob] = useState<any>(null);

  useEffect(() => {
    api.get("/api/settings").then(setData);
  }, []);

  const toggleTheme = (t: "dark" | "light") => {
    setTheme(t);
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  };

  const previewTts = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post<any>("/api/voice/preview", { text: ttsText, voice: ttsVoice });
    setTtsJob(r.job);
    const poll = setInterval(async () => {
      const j = await api.get<any>(`/api/jobs/${r.job.id}`);
      setTtsJob(j);
      if (j.state === "done" || j.state === "failed" || j.state === "cancelled") clearInterval(poll);
    }, 1000);
  };

  return (
    <div className="col" style={{ gap: 18 }}>
      <header className="row spread">
        <div>
          <h1 style={{ fontSize: 24 }}>Configurações</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            Agentes e adaptadores, vozes PT-BR em CPU, política de segurança Sogni Unlimited e limites operacionais.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className={`btn ${theme !== "light" ? "primary" : ""}`} onClick={() => toggleTheme("dark")}>
            🌙 Modo escuro (padrão)
          </button>
          <button className={`btn ${theme === "light" ? "primary" : ""}`} onClick={() => toggleTheme("light")}>
            ☀ Modo claro
          </button>
        </div>
      </header>

      <div className="create-layout">
        <div className="col" style={{ gap: 16 }}>
          <div className="panel col" style={{ gap: 10 }}>
            <h2>Agentes de direção</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              O agente é o cérebro criativo; o FrameRise é o motor determinístico em CPU. Nenhum LLM pesado roda embutido na CPU.
            </p>
            <div className="col" style={{ gap: 8 }}>
              {(data?.agents || []).map((a: any) => (
                <div key={a.id} className="row spread" style={{ padding: "10px 12px", background: "var(--bg-elev)", borderRadius: 8 }}>
                  <div>
                    <strong>{a.label}</strong> <code className="muted">({a.id})</code>
                    <div className="muted" style={{ fontSize: 12 }}>{a.note}</div>
                  </div>
                  <span className={`pill ${a.available ? "ok" : "warn"}`}>
                    {a.available ? "Disponível" : "Não detectado"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel col" style={{ gap: 10 }}>
            <h2>Vozes locais em CPU · Piper e Supertonic</h2>
            <div className="col" style={{ gap: 8 }}>
              {(data?.voices || []).map((v: any) => (
                <div key={v.id} className="row spread" style={{ padding: "8px 12px", background: "var(--bg-elev)", borderRadius: 8 }}>
                  <div>
                    <strong>{v.label || v.id}</strong> · <span className="muted">{v.language} ({v.quality})</span>
                    {v.model_card && <p className="muted" style={{ fontSize: 12 }}>{v.model_card}</p>}
                  </div>
                  {v.audition && <audio controls preload="none" src={v.audition} style={{ height: 30 }} />}
                </div>
              ))}
            </div>
            <form onSubmit={previewTts} className="col" style={{ gap: 8, marginTop: 8 }}>
              <label>Testar síntese local com tempos de palavras (precisão indicada no resultado)</label>
              <div className="row" style={{ gap: 8 }}>
                <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} style={{ width: 120 }}>
                  {(data?.voices || []).map((v: any) => (
                    <option key={v.id} value={v.id}>{v.id}</option>
                  ))}
                </select>
                <input value={ttsText} onChange={(e) => setTtsText(e.target.value)} />
                <button type="submit" className="btn primary" style={{ whiteSpace: "nowrap" }}>
                  Gerar prévia
                </button>
              </div>
              {ttsJob && (
                <div className="row spread" style={{ fontSize: 12.5 }}>
                  <span>Status: <strong>{ttsJob.state}</strong> {ttsJob.result?.timing ? `(tempos: ${ttsJob.result.timing})` : ""} {ttsJob.error ? ` — ${ttsJob.error.split("\n")[0]}` : ""}</span>
                  {ttsJob.result?.wav && <audio controls src={`/media/outputs/${ttsJob.result.wav}`} style={{ height: 30 }} />}
                </div>
              )}
            </form>
          </div>
        </div>

        <aside className="col" style={{ gap: 16 }}>
          <div className="panel col" style={{ gap: 10 }}>
            <h2>Política Sogni (Opcional)</h2>
            <div className="row spread">
              <span>Estado padrão:</span>
              <span className="pill">{data?.sogni?.enabled ? "Habilitado" : "Desabilitado por padrão"}</span>
            </div>
            <div className="row spread">
              <span>Modo permitido:</span>
              <span className="pill ok">{data?.sogni?.policy || "unlimited_subscription_only"}</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5 }}>
              {data?.sogni?.reason || "Nenhuma chamada paga, compra de créditos, Spark, SOGNI ou fallback automático é permitido."}
            </p>
          </div>

          <div className="panel col" style={{ gap: 10 }}>
            <h2>Servidor, armazenamento e CPU</h2>
            <div className="row spread">
              <span className="muted">Servidor HTTP:</span>
              <code>{data?.server || "127.0.0.1:8765"}</code>
            </div>
            <div className="row spread">
              <span className="muted">Diretório de dados:</span>
              <code>{data?.storage?.data}</code>
            </div>
            <div className="row spread">
              <span className="muted">Espaço livre em disco:</span>
              <strong>{data?.storage?.free_gb} GB</strong>
            </div>
            <div className="row spread">
              <span className="muted">Limite de threads CPU:</span>
              <code>{data?.limits?.threads}</code>
            </div>
            <div className="row spread">
              <span className="muted">Concorrência de render:</span>
              <code>{data?.limits?.render_concurrency}</code>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
