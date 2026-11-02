import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { activeWordIndex, groupWords, visibleGroup, type Word } from "./core/words";
import { prog } from "./core/easing";
import { fontStack, withAlpha } from "./core/theme";

export type ViralCaptionsProps = {
  words: Word[];
  mode: "word" | "phrase" | "off";
  maxWords?: number;
  position?: "bottom" | "center" | "top";
  highlight?: string;
  color?: string;
  font?: string;
  /** Precisão declarada dos tempos (exibida apenas em metadados, nunca inventada). */
  precision?: string;
};

/**
 * Legendas com grupos de 2–4 palavras e destaque da palavra ativa ([start,end)).
 * Mode "phrase": anima entrada/saída por frase, sem fingir sincronização palavra a palavra.
 * Mesmo componente no Player e no MP4.
 */
export const ViralCaptions: React.FC<ViralCaptionsProps> = ({ words, mode, maxWords = 3, position = "bottom", highlight = "#ffd23f", color = "#ffffff", font = "display" }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ms = (frame * 1000) / fps;
  const groups = useMemo(() => (mode === "phrase" ? groupWords(words, 12, 600) : groupWords(words, Math.min(4, Math.max(2, maxWords)))), [words, mode, maxWords]);
  if (mode === "off" || words.length === 0) return null;
  const g = visibleGroup(groups, ms);
  if (!g) return null;
  const active = mode === "word" ? activeWordIndex(words, ms) : -1;
  const vertical = height > width * 1.1;
  const u = Math.min(width, height) / 1080;
  const size = (mode === "phrase" ? 46 : vertical ? 78 : 66) * u;
  const enterFrame = Math.floor((g.start * fps) / 1000);
  const t = prog(frame, enterFrame, Math.max(3, Math.round(fps * 0.18)), "back");
  const top = position === "top" ? height * 0.1 : position === "center" ? height * 0.45 : vertical ? height * 0.74 : height * 0.82;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: width * 0.08,
          right: width * 0.08,
          top,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: `${0.12 * size}px ${0.28 * size}px`,
          transform: `translateY(${(1 - t) * 24 * u}px) scale(${0.92 + 0.08 * t})`,
          opacity: Math.min(1, t * 1.4),
          fontFamily: fontStack(font),
          fontSize: size,
          lineHeight: 1.1,
          fontWeight: 800,
          textTransform: mode === "word" ? "uppercase" : "none",
          letterSpacing: mode === "word" ? 0.5 * u : 0,
          textAlign: "center",
        }}
      >
        {g.words.map((w, i) => {
          const idx = g.startIndex + i;
          const isActive = idx === active;
          const k = isActive ? prog(frame, Math.floor((w.start * fps) / 1000), Math.max(2, Math.round(fps * 0.08)), "back") : 0;
          return (
            <span
              key={w.id}
              style={{
                color: isActive ? highlight : color,
                transform: `scale(${1 + 0.12 * k})`,
                display: "inline-block",
                padding: mode === "phrase" ? `${0.08 * size}px ${0.25 * size}px` : 0,
                background: mode === "phrase" ? withAlpha("#000000", 0.55) : "transparent",
                borderRadius: 0.18 * size,
                textShadow: `0 ${4 * u}px ${14 * u}px rgba(0,0,0,0.85), 0 0 ${2 * u}px rgba(0,0,0,0.9)`,
                WebkitTextStroke: mode === "word" ? `${2.5 * u}px rgba(0,0,0,0.85)` : undefined,
                paintOrder: "stroke fill",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
