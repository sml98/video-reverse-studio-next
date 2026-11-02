import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, prog } from "../core/easing";
import { fmtNumber, fontStack, useVrs, withAlpha } from "../core/theme";
import { Icon } from "../core/icons";
import { AssetImg, Backdrop, KineticWords, Tag } from "./common";

type Any = Record<string, any>;

export const TitleScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const style = params.style ?? "cinematic";
  const labelP = prog(frame, 0, 16, "cinematic");
  const line = prog(frame, 8, 20, "cinematic");
  const exit = prog(frame, durationInFrames - 10, 10, "in");
  const zoom = 1 + frame / durationInFrames / 25;
  const titleSize = (style === "bold" ? (layout.vertical ? 104 : 116) : layout.vertical ? 88 : 96) * layout.u;
  return (
    <AbsoluteFill>
      {params.backgroundAsset ? (
        <AbsoluteFill style={{ transform: `scale(${1.05 + frame / durationInFrames / 12})` }}>
          <AssetImg src={params.backgroundAsset} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} />
          <AbsoluteFill style={{ background: `linear-gradient(180deg, ${withAlpha(theme.background, 0.3)}, ${theme.background})` }} />
        </AbsoluteFill>
      ) : (
        <Backdrop variant={style === "minimal" ? "none" : "glow"} seed="title" />
      )}
      <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${layout.padX}px`, transform: `scale(${zoom})`, opacity: 1 - exit, paddingBottom: layout.h - layout.safeBottom }}>
        {params.label ? (
          <div style={{ fontFamily: fontStack("sans"), color: theme.accent, fontWeight: 800, letterSpacing: (8 - 5 * labelP) * layout.u, fontSize: 30 * layout.u, opacity: labelP, transform: `scale(${1.6 - 0.6 * labelP})`, transformOrigin: "left center" }}>{params.label}</div>
        ) : null}
        <div style={{ height: 5 * layout.u, width: `${line * (layout.vertical ? 50 : 30)}%`, background: theme.accent, margin: `${22 * layout.u}px 0` }} />
        <KineticWords text={params.title ?? ""} start={12} stagger={4} size={titleSize} font={style === "bold" ? "display" : theme.font} uppercase={style === "bold"} />
        {params.subtitle ? (
          <div style={{ marginTop: 26 * layout.u, fontFamily: fontStack("sans"), fontSize: 36 * layout.u, color: theme.muted, opacity: prog(frame, 30, 14), transform: `translateY(${(1 - prog(frame, 30, 14)) * 20}px)` }}>{params.subtitle}</div>
        ) : null}
      </AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, background: theme.background, opacity: 1 - pop(frame, fps, 0, 20) }} />
    </AbsoluteFill>
  );
};

const QUOTE_STYLES: Record<string, { font: string; weight: number; upper: boolean; size: number }> = {
  elegant: { font: "serif", weight: 600, upper: false, size: 1 },
  impact: { font: "display", weight: 400, upper: true, size: 1.15 },
  minimal: { font: "sans", weight: 500, upper: false, size: 0.9 },
  neon: { font: "rounded", weight: 900, upper: false, size: 1 },
};

/** Frases: grupos de palavras (por pontuação), ênfases e assinatura somente quando declarada. */
export const QuoteScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const st = QUOTE_STYLES[params.style] ?? QUOTE_STYLES.elegant;
  const text: string = params.text ?? "";
  const emphasis = String(params.emphasis ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const chunks = text.split(/(?<=[,.;:!?—])\s+/).filter(Boolean);
  const len = text.length;
  const base = (len > 160 ? 58 : len > 90 ? 72 : 92) * (layout.vertical ? 0.95 : 1) * st.size * layout.u;
  const usable = durationInFrames * 0.6;
  const per = Math.max(10, Math.floor(usable / Math.max(1, chunks.length)));
  const markP = prog(frame, 0, 18, "back");
  const showAuthor = params.authorship !== "sem_atribuicao" && params.author;
  const exit = prog(frame, durationInFrames - 12, 12, "in");
  const breathe = 1 + Math.sin(frame / 40) * 0.006;
  return (
    <AbsoluteFill>
      <Backdrop variant={params.style === "minimal" ? "none" : "particles"} seed="quote" intensity={params.style === "neon" ? 1.6 : 1} />
      <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${layout.padX * 1.2}px`, paddingBottom: layout.h - layout.safeBottom, opacity: 1 - exit, transform: `scale(${breathe})` }}>
        <div style={{ fontFamily: fontStack("serif"), color: theme.accent, fontSize: 200 * layout.u, lineHeight: 0.6, height: 90 * layout.u, opacity: 0.85 * markP, transform: `translateY(${(1 - markP) * 40}px) rotate(${(1 - markP) * -20}deg)` }}>“</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 * layout.u }}>
          {chunks.map((c, i) => (
            <KineticWords key={i} text={c} start={8 + i * per} stagger={3} size={base} font={st.font} weight={st.weight} uppercase={st.upper} emphasis={emphasis} emphasisColor={theme.accent} lineHeight={1.12} color={params.style === "neon" ? theme.foreground : undefined} />
          ))}
        </div>
        {showAuthor ? (
          <div style={{ marginTop: 36 * layout.u, display: "flex", alignItems: "center", gap: 16 * layout.u, opacity: prog(frame, 8 + chunks.length * per, 14) }}>
            <div style={{ width: 60 * layout.u * prog(frame, 8 + chunks.length * per, 18, "cinematic"), height: 3 * layout.u, background: theme.accent }} />
            <span style={{ fontFamily: fontStack("sans"), fontSize: 30 * layout.u, color: theme.muted, fontWeight: 600 }}>{params.author}</span>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const MemeScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const hit = Math.round(durationInFrames * 0.45);
  const setupP = prog(frame, 2, 12, "out");
  const punchP = pop(frame, fps, hit, 9);
  const shake = frame >= hit && frame < hit + 10 ? Math.sin(frame * 3.1) * 12 * layout.u * (1 - (frame - hit) / 10) : 0;
  const modern = params.style !== "classic";
  const box = (txt: string, p: number, big: boolean) => (
    <div style={{ fontFamily: fontStack(modern ? "rounded" : "display"), fontWeight: 900, fontSize: (big ? 78 : 60) * layout.u, color: modern ? theme.foreground : "#fff", textTransform: modern ? "none" : "uppercase", textAlign: "center", WebkitTextStroke: modern ? undefined : `${3 * layout.u}px #000`, paintOrder: "stroke fill", opacity: Math.min(1, p * 1.5), transform: `scale(${0.7 + 0.3 * p})`, lineHeight: 1.1 }}>{txt}</div>
  );
  return (
    <AbsoluteFill style={{ background: modern ? theme.background : "#111", transform: `translateX(${shake}px)` }}>
      <Backdrop variant="none" />
      <AbsoluteFill style={{ padding: `${layout.padTop}px ${layout.padX}px ${layout.h - layout.safeBottom}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center" }}>
        {box(params.setup ?? "", setupP, false)}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          {params.image ? (
            <AssetImg src={params.image} style={{ maxHeight: layout.h * 0.32, maxWidth: "70%", transform: `scale(${1 + 0.15 * punchP}) rotate(${punchP * -3}deg)` }} />
          ) : (
            <div style={{ fontSize: 180 * layout.u, transform: `scale(${0.4 + 0.8 * punchP}) rotate(${(1 - punchP) * 30}deg)` }}>{params.emoji || "😅"}</div>
          )}
        </div>
        {frame >= hit ? box(params.punchline ?? "", punchP, true) : <div style={{ fontSize: 60 * layout.u, color: theme.muted, fontFamily: fontStack("sans"), opacity: 0.5 + 0.5 * Math.sin(frame / 4) }}>…</div>}
      </AbsoluteFill>
      {frame >= hit && frame < hit + 4 ? <AbsoluteFill style={{ background: "#fff", opacity: 0.5 * (1 - (frame - hit) / 4) }} /> : null}
    </AbsoluteFill>
  );
};

export const CtaScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const benefits: string[] = params.benefits ?? [];
  const hookP = pop(frame, fps, 0, 10);
  const btnStart = 18 + benefits.length * 12;
  const btnP = pop(frame, fps, btnStart, 9);
  const pulse = frame > btnStart + 15 ? 1 + Math.sin((frame - btnStart) / 6) * 0.035 : 1;
  return (
    <AbsoluteFill>
      <Backdrop variant="glow" seed="cta" />
      <AbsoluteFill style={{ padding: `${layout.padTop}px ${layout.padX}px ${layout.h - layout.safeBottom}px`, justifyContent: "center", alignItems: layout.vertical ? "center" : "flex-start", gap: 30 * layout.u }}>
        <div style={{ fontFamily: fontStack("display"), fontSize: (layout.vertical ? 96 : 104) * layout.u, color: theme.foreground, textTransform: "uppercase", lineHeight: 1, transform: `scale(${hookP})`, transformOrigin: layout.vertical ? "center" : "left center", textAlign: layout.vertical ? "center" : "left" }}>{params.hook}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 * layout.u }}>
          {benefits.map((b, i) => {
            const p = prog(frame, 14 + i * 12, 12, "out");
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 18 * layout.u, opacity: p, transform: `translateX(${(1 - p) * -40 * layout.u}px)` }}>
                <div style={{ width: 52 * layout.u, height: 52 * layout.u, borderRadius: 999, background: withAlpha(theme.accent, 0.2), display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="check" size={34 * layout.u} color={theme.accent} progress={prog(frame, 18 + i * 12, 12)} />
                </div>
                <span style={{ fontFamily: fontStack("sans"), fontSize: 40 * layout.u, color: theme.foreground, fontWeight: 600 }}>{b}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12 * layout.u, transform: `scale(${btnP * pulse})`, padding: `${22 * layout.u}px ${54 * layout.u}px`, background: theme.accent, color: theme.background, borderRadius: 999, fontFamily: fontStack("sans"), fontWeight: 900, fontSize: 44 * layout.u, boxShadow: `0 ${10 * layout.u}px ${40 * layout.u}px ${withAlpha(theme.accent, 0.45)}` }}>{params.button}</div>
        {params.handle ? <div style={{ fontFamily: fontStack("mono"), color: theme.muted, fontSize: 28 * layout.u, opacity: prog(frame, btnStart + 10, 12) }}>{params.handle}</div> : null}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: theme.background, opacity: prog(frame, durationInFrames - 8, 8) * 0 }} />
    </AbsoluteFill>
  );
};

export const StatScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const value = Number(params.value ?? 0);
  const p = prog(frame, 6, Math.min(50, durationInFrames * 0.5), "out");
  const r = (layout.vertical ? 300 : 260) * layout.u;
  const circ = 2 * Math.PI * r;
  const ringFill = params.suffix === "%" ? Math.min(1, Math.abs(value) / 100) : 0.75;
  return (
    <AbsoluteFill>
      <Backdrop variant="grid" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: layout.h - layout.safeBottom }}>
        <div style={{ position: "relative", width: r * 2 + 40, height: r * 2 + 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={r * 2 + 40} height={r * 2 + 40} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
            <circle cx={r + 20} cy={r + 20} r={r} fill="none" stroke={withAlpha(theme.foreground, 0.1)} strokeWidth={18 * layout.u} />
            <circle cx={r + 20} cy={r + 20} r={r} fill="none" stroke={theme.accent} strokeWidth={18 * layout.u} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - ringFill * p)} />
          </svg>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: fontStack("display"), fontSize: 150 * layout.u, color: theme.foreground, lineHeight: 1 }}>
              {params.prefix}
              {fmtNumber(value * p, Number(params.decimals ?? 0))}
              {params.suffix}
            </div>
            <div style={{ fontFamily: fontStack("sans"), fontSize: 34 * layout.u, color: theme.accent, fontWeight: 700, marginTop: 10 * layout.u, maxWidth: r * 1.6 }}>{params.label}</div>
          </div>
        </div>
        {params.context ? <div style={{ marginTop: 30 * layout.u, maxWidth: layout.w - layout.padX * 2, textAlign: "center", fontFamily: fontStack("sans"), fontSize: 32 * layout.u, color: theme.muted, opacity: prog(frame, 30, 14) }}>{params.context}</div> : null}
        {params.illustrative ? <div style={{ marginTop: 16 * layout.u }}><Tag text="DADO ILUSTRATIVO" delay={20} /></div> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
