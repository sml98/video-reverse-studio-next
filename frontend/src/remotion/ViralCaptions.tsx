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
  stylePreset?: "hormozi" | "karaoke" | "cinema" | "comic";
  /** Precisão declarada dos tempos (exibida apenas em metadados, nunca inventada). */
  precision?: string;
};

/**
 * Legendas com grupos de 2–4 palavras e 4 estilos visuais:
 * - hormozi: impacto em caixa alta com contorno pesado e pop na sílaba
 * - karaoke: pílula luminosa preenchendo a palavra ativa
 * - cinema: faixa translúcida editorial com tipografia limpa
 * - comic: caixa estilo quadrinhos / recorte de papel com borda preta
 */
export const ViralCaptions: React.FC<ViralCaptionsProps> = ({
  words,
  mode,
  maxWords = 3,
  position = "bottom",
  highlight = "#ffd23f",
  color = "#ffffff",
  font = "display",
  stylePreset = "hormozi",
}) => {
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
  const size = (mode === "phrase" || stylePreset === "cinema" ? 46 : vertical ? 74 : 62) * u;
  const enterFrame = Math.floor((g.start * fps) / 1000);
  const t = prog(frame, enterFrame, Math.max(3, Math.round(fps * 0.18)), "back");
  const top = position === "top" ? height * 0.1 : position === "center" ? height * 0.45 : vertical ? height * 0.74 : height * 0.82;

  const isComic = stylePreset === "comic";
  const isCinema = stylePreset === "cinema";
  const isKaraoke = stylePreset === "karaoke";

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: width * 0.08,
          right: width * 0.08,
          top,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: `${0.12 * size}px ${0.26 * size}px`,
            transform: `translateY(${(1 - t) * 22 * u}px) scale(${0.92 + 0.08 * t})`,
            opacity: Math.min(1, t * 1.4),
            fontFamily: fontStack(isComic ? "rounded" : isCinema ? "sans" : font),
            fontSize: size,
            lineHeight: 1.12,
            fontWeight: isCinema ? 700 : 900,
            textTransform: mode === "word" && !isCinema ? "uppercase" : "none",
            letterSpacing: mode === "word" && !isCinema ? 0.5 * u : 0,
            textAlign: "center",
            padding: isComic || isCinema ? `${12 * u}px ${26 * u}px` : 0,
            background: isComic ? "#ffffff" : isCinema ? "rgba(8, 12, 24, 0.78)" : "transparent",
            borderRadius: isComic ? 20 * u : isCinema ? 14 * u : 0,
            border: isComic ? `${4 * u}px solid #0f172a` : isCinema ? `1px solid rgba(255,255,255,0.16)` : undefined,
            boxShadow: isComic ? `${6 * u}px ${7 * u}px 0px rgba(0,0,0,0.45)` : isCinema ? "0 12px 30px rgba(0,0,0,0.55)" : undefined,
          }}
        >
          {g.words.map((w, i) => {
            const idx = g.startIndex + i;
            const isActive = idx === active;
            const k = isActive ? prog(frame, Math.floor((w.start * fps) / 1000), Math.max(2, Math.round(fps * 0.08)), "back") : 0;
            const wordColor = isComic
              ? isActive
                ? "#dc2626"
                : "#0f172a"
              : isKaraoke && isActive
                ? "#0b1020"
                : isActive
                  ? highlight
                  : color;
            return (
              <span
                key={w.id}
                style={{
                  color: wordColor,
                  transform: `scale(${1 + (isCinema ? 0.05 : 0.12) * k})`,
                  display: "inline-block",
                  padding: isKaraoke && isActive ? `${0.06 * size}px ${0.2 * size}px` : mode === "phrase" && !isCinema && !isComic ? `${0.08 * size}px ${0.25 * size}px` : 0,
                  background: isKaraoke && isActive ? highlight : mode === "phrase" && !isCinema && !isComic ? withAlpha("#000000", 0.55) : "transparent",
                  borderRadius: 0.18 * size,
                  textShadow: isComic || (isKaraoke && isActive) ? "none" : `0 ${4 * u}px ${14 * u}px rgba(0,0,0,0.85), 0 0 ${2 * u}px rgba(0,0,0,0.9)`,
                  WebkitTextStroke: mode === "word" && stylePreset === "hormozi" ? `${2.5 * u}px rgba(0,0,0,0.85)` : undefined,
                  paintOrder: "stroke fill",
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
