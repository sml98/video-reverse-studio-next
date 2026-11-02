import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, prog } from "../core/easing";
import { fmtNumber, fontStack, useVrs, withAlpha } from "../core/theme";
import { Icon } from "../core/icons";
import { Backdrop, Note, SceneHeader, Tag } from "./common";

type Any = Record<string, any>;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Barras crescem com contador; destaque pulsa; eixo e grade se constroem. */
export const BarChartScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const bars: Any[] = params.bars ?? [];
  const values = bars.map((b) => Number(b.value) || 0);
  const max = niceMax(Math.max(...values.map(Math.abs), 1));
  const left = layout.padX + 40 * layout.u;
  const right = layout.w - layout.padX;
  const top = layout.padTop + 170 * layout.u;
  const bottom = layout.safeBottom - 90 * layout.u;
  const chartH = bottom - top;
  const axis = prog(frame, 6, 16, "cinematic");
  const slot = (right - left) / Math.max(1, bars.length);
  const bw = Math.min(slot * 0.62, 220 * layout.u);
  const growDur = Math.max(18, Math.min(40, durationInFrames * 0.25));
  return (
    <AbsoluteFill>
      <Backdrop variant="grid" />
      <SceneHeader title={params.title} />
      <svg width={layout.w} height={layout.h} style={{ position: "absolute" }}>
        {[0.25, 0.5, 0.75, 1].map((g, i) => (
          <g key={g} opacity={prog(frame, 10 + i * 3, 10)}>
            <line x1={left} x2={left + (right - left) * axis} y1={bottom - chartH * g} y2={bottom - chartH * g} stroke={withAlpha(theme.foreground, 0.12)} strokeWidth={1.5} strokeDasharray="6 8" />
            <text x={left - 12 * layout.u} y={bottom - chartH * g + 8 * layout.u} textAnchor="end" fontSize={20 * layout.u} fill={theme.muted} fontFamily={fontStack("sans")}>
              {fmtNumber(max * g)}
            </text>
          </g>
        ))}
        <line x1={left} x2={left + (right - left) * axis} y1={bottom} y2={bottom} stroke={theme.foreground} strokeWidth={3 * layout.u} />
      </svg>
      {bars.map((b, i) => {
        const v = values[i];
        const start = 16 + i * 7;
        const g = prog(frame, start, growDur, "out");
        const h = (Math.abs(v) / max) * chartH * g;
        const x = left + slot * i + (slot - bw) / 2;
        const hl = !!b.highlight;
        const pulse = hl && frame > start + growDur ? 1 + Math.sin((frame - start) / 7) * 0.02 : 1;
        return (
          <div key={i}>
            <div style={{ position: "absolute", left: x, width: bw, top: bottom - h, height: h, borderRadius: `${12 * layout.u}px ${12 * layout.u}px 0 0`, background: hl ? theme.accent : withAlpha(theme.accent2, 0.75), transform: `scaleX(${pulse})`, boxShadow: hl ? `0 0 ${40 * layout.u}px ${withAlpha(theme.accent, 0.5)}` : undefined }} />
            <div style={{ position: "absolute", left: x - 20, width: bw + 40, top: bottom - h - 52 * layout.u, textAlign: "center", fontFamily: fontStack("sans"), fontWeight: 800, fontSize: 32 * layout.u, color: hl ? theme.accent : theme.foreground, opacity: g }}>
              {fmtNumber(v * g, Number.isInteger(v) ? 0 : 1)}
              {params.unit ? ` ${params.unit}` : ""}
            </div>
            <div style={{ position: "absolute", left: x - 30, width: bw + 60, top: bottom + 14 * layout.u, textAlign: "center", fontFamily: fontStack("sans"), fontSize: 26 * layout.u, color: theme.foreground, opacity: prog(frame, start, 10), fontWeight: 600 }}>{b.label}</div>
          </div>
        );
      })}
      <Note text={params.note} delay={30} />
      {params.illustrative ? (
        <div style={{ position: "absolute", right: layout.padX, top: layout.padTop + 6 * layout.u }}>
          <Tag text="DADOS ILUSTRATIVOS" delay={24} />
        </div>
      ) : null}
      <div style={{ display: "none" }}>{fps}</div>
    </AbsoluteFill>
  );
};

/** Linha se desenha ponto a ponto, área preenche e anotação aponta o ponto-chave. */
export const LineChartScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const pts: Any[] = params.points ?? [];
  const vals = pts.map((p) => Number(p.value) || 0);
  const minV = Math.min(0, ...vals);
  const maxV = niceMax(Math.max(...vals, 1));
  const left = layout.padX + 60 * layout.u;
  const right = layout.w - layout.padX - 20 * layout.u;
  const top = layout.padTop + 170 * layout.u;
  const bottom = layout.safeBottom - 80 * layout.u;
  const X = (i: number) => left + ((right - left) * i) / Math.max(1, pts.length - 1);
  const Y = (v: number) => bottom - ((v - minV) / (maxV - minV || 1)) * (bottom - top);
  const drawDur = Math.max(30, Math.min(durationInFrames * 0.55, 90));
  const p = prog(frame, 12, drawDur, "smooth");
  const upto = p * (pts.length - 1);
  const shown: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i <= upto) shown.push([X(i), Y(vals[i])]);
    else {
      const k = upto - Math.floor(upto);
      const a = Math.floor(upto);
      if (a + 1 < pts.length) shown.push([X(a) + (X(a + 1) - X(a)) * k, Y(vals[a]) + (Y(vals[a + 1]) - Y(vals[a])) * k]);
      break;
    }
  }
  const d = shown.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = shown.length > 1 ? `${d} L${shown[shown.length - 1][0]} ${bottom} L${shown[0][0]} ${bottom} Z` : "";
  const ai = Number(params.annotationIndex ?? -1);
  const annStart = 12 + drawDur * (ai / Math.max(1, pts.length - 1)) + 6;
  const annP = ai >= 0 && ai < pts.length ? pop(frame, fps, annStart, 12) : 0;
  const labelEvery = Math.ceil(pts.length / (layout.vertical ? 5 : 10));
  return (
    <AbsoluteFill>
      <Backdrop variant="grid" />
      <SceneHeader title={params.title} />
      <svg width={layout.w} height={layout.h} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="vrs-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={theme.accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={theme.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line x1={left} x2={right} y1={bottom} y2={bottom} stroke={theme.foreground} strokeWidth={3 * layout.u} opacity={prog(frame, 0, 10)} />
        <line x1={left} x2={left} y1={top} y2={bottom} stroke={withAlpha(theme.foreground, 0.4)} strokeWidth={2 * layout.u} opacity={prog(frame, 0, 10)} />
        {[0.5, 1].map((g) => (
          <text key={g} x={left - 12 * layout.u} y={Y(minV + (maxV - minV) * g) + 8} textAnchor="end" fontSize={20 * layout.u} fill={theme.muted} fontFamily={fontStack("sans")}>
            {fmtNumber(minV + (maxV - minV) * g)}
          </text>
        ))}
        {area && <path d={area} fill="url(#vrs-area)" />}
        <path d={d} fill="none" stroke={theme.accent} strokeWidth={6 * layout.u} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((pt, i) =>
          i <= upto ? (
            <g key={i}>
              <circle cx={X(i)} cy={Y(vals[i])} r={8 * layout.u * pop(frame, fps, 12 + (drawDur * i) / Math.max(1, pts.length - 1), 10)} fill={theme.background} stroke={theme.accent} strokeWidth={4 * layout.u} />
              {i % labelEvery === 0 || i === pts.length - 1 ? (
                <text x={X(i)} y={bottom + 34 * layout.u} textAnchor="middle" fontSize={22 * layout.u} fill={theme.foreground} fontFamily={fontStack("sans")}>
                  {pt.label}
                </text>
              ) : null}
            </g>
          ) : null,
        )}
        {annP > 0 ? (
          <g transform={`translate(${X(ai)}, ${Y(vals[ai])}) scale(${annP})`}>
            <line x1={0} y1={-14 * layout.u} x2={0} y2={-70 * layout.u} stroke={theme.accent2} strokeWidth={3 * layout.u} />
            <circle r={16 * layout.u} fill="none" stroke={theme.accent2} strokeWidth={4 * layout.u} />
          </g>
        ) : null}
      </svg>
      {annP > 0 && params.annotationText ? (
        <div style={{ position: "absolute", left: Math.min(Math.max(X(ai) - 200 * layout.u, layout.padX), layout.w - layout.padX - 400 * layout.u), width: 400 * layout.u, top: Y(vals[ai]) - 130 * layout.u, textAlign: "center", fontFamily: fontStack("sans"), fontWeight: 800, fontSize: 28 * layout.u, color: theme.accent2, opacity: annP }}>
          {params.annotationText}
        </div>
      ) : null}
      {params.illustrative ? (
        <div style={{ position: "absolute", right: layout.padX, top: layout.padTop + 6 * layout.u }}>
          <Tag text="DADOS ILUSTRATIVOS" delay={24} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const CalcScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const steps: Any[] = params.steps ?? [];
  const per = Math.max(16, Math.floor((durationInFrames * 0.7) / Math.max(1, steps.length + 1)));
  const rowH = (layout.vertical ? 150 : 110) * layout.u;
  return (
    <AbsoluteFill>
      <Backdrop variant="grid" />
      <SceneHeader title={params.title} />
      <div style={{ position: "absolute", left: layout.padX, right: layout.padX, top: layout.padTop + 170 * layout.u, display: "flex", flexDirection: "column", gap: 18 * layout.u }}>
        {steps.map((s, i) => {
          const st = 10 + i * per;
          const p = prog(frame, st, 12, "out");
          const c = prog(frame, st + 6, Math.min(per, 30), "out");
          const value = Number(s.result) || 0;
          return (
            <div key={i} style={{ minHeight: rowH, display: "flex", flexDirection: layout.vertical ? "column" : "row", alignItems: layout.vertical ? "flex-start" : "center", justifyContent: "space-between", gap: 10 * layout.u, padding: `${16 * layout.u}px ${28 * layout.u}px`, borderRadius: 18 * layout.u, background: withAlpha(theme.foreground, 0.06), borderLeft: `${6 * layout.u}px solid ${i === steps.length - 1 ? theme.accent : theme.accent2}`, opacity: p, transform: `translateY(${(1 - p) * 30 * layout.u}px)` }}>
              <div>
                <div style={{ fontFamily: fontStack("sans"), fontSize: 30 * layout.u, color: theme.foreground, fontWeight: 700 }}>{s.label}</div>
                {s.expression ? <div style={{ fontFamily: fontStack("mono"), fontSize: 26 * layout.u, color: theme.muted, marginTop: 6 * layout.u }}>{s.expression}</div> : null}
              </div>
              <div style={{ fontFamily: fontStack("display"), fontSize: 58 * layout.u, color: i === steps.length - 1 ? theme.accent : theme.foreground }}>
                {s.prefix}
                {fmtNumber(value * c, Number(s.decimals ?? 0))}
                {s.suffix}
              </div>
            </div>
          );
        })}
      </div>
      {params.conclusion ? (
        <div style={{ position: "absolute", left: layout.padX, right: layout.padX, top: layout.safeBottom - 90 * layout.u, fontFamily: fontStack("sans"), fontWeight: 800, fontSize: 36 * layout.u, color: theme.accent, opacity: prog(frame, 10 + steps.length * per, 14) }}>{params.conclusion}</div>
      ) : null}
      {params.illustrative ? (
        <div style={{ position: "absolute", right: layout.padX, top: layout.padTop + 6 * layout.u }}>
          <Tag text="EXEMPLO ILUSTRATIVO" delay={20} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const ComparisonScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const L: string[] = params.leftItems ?? [];
  const R: string[] = params.rightItems ?? [];
  const n = Math.max(L.length, R.length);
  const per = Math.max(8, Math.floor((durationInFrames * 0.5) / Math.max(1, n * 2)));
  const colP = prog(frame, 4, 16, "cinematic");
  const vs = pop(frame, fps, 12, 8);
  const verdictAt = 20 + n * 2 * per;
  const col = (title: string, items: string[], side: 0 | 1) => (
    <div style={{ flex: 1, padding: 28 * layout.u, borderRadius: 24 * layout.u, background: withAlpha(side ? theme.accent : theme.accent2, 0.1), border: `${2 * layout.u}px solid ${withAlpha(side ? theme.accent : theme.accent2, 0.6)}`, transform: `translate${layout.vertical ? "Y" : "X"}(${(1 - colP) * (side ? 1 : -1) * 120 * layout.u}px)`, opacity: colP }}>
      <div style={{ fontFamily: fontStack("display"), fontSize: 50 * layout.u, color: side ? theme.accent : theme.accent2, textTransform: "uppercase", marginBottom: 18 * layout.u }}>{title}</div>
      {items.map((it, i) => {
        const p = prog(frame, 18 + (i * 2 + side) * per, 10, "out");
        return (
          <div key={i} style={{ display: "flex", gap: 12 * layout.u, alignItems: "center", fontFamily: fontStack("sans"), fontSize: 32 * layout.u, color: theme.foreground, margin: `${12 * layout.u}px 0`, opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
            <div style={{ width: 14 * layout.u, height: 14 * layout.u, borderRadius: 99, background: side ? theme.accent : theme.accent2, flexShrink: 0 }} />
            {it}
          </div>
        );
      })}
    </div>
  );
  return (
    <AbsoluteFill>
      <Backdrop variant="particles" seed="cmp" />
      <SceneHeader title={params.title} align="center" />
      <div style={{ position: "absolute", left: layout.padX, right: layout.padX, top: layout.padTop + 170 * layout.u, bottom: layout.h - layout.safeBottom + 90 * layout.u, display: "flex", flexDirection: layout.vertical ? "column" : "row", gap: 60 * layout.u, alignItems: "stretch" }}>
        {col(params.leftTitle, L, 0)}
        {col(params.rightTitle, R, 1)}
      </div>
      <div style={{ position: "absolute", left: "50%", top: layout.vertical ? (layout.padTop + 170 * layout.u + layout.safeBottom - 90 * layout.u) / 2 : layout.h * 0.48, transform: `translate(-50%, -50%) scale(${vs}) rotate(${(1 - vs) * 90}deg)`, width: 110 * layout.u, height: 110 * layout.u, borderRadius: 999, background: theme.foreground, color: theme.background, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack("display"), fontSize: 44 * layout.u }}>VS</div>
      {params.verdict ? <div style={{ position: "absolute", left: layout.padX, right: layout.padX, top: layout.safeBottom - 70 * layout.u, textAlign: "center", fontFamily: fontStack("sans"), fontWeight: 800, fontSize: 34 * layout.u, color: theme.foreground, opacity: prog(frame, verdictAt, 14) }}>{params.verdict}</div> : null}
    </AbsoluteFill>
  );
};

export { Icon };
