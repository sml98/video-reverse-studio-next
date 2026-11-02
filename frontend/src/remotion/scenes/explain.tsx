import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, prog } from "../core/easing";
import { fontStack, useVrs, withAlpha } from "../core/theme";
import { Icon } from "../core/icons";
import { Backdrop, Note, SceneHeader } from "./common";

type Any = Record<string, any>;

/** Linha avança; marcadores surgem em ordem; evento atual ganha destaque. */
export const TimelineScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const events: Any[] = params.events ?? [];
  const n = events.length;
  const usable = durationInFrames * 0.75;
  const per = usable / Math.max(1, n);
  const lineP = prog(frame, 8, usable, "linear");
  const v = layout.vertical;
  const x0 = layout.padX + 30 * layout.u;
  const x1 = layout.w - layout.padX - 30 * layout.u;
  const y0 = layout.padTop + 190 * layout.u;
  const y1 = layout.safeBottom - 40 * layout.u;
  const lineY = layout.padTop + (layout.safeBottom - layout.padTop) * 0.55;
  const lineX = layout.padX + 70 * layout.u;
  const pos = (i: number) => (n <= 1 ? 0.5 : i / (n - 1));
  const activeIdx = Math.min(n - 1, Math.floor((frame - 8) / per));
  return (
    <AbsoluteFill>
      <Backdrop variant="particles" seed="tl" />
      <SceneHeader title={params.title} />
      <svg width={layout.w} height={layout.h} style={{ position: "absolute" }}>
        {v ? (
          <>
            <line x1={lineX} x2={lineX} y1={y0} y2={y1} stroke={withAlpha(theme.foreground, 0.15)} strokeWidth={6 * layout.u} strokeLinecap="round" />
            <line x1={lineX} x2={lineX} y1={y0} y2={y0 + (y1 - y0) * lineP} stroke={theme.accent} strokeWidth={6 * layout.u} strokeLinecap="round" />
          </>
        ) : (
          <>
            <line x1={x0} x2={x1} y1={lineY} y2={lineY} stroke={withAlpha(theme.foreground, 0.15)} strokeWidth={6 * layout.u} strokeLinecap="round" />
            <line x1={x0} x2={x0 + (x1 - x0) * lineP} y1={lineY} y2={lineY} stroke={theme.accent} strokeWidth={6 * layout.u} strokeLinecap="round" />
          </>
        )}
      </svg>
      {events.map((e, i) => {
        const at = 8 + per * i;
        const p = pop(frame, fps, at, 11);
        const tp = prog(frame, at + 4, 14, "out");
        const isActive = i === activeIdx;
        const cx = v ? lineX : x0 + (x1 - x0) * pos(i);
        const cy = v ? y0 + (y1 - y0) * pos(i) : lineY;
        const above = i % 2 === 0;
        const dot = (isActive ? 34 : 24) * layout.u;
        const boxW = v ? layout.w - lineX - layout.padX - 50 * layout.u : Math.min(360 * layout.u, ((x1 - x0) / Math.max(1, n - 1)) * 1.1);
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: cx - dot / 2, top: cy - dot / 2, width: dot, height: dot, borderRadius: 99, background: isActive ? theme.accent : theme.background, border: `${4 * layout.u}px solid ${theme.accent}`, transform: `scale(${p})`, boxShadow: isActive ? `0 0 ${30 * layout.u}px ${withAlpha(theme.accent, 0.7)}` : undefined }} />
            <div
              style={{
                position: "absolute",
                left: v ? cx + 50 * layout.u : cx - boxW / 2,
                width: boxW,
                top: v ? cy - 40 * layout.u : above ? cy - 230 * layout.u : cy + 50 * layout.u,
                textAlign: v ? "left" : "center",
                opacity: tp * (isActive ? 1 : 0.72),
                transform: `translateY(${(1 - tp) * (above ? -1 : 1) * 24 * layout.u}px) scale(${isActive ? 1.04 : 1})`,
              }}
            >
              <div style={{ fontFamily: fontStack("display"), fontSize: 48 * layout.u, color: theme.accent, lineHeight: 1 }}>{e.year}</div>
              <div style={{ fontFamily: fontStack("sans"), fontWeight: 800, fontSize: 32 * layout.u, color: theme.foreground, marginTop: 6 * layout.u }}>{e.label}</div>
              {e.detail ? <div style={{ fontFamily: fontStack("sans"), fontSize: 24 * layout.u, color: theme.muted, marginTop: 6 * layout.u, lineHeight: 1.25 }}>{e.detail}</div> : null}
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

/** Nós aparecem, setas se desenham e partículas percorrem as ligações (causa → efeito). */
export const MechanismScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const nodes: Any[] = params.nodes ?? [];
  const edges: Any[] = params.edges ?? [];
  const n = nodes.length;
  const cycle = params.layout === "cycle";
  const top = layout.padTop + 170 * layout.u;
  const bottom = layout.safeBottom - (params.caption ? 80 : 20) * layout.u;
  const cxm = layout.w / 2;
  const cym = (top + bottom) / 2;
  const v = layout.vertical;
  const posOf = (i: number): [number, number] => {
    if (cycle) {
      const r = Math.min(layout.w - layout.padX * 2, bottom - top) * 0.36;
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return [cxm + Math.cos(a) * r, cym + Math.sin(a) * r];
    }
    if (v) return [cxm, top + ((bottom - top) * (i + 0.5)) / n];
    return [layout.padX + ((layout.w - layout.padX * 2) * (i + 0.5)) / n, cym];
  };
  const idx: Record<string, number> = Object.fromEntries(nodes.map((nd, i) => [nd.id, i]));
  const per = Math.max(10, (durationInFrames * 0.55) / Math.max(1, n + edges.length));
  const nodeAt = (i: number) => 6 + i * per;
  const size = Math.min(170 * layout.u, ((v ? bottom - top : layout.w - layout.padX * 2) / Math.max(1, n)) * 0.55);
  return (
    <AbsoluteFill>
      <Backdrop variant="grid" />
      <SceneHeader title={params.title} align="center" />
      <svg width={layout.w} height={layout.h} style={{ position: "absolute" }}>
        <defs>
          <marker id="vrs-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill={theme.accent} />
          </marker>
        </defs>
        {edges.map((e, k) => {
          const a = idx[e.from];
          const b = idx[e.to];
          if (a === undefined || b === undefined) return null;
          const [ax, ay] = posOf(a);
          const [bx, by] = posOf(b);
          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          const off = size * 0.62;
          const sx = ax + (dx / len) * off;
          const sy = ay + (dy / len) * off;
          const ex = bx - (dx / len) * off;
          const ey = by - (dy / len) * off;
          const segLen = Math.hypot(ex - sx, ey - sy);
          const at = Math.max(nodeAt(a), nodeAt(b)) + 6;
          const dp = prog(frame, at, 16, "cinematic");
          const flowing = frame > at + 16;
          return (
            <g key={k}>
              <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={theme.accent} strokeWidth={5 * layout.u} strokeDasharray={segLen} strokeDashoffset={segLen * (1 - dp)} markerEnd={dp > 0.95 ? "url(#vrs-arrow)" : undefined} strokeLinecap="round" />
              {flowing &&
                [0, 0.33, 0.66].map((o) => {
                  const t = (((frame - at) / 45 + o) % 1 + 1) % 1;
                  return <circle key={o} cx={sx + (ex - sx) * t} cy={sy + (ey - sy) * t} r={7 * layout.u} fill={theme.accent2} opacity={Math.sin(t * Math.PI)} />;
                })}
              {e.label ? (
                <text x={(sx + ex) / 2} y={(sy + ey) / 2 - 18 * layout.u} textAnchor="middle" fontSize={24 * layout.u} fill={theme.muted} fontFamily={fontStack("sans")} opacity={dp}>
                  {e.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {nodes.map((nd, i) => {
        const [x, y] = posOf(i);
        const p = pop(frame, fps, nodeAt(i), 10);
        const glow = frame > nodeAt(i) ? 0.35 + 0.15 * Math.sin((frame - nodeAt(i)) / 10) : 0;
        return (
          <div key={nd.id ?? i} style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, transform: `scale(${p})` }}>
            <div style={{ width: size, height: size, borderRadius: 999, background: withAlpha(theme.foreground, 0.07), border: `${3 * layout.u}px solid ${theme.accent}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 ${40 * layout.u}px ${withAlpha(theme.accent, glow)}` }}>
              <Icon name={nd.icon || "gear"} size={size * 0.55} color={theme.foreground} accent={theme.accent} progress={prog(frame, nodeAt(i), 20)} />
            </div>
            <div style={{ position: "absolute", left: -size * 0.6, width: size * 2.2, top: size + 10 * layout.u, textAlign: "center", fontFamily: fontStack("sans"), fontSize: 28 * layout.u, fontWeight: 800, color: theme.foreground }}>{nd.label}</div>
          </div>
        );
      })}
      <Note text={params.caption} delay={nodeAt(n)} />
    </AbsoluteFill>
  );
};

export const StepsScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const steps: Any[] = params.steps ?? [];
  const per = Math.max(12, (durationInFrames * 0.75) / Math.max(1, steps.length));
  const bar = prog(frame, 6, per * steps.length, "linear");
  const top = layout.padTop + 190 * layout.u;
  const avail = layout.safeBottom - top - 20 * layout.u;
  const rowH = Math.min(150 * layout.u, avail / Math.max(1, steps.length));
  return (
    <AbsoluteFill>
      <Backdrop variant="particles" seed="steps" />
      <SceneHeader title={params.title} />
      <div style={{ position: "absolute", left: layout.padX, right: layout.padX, top: layout.padTop + 150 * layout.u, height: 8 * layout.u, borderRadius: 9, background: withAlpha(theme.foreground, 0.1) }}>
        <div style={{ width: `${bar * 100}%`, height: "100%", borderRadius: 9, background: theme.accent }} />
      </div>
      {steps.map((s, i) => {
        const at = 6 + i * per;
        const p = prog(frame, at, 12, "out");
        const done = frame > at + per * 0.7;
        const cp = prog(frame, at + per * 0.7, 10);
        return (
          <div key={i} style={{ position: "absolute", left: layout.padX, right: layout.padX, top: top + rowH * i, height: rowH - 14 * layout.u, display: "flex", alignItems: "center", gap: 26 * layout.u, opacity: p, transform: `translateX(${(1 - p) * 60 * layout.u}px)` }}>
            <div style={{ width: 84 * layout.u, height: 84 * layout.u, flexShrink: 0, borderRadius: 999, background: done ? theme.accent : withAlpha(theme.accent, 0.15), border: `${3 * layout.u}px solid ${theme.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack("display"), fontSize: 40 * layout.u, color: done ? theme.background : theme.accent, transform: `scale(${1 + 0.1 * Math.sin(cp * Math.PI)})` }}>
              {done ? <Icon name="check" size={52 * layout.u} color={theme.background} progress={cp} /> : i + 1}
            </div>
            <div>
              <div style={{ fontFamily: fontStack("sans"), fontWeight: 800, fontSize: 38 * layout.u, color: theme.foreground }}>{s.title}</div>
              {s.detail ? <div style={{ fontFamily: fontStack("sans"), fontSize: 26 * layout.u, color: theme.muted, marginTop: 4 * layout.u }}>{s.detail}</div> : null}
            </div>
          </div>
        );
      })}
      <div style={{ display: "none" }}>{fps}</div>
    </AbsoluteFill>
  );
};

/** Mapa ESQUEMÁTICO: marcadores e rota tracejada que avança; não é geografia precisa. */
export const MapRouteScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const pts: Any[] = params.points ?? [];
  const parchment = params.mapStyle === "parchment";
  const left = layout.padX;
  const right = layout.w - layout.padX;
  const top = layout.padTop + 150 * layout.u;
  const bottom = layout.safeBottom - 60 * layout.u;
  const P = (p: Any): [number, number] => [left + (right - left) * Number(p.x), top + (bottom - top) * Number(p.y)];
  const per = (durationInFrames * 0.7) / Math.max(1, pts.length);
  const seg = pts.slice(1).map((p, i) => {
    const [ax, ay] = P(pts[i]);
    const [bx, by] = P(p);
    const mx = (ax + bx) / 2;
    const my = Math.min(ay, by) - Math.abs(bx - ax) * 0.18;
    return { d: `M${ax} ${ay} Q${mx} ${my} ${bx} ${by}`, len: Math.hypot(bx - ax, by - ay) * 1.15, at: 10 + per * i };
  });
  const cam = 1 + prog(frame, 0, durationInFrames, "linear") * 0.05;
  const bg = parchment ? "#e9d8b4" : withAlpha(theme.foreground, 0.04);
  const ink = parchment ? "#5b4325" : theme.accent;
  return (
    <AbsoluteFill>
      <Backdrop variant="none" />
      <SceneHeader title={params.title} />
      <div style={{ position: "absolute", left, top, width: right - left, height: bottom - top, borderRadius: 24 * layout.u, background: bg, overflow: "hidden", transform: `scale(${cam})`, border: `${2 * layout.u}px solid ${withAlpha(theme.foreground, 0.12)}` }}>
        <svg width={right - left} height={bottom - top} style={{ position: "absolute" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <path key={i} d={`M0 ${((i + 1) * (bottom - top)) / 6} Q ${(right - left) / 2} ${((i + 1) * (bottom - top)) / 6 + 30 * Math.sin(i)} ${right - left} ${((i + 1) * (bottom - top)) / 6}`} stroke={withAlpha(parchment ? "#5b4325" : theme.foreground, 0.08)} fill="none" strokeWidth={2} />
          ))}
          <path d={`M${(right - left) * 0.1} ${(bottom - top) * 0.3} q ${(right - left) * 0.15} -40 ${(right - left) * 0.3} 10 t ${(right - left) * 0.2} 60 t -${(right - left) * 0.25} 120 z`} fill={withAlpha(parchment ? "#5b4325" : theme.accent2, 0.08)} />
          <path d={`M${(right - left) * 0.55} ${(bottom - top) * 0.45} q ${(right - left) * 0.12} -60 ${(right - left) * 0.3} -20 t 10 140 t -${(right - left) * 0.2} 30 z`} fill={withAlpha(parchment ? "#5b4325" : theme.accent2, 0.08)} />
        </svg>
      </div>
      <svg width={layout.w} height={layout.h} style={{ position: "absolute" }}>
        {seg.map((s, i) => {
          const p = prog(frame, s.at + 8, per * 0.8, "smooth");
          return <path key={i} d={s.d} fill="none" stroke={ink} strokeWidth={5 * layout.u} strokeDasharray={`${s.len * p} ${s.len * 2}`} strokeLinecap="round" />;
        })}
      </svg>
      {pts.map((p, i) => {
        const [x, y] = P(p);
        const k = pop(frame, fps, 10 + per * i, 9);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -100%) scale(${k})`, transformOrigin: "50% 100%", textAlign: "center" }}>
            <div style={{ fontFamily: fontStack("sans"), fontWeight: 800, fontSize: 26 * layout.u, color: parchment ? "#3a2a14" : theme.foreground, background: parchment ? "#f6ead0" : withAlpha(theme.background, 0.75), padding: `${6 * layout.u}px ${14 * layout.u}px`, borderRadius: 10 * layout.u, marginBottom: 8 * layout.u, whiteSpace: "nowrap" }}>{p.label}</div>
            <svg width={40 * layout.u} height={52 * layout.u} viewBox="0 0 40 52" style={{ display: "block", margin: "0 auto" }}>
              <path d="M20 52 C20 52 0 30 0 18 A20 20 0 0 1 40 18 C40 30 20 52 20 52 Z" fill={i === pts.length - 1 ? theme.accent : theme.accent2} />
              <circle cx={20} cy={18} r={7} fill={theme.background} />
            </svg>
          </div>
        );
      })}
      <Note text={params.note} delay={20} />
    </AbsoluteFill>
  );
};
