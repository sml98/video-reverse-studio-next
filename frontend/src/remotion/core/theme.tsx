import React, { createContext, useContext, useEffect, useState } from "react";
import { continueRender, delayRender, staticFile, useVideoConfig } from "remotion";
import type { Theme } from "../../contracts/plan";

const FONT_FILES: Record<string, { family: string; file: string }> = {
  sans: { family: "VRS Inter", file: "fonts/Inter.ttf" },
  serif: { family: "VRS Playfair", file: "fonts/PlayfairDisplay.ttf" },
  display: { family: "VRS Anton", file: "fonts/Anton.ttf" },
  rounded: { family: "VRS Nunito", file: "fonts/Nunito.ttf" },
  mono: { family: "VRS Mono", file: "fonts/JetBrainsMono.ttf" },
};

export function fontStack(kind: string): string {
  const f = FONT_FILES[kind] ?? FONT_FILES.sans;
  return `"${f.family}", "Inter", "Lato", "DejaVu Sans", sans-serif`;
}

let fontsPromise: Promise<void> | null = null;
function loadFonts(): Promise<void> {
  if (fontsPromise) return fontsPromise;
  if (typeof FontFace === "undefined" || typeof document === "undefined") return Promise.resolve();
  fontsPromise = Promise.all(
    Object.values(FONT_FILES).map(async ({ family, file }) => {
      const face = new FontFace(family, `url(${staticFile(file)})`, { weight: "100 900" });
      try {
        await face.load();
        document.fonts.add(face);
      } catch {
        /* fonte do sistema como alternativa */
      }
    }),
  ).then(() => undefined);
  return fontsPromise;
}

/** Garante as fontes empacotadas (OFL) antes do primeiro frame — igual no Player e no MP4. */
export const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender("vrs-fonts"));
  useEffect(() => {
    loadFonts().then(() => continueRender(handle));
  }, [handle]);
  return <>{children}</>;
};

export type Layout = {
  w: number;
  h: number;
  u: number; // unidade: 1 = 1px em 1080p de menor lado
  vertical: boolean;
  padX: number;
  padTop: number;
  safeBottom: number; // limite inferior para conteúdo (reserva legendas)
};

export type Ctx = { theme: Theme; layout: Layout; assetUrl: (rel: string) => string; captionsOn: boolean };

const ThemeCtx = createContext<Ctx | null>(null);

export const ThemeProvider: React.FC<{ value: Ctx; children: React.ReactNode }> = ({ value, children }) => <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;

export function useVrs(): Ctx {
  const c = useContext(ThemeCtx);
  const { width, height } = useVideoConfig();
  if (c) return c;
  const layout = makeLayout(width, height, false);
  return { theme: { background: "#0b1020", foreground: "#f5f7ff", accent: "#ffb02e", accent2: "#5ad1ff", muted: "#8a93b8", font: "sans", visualLanguage: "motion-graphics" }, layout, assetUrl: (r) => r, captionsOn: false };
}

export function makeLayout(w: number, h: number, captionsOn: boolean): Layout {
  const u = Math.min(w, h) / 1080;
  const vertical = h > w * 1.1;
  const padX = Math.round(w * (vertical ? 0.07 : 0.06));
  const padTop = Math.round(h * (vertical ? 0.09 : 0.08));
  const reserve = captionsOn ? (vertical ? 0.26 : 0.2) : vertical ? 0.1 : 0.08;
  return { w, h, u, vertical, padX, padTop, safeBottom: Math.round(h * (1 - reserve)) };
}

export function withAlpha(hex: string, a: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  h = h.slice(0, 6);
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function fmtNumber(v: number, decimals = 0, locale = "pt-BR"): string {
  return v.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
