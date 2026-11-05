import React, { useEffect, useState } from "react";
import { CreatePage } from "./pages/CreatePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectPage } from "./pages/ProjectPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";

function useHash(): string {
  const [h, setH] = useState(() => window.location.hash || "#/criar");
  useEffect(() => {
    const on = () => setH(window.location.hash || "#/criar");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return h;
}

export const go = (h: string) => {
  window.location.hash = h;
};

const NAV = [
  { h: "#/criar", label: "Criar vídeo", icon: "✦" },
  { h: "#/projetos", label: "Meus projetos", icon: "▤" },
  { h: "#/biblioteca", label: "Biblioteca", icon: "◫" },
  { h: "#/config", label: "Configurações", icon: "⚙" },
];

export const App: React.FC = () => {
  const hash = useHash();
  const parts = hash.replace(/^#\//, "").split("/");
  let page: React.ReactNode;
  if (parts[0] === "projetos" && parts[1]) page = <ProjectPage id={parts[1]} />;
  else if (parts[0] === "projetos") page = <ProjectsPage />;
  else if (parts[0] === "biblioteca") page = <LibraryPage />;
  else if (parts[0] === "config") page = <SettingsPage />;
  else page = <CreatePage />;
  const active = (h: string) => hash.startsWith(h);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><svg viewBox="0 0 44 44" aria-hidden="true"><path d="M4 15V4H15M29 4H40V15M40 29V40H29M15 40H4V29" fill="none" stroke="currentColor" strokeWidth="2.5"/><path d="M16 12L32 22L16 32Z" fill="currentColor"/></svg></div><div>FrameRise<small>CREATIVE STUDIO</small></div>
        </div>
        <nav className="nav col" style={{ gap: 4 }}>
          {NAV.map((n) => (
            <a key={n.h} href={n.h} className={active(n.h) ? "active" : ""}>
              <span aria-hidden>{n.icon}</span> {n.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-note"><span>✦</span><strong>Sua próxima história<br/>começa aqui.</strong><p>Crie, ajuste e dê vida às suas ideias.</p></div>
        <div className="foot">Seus projetos neste computador.</div>
      </aside>
      <div>
        <nav className="mobile-nav">
          {NAV.map((n) => (
            <a key={n.h} href={n.h} className={active(n.h) ? "active" : ""}>
              {n.label}
            </a>
          ))}
        </nav>
        <main>{page}</main>
      </div>
    </div>
  );
};
