import React from "react";
import { AbsoluteFill, Img, random, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, prog } from "../core/easing";
import { fontStack, useVrs, withAlpha } from "../core/theme";

/** Fundo com gradiente que respira e partículas lentas (movimento sutil, não distrai a leitura). */
export const Backdrop: React.FC<{ variant?: "particles" | "grid" | "glow" | "none"; seed?: string; intensity?: number }> = ({ variant = "particles", seed = "bg", intensity = 1 }) => {
  const frame = useCurrentFrame();
  const { theme, layout } = useVrs();
  const { width, height } = useVideoConfig();
  const t = frame / 30;
  const gx = 50 + Math.sin(t * 0.25) * 18;
  const gy = 40 + Math.cos(t * 0.2) * 14;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at ${gx}% ${gy}%, ${withAlpha(theme.accent2, 0.16 * intensity)} 0%, ${theme.background} 58%)` }}>
      {variant === "grid" && (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${withAlpha(theme.foreground, 0.05)} 1px, transparent 1px), linear-gradient(90deg, ${withAlpha(theme.foreground, 0.05)} 1px, transparent 1px)`,
            backgroundSize: `${80 * layout.u}px ${80 * layout.u}px`,
            backgroundPosition: `${(frame * 0.4) % (80 * layout.u)}px 0px`,
          }}
        />
      )}
      {variant === "glow" && <AbsoluteFill style={{ background: `radial-gradient(circle at ${100 - gx}% ${100 - gy}%, ${withAlpha(theme.accent, 0.12 * intensity)} 0%, transparent 45%)` }} />}
      {(variant === "particles" || variant === "glow") &&
        Array.from({ length: 22 }).map((_, i) => {
          const x = random(`${seed}-x-${i}`) * width;
          const baseY = random(`${seed}-y-${i}`) * height;
          const speed = 0.15 + random(`${seed}-s-${i}`) * 0.5;
          const y = (baseY - frame * speed * layout.u * 1.2 + height * 2) % height;
          const r = (2 + random(`${seed}-r-${i}`) * 5) * layout.u;
          return <div key={i} style={{ position: "absolute", left: x, top: y, width: r, height: r, borderRadius: r, background: withAlpha(i % 3 === 0 ? theme.accent : theme.foreground, 0.18 * intensity) }} />;
        })}
    </AbsoluteFill>
  );
};

/** Palavras entram em sequência com deslocamento e desfoque curto. */
export const KineticWords: React.FC<{
  text: string;
  start?: number;
  stagger?: number;
  size: number;
  color?: string;
  emphasis?: string[];
  emphasisColor?: string;
  font?: string;
  weight?: number;
  align?: "left" | "center";
  lineHeight?: number;
  uppercase?: boolean;
}> = ({ text, start = 0, stagger = 3, size, color, emphasis = [], emphasisColor, font, weight = 800, align = "left", lineHeight = 1.08, uppercase }) => {
  const frame = useCurrentFrame();
  const { theme } = useVrs();
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const emph = new Set(emphasis.map(norm).filter(Boolean));
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", gap: `${size * 0.1}px ${size * 0.26}px`, fontFamily: fontStack(font ?? theme.font), fontSize: size, fontWeight: weight, lineHeight, color: color ?? theme.foreground, textTransform: uppercase ? "uppercase" : "none" }}>
      {words.map((w, i) => {
        const p = prog(frame, start + i * stagger, 10, "out");
        const isE = emph.has(norm(w));
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * size * 0.45}px)`, filter: `blur(${(1 - p) * 6}px)`, color: isE ? emphasisColor ?? theme.accent : undefined }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Cabeçalho padrão de cena: título com barra de acento que se desenha. */
export const SceneHeader: React.FC<{ title: string; delay?: number; align?: "left" | "center" }> = ({ title, delay = 0, align = "left" }) => {
  const frame = useCurrentFrame();
  const { theme, layout } = useVrs();
  if (!title) return null;
  const bar = prog(frame, delay + 4, 14, "cinematic");
  return (
    <div style={{ position: "absolute", left: layout.padX, right: layout.padX, top: layout.padTop, textAlign: align }}>
      <KineticWords text={title} start={delay} stagger={2} size={(layout.vertical ? 64 : 58) * layout.u} align={align} />
      <div style={{ height: 6 * layout.u, width: `${bar * (layout.vertical ? 40 : 18)}%`, background: theme.accent, borderRadius: 4, marginTop: 16 * layout.u, marginLeft: align === "center" ? "auto" : 0, marginRight: align === "center" ? "auto" : 0 }} />
    </div>
  );
};

/** Imagem de recurso local; vazia => nada (nunca substitui silenciosamente por outra mídia). */
export const AssetImg: React.FC<{ src: string; style?: React.CSSProperties }> = ({ src, style }) => {
  const { assetUrl } = useVrs();
  if (!src) return null;
  return <Img src={assetUrl(src)} style={{ objectFit: "contain", ...style }} />;
};

export const Tag: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, layout } = useVrs();
  if (!text) return null;
  const p = pop(frame, fps, delay);
  return (
    <div style={{ display: "inline-block", transform: `scale(${p})`, padding: `${8 * layout.u}px ${18 * layout.u}px`, borderRadius: 999, background: withAlpha(theme.accent, 0.18), border: `${2 * layout.u}px solid ${theme.accent}`, color: theme.accent, fontFamily: fontStack("sans"), fontWeight: 800, fontSize: 24 * layout.u, letterSpacing: 2 * layout.u }}>
      {text}
    </div>
  );
};

export const Note: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { theme, layout } = useVrs();
  if (!text) return null;
  return (
    <div style={{ position: "absolute", left: layout.padX, right: layout.padX, top: layout.safeBottom - 44 * layout.u, fontFamily: fontStack("sans"), fontSize: 22 * layout.u, color: theme.muted, opacity: prog(frame, delay, 12) }}>
      {text}
    </div>
  );
};

export function useSceneT() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return { frame, fps, dur: durationInFrames };
}
