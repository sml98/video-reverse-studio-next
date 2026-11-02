import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { pop, prog, sampleKeyframes, type Kf } from "../core/easing";
import { fontStack, useVrs, withAlpha } from "../core/theme";
import { Icon } from "../core/icons";
import { AssetImg, Backdrop, KineticWords, SceneHeader } from "./common";
import type { Layer } from "../../contracts/plan";

type Any = Record<string, any>;

/** Câmera sobre imagens (Ken Burns/parallax/slide) com legenda e crédito. Não anima o conteúdo da imagem. */
export const DocMontageScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const images: Any[] = (params.images ?? []).filter((im: Any) => im.asset);
  const n = Math.max(1, images.length);
  const per = durationInFrames / n;
  const i = Math.min(n - 1, Math.floor(frame / per));
  const local = frame - i * per;
  const t = local / per;
  const im = images[i];
  const motion = params.motion ?? "kenburns";
  const fadeIn = prog(local, 0, 10);
  let transform = "";
  if (motion === "kenburns") transform = `scale(${1.08 + 0.12 * t}) translate(${(i % 2 ? -1 : 1) * 2 * t}%, ${-1.5 * t}%)`;
  else if (motion === "slide") transform = `scale(1.15) translateX(${(i % 2 ? 1 : -1) * (5 - 10 * t)}%)`;
  else transform = `scale(1.12)`;
  return (
    <AbsoluteFill style={{ background: theme.background }}>
      {im ? (
        <AbsoluteFill style={{ opacity: fadeIn }}>
          {motion === "parallax" ? (
            <>
              <AbsoluteFill style={{ transform: `scale(1.25) translateX(${-3 * t}%)`, filter: "blur(18px) brightness(0.5)" }}>
                <AssetImg src={im.asset} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </AbsoluteFill>
              <AbsoluteFill style={{ transform: `translateX(${4 - 8 * t}%) scale(${1 + 0.05 * t})`, padding: `${layout.padTop}px ${layout.padX}px ${layout.h - layout.safeBottom}px` }}>
                <AssetImg src={im.asset} style={{ width: "100%", height: "100%", objectFit: "contain", filter: `drop-shadow(0 ${20 * layout.u}px ${40 * layout.u}px rgba(0,0,0,0.6))` }} />
              </AbsoluteFill>
            </>
          ) : (
            <AbsoluteFill style={{ transform }}>
              <AssetImg src={im.asset} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </AbsoluteFill>
          )}
        </AbsoluteFill>
      ) : (
        <Backdrop variant="glow" />
      )}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${withAlpha("#000000", 0.45)} 0%, transparent 30%, transparent 55%, ${withAlpha("#000000", 0.7)} 100%)` }} />
      <SceneHeader title={params.title ?? ""} />
      {im?.caption ? (
        <div style={{ position: "absolute", left: layout.padX, right: layout.padX, top: layout.safeBottom - 110 * layout.u, opacity: prog(local, 8, 12), transform: `translateY(${(1 - prog(local, 8, 12)) * 20}px)` }}>
          <div style={{ display: "inline-block", fontFamily: fontStack("sans"), fontWeight: 700, fontSize: 34 * layout.u, color: "#fff", borderLeft: `${6 * layout.u}px solid ${theme.accent}`, paddingLeft: 18 * layout.u }}>{im.caption}</div>
        </div>
      ) : null}
      {im?.credit ? <div style={{ position: "absolute", right: layout.padX, top: layout.safeBottom - 36 * layout.u, fontFamily: fontStack("sans"), fontSize: 18 * layout.u, color: "rgba(255,255,255,0.75)" }}>{im.credit}</div> : null}
    </AbsoluteFill>
  );
};

/** Personagem recortado entra e reage (deslocamento/pose), objetos e balão digitado. Não é ciclo de caminhada. */
export const StoryPanelScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const leftSide = params.characterSide !== "right";
  const enter = prog(frame, 0, 18, "out");
  const action = params.action ?? "enter";
  let cx = (leftSide ? -1 : 1) * (1 - enter) * layout.w * 0.5;
  let cy = 0;
  let rot = 0;
  let sc = 1;
  const t = Math.max(0, frame - 18);
  if (action === "bounce") cy = -Math.abs(Math.sin(t / 7)) * 30 * layout.u;
  if (action === "nod") rot = Math.sin(t / 6) * 4;
  if (action === "shake") cx += Math.sin(t / 2) * 6 * layout.u * (t < 30 ? 1 : 0);
  if (action === "jump") {
    const ph = (t % 40) / 40;
    cy = -Math.sin(Math.min(1, ph * 2) * Math.PI) * 90 * layout.u * (ph < 0.5 ? 1 : 0);
    sc = ph > 0.5 && ph < 0.6 ? 1.04 : 1;
  }
  const charH = layout.h * (layout.vertical ? 0.42 : 0.62);
  const groundY = layout.safeBottom;
  const bubble: string = params.bubble ?? "";
  const typeStart = 22;
  const chars = Math.floor(Math.max(0, frame - typeStart) * 1.4);
  const bubbleP = pop(frame, fps, typeStart - 4, 12);
  const props: Any[] = params.props ?? [];
  return (
    <AbsoluteFill>
      {params.background ? (
        <AbsoluteFill style={{ transform: `scale(${1.04 + (frame / durationInFrames) * 0.04})` }}>
          <AssetImg src={params.background} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${withAlpha(theme.accent2, 0.25)} 0%, ${theme.background} 70%)` }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: groundY, bottom: 0, background: withAlpha(theme.foreground, 0.08) }} />
        </AbsoluteFill>
      )}
      {props.map((p, i) => {
        const k = pop(frame, fps, 10 + i * 6, 10);
        const fl = Math.sin((frame + i * 20) / 18) * 6 * layout.u;
        const size = 220 * layout.u * Number(p.scale ?? 1);
        return p.asset ? (
          <div key={i} style={{ position: "absolute", left: layout.w * Number(p.x) - size / 2, top: layout.h * Number(p.y) - size + fl, width: size, height: size, transform: `scale(${k})`, transformOrigin: "50% 100%" }}>
            <AssetImg src={p.asset} style={{ width: "100%", height: "100%" }} />
          </div>
        ) : null;
      })}
      {params.character ? (
        <div style={{ position: "absolute", [leftSide ? "left" : "right"]: layout.padX, top: groundY - charH, height: charH, width: charH * 0.75, transform: `translate(${cx}px, ${cy}px) rotate(${rot}deg) scale(${sc})`, transformOrigin: "50% 100%" }}>
          <AssetImg src={params.character} style={{ width: "100%", height: "100%", objectPosition: "bottom" }} />
        </div>
      ) : null}
      {bubble ? (
        <div style={{ position: "absolute", [leftSide ? "left" : "right"]: layout.padX + charH * 0.6, top: groundY - charH - 20 * layout.u, maxWidth: layout.w * (layout.vertical ? 0.6 : 0.42), transform: `scale(${bubbleP})`, transformOrigin: leftSide ? "0% 100%" : "100% 100%", background: "#fff", color: "#111", borderRadius: 28 * layout.u, padding: `${22 * layout.u}px ${30 * layout.u}px`, fontFamily: fontStack("rounded"), fontWeight: 800, fontSize: 38 * layout.u, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
          {bubble.slice(0, chars)}
          <span style={{ opacity: chars < bubble.length ? 1 : 0 }}>▍</span>
        </div>
      ) : null}
      {params.caption ? (
        <div style={{ position: "absolute", left: layout.padX, right: layout.padX, top: layout.padTop }}>
          <KineticWords text={params.caption} size={44 * layout.u} start={6} stagger={2} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Objetos da biblioteca (ou ícones) entram com mola, flutuam e recebem rótulos. */
export const ObjectStageScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();
  const objs: Any[] = params.objects ?? [];
  const n = Math.max(1, objs.length);
  const per = Math.max(8, (durationInFrames * 0.6) / n);
  const top = layout.padTop + (params.title ? 170 : 40) * layout.u;
  const bottom = layout.safeBottom - 60 * layout.u;
  const v = layout.vertical;
  const cols = v ? Math.min(2, n) : n;
  const rows = Math.ceil(n / cols);
  const cellW = (layout.w - layout.padX * 2) / cols;
  const cellH = (bottom - top) / rows;
  const size = Math.min(cellW * 0.7, cellH * 0.62, 300 * layout.u);
  return (
    <AbsoluteFill>
      <Backdrop variant="glow" seed="stage" />
      <SceneHeader title={params.title ?? ""} align="center" />
      {objs.map((o, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        let x = layout.padX + cellW * (c + 0.5);
        let y = top + cellH * (r + 0.5);
        if (params.layout === "arc" && !v) y += Math.sin((i / Math.max(1, n - 1)) * Math.PI) * -cellH * 0.12;
        if (params.layout === "scatter") {
          x += ((i * 37) % 11 - 5) * 8 * layout.u;
          y += ((i * 53) % 9 - 4) * 10 * layout.u;
        }
        const at = 6 + i * per;
        const k = pop(frame, fps, at, 9);
        const fl = frame > at ? Math.sin((frame - at) / 16 + i) * 8 * layout.u : 0;
        const lp = prog(frame, at + 8, 10);
        return (
          <div key={i} style={{ position: "absolute", left: x - size / 2, top: y - size / 2 + fl, width: size, height: size, transform: `scale(${k}) rotate(${(1 - k) * -25}deg)` }}>
            <div style={{ position: "absolute", left: "10%", right: "10%", bottom: -12 * layout.u, height: 18 * layout.u, borderRadius: 99, background: "rgba(0,0,0,0.35)", filter: "blur(6px)" }} />
            {o.asset ? <AssetImg src={o.asset} style={{ width: "100%", height: "100%" }} /> : <Icon name={o.icon || "star"} size={size} color={theme.foreground} accent={theme.accent} />}
            {o.label ? <div style={{ position: "absolute", left: -size * 0.3, width: size * 1.6, top: size + 16 * layout.u, textAlign: "center", fontFamily: fontStack("sans"), fontWeight: 800, fontSize: 30 * layout.u, color: theme.foreground, opacity: lp, transform: `translateY(${(1 - lp) * 10}px)` }}>{o.label}</div> : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Cena programada: camadas com hierarquia, pivôs e keyframes (FilmPlan.layers). */
export const CustomLayersScene: React.FC<{ params: Any; layers: Layer[] }> = ({ params, layers }) => {
  const frame = useCurrentFrame();
  const { theme, layout } = useVrs();
  const children = (parent: string | null) => layers.filter((l) => (l.parent ?? null) === parent);
  const render = (l: Layer): React.ReactNode => {
    const a = l.animations as Record<string, Kf[] | undefined>;
    const x = sampleKeyframes(a.x, frame, l.x) * layout.u;
    const y = sampleKeyframes(a.y, frame, l.y) * layout.u;
    const s = sampleKeyframes(a.scale, frame, 1);
    const sx = sampleKeyframes(a.scaleX, frame, 1) * s;
    const sy = sampleKeyframes(a.scaleY, frame, 1) * s;
    const rot = sampleKeyframes(a.rotate, frame, 0);
    const op = sampleKeyframes(a.opacity, frame, 1);
    const pr = sampleKeyframes(a.progress, frame, 1);
    const bl = sampleKeyframes(a.blur, frame, 0);
    const w = l.w * layout.u;
    const h = l.h * layout.u;
    let el: React.ReactNode = null;
    if (l.type === "text") el = <div style={{ fontFamily: fontStack(theme.font), fontSize: l.fontSize * layout.u, fontWeight: l.fontWeight, color: l.fill, width: w, lineHeight: 1.1 }}>{l.text.slice(0, Math.ceil(l.text.length * pr))}</div>;
    else if (l.type === "image") el = <AssetImg src={l.src} style={{ width: w, height: h }} />;
    else if (l.type === "rect") el = <div style={{ width: w, height: h, background: l.fill, borderRadius: l.radius * layout.u, border: l.stroke ? `${l.strokeWidth * layout.u}px solid ${l.stroke}` : undefined }} />;
    else if (l.type === "circle") el = <div style={{ width: w, height: h, background: l.fill, borderRadius: 9999, border: l.stroke ? `${l.strokeWidth * layout.u}px solid ${l.stroke}` : undefined }} />;
    else if (l.type === "path" || l.type === "arrow")
      el = (
        <svg width={w} height={h} viewBox={`0 0 ${l.w} ${l.h}`} style={{ overflow: "visible" }}>
          <path d={l.d} pathLength={1} fill={l.type === "path" && !l.stroke ? l.fill : "none"} stroke={l.stroke || l.fill} strokeWidth={l.strokeWidth || 4} strokeDasharray={1} strokeDashoffset={1 - pr} strokeLinecap="round" markerEnd={l.type === "arrow" ? "url(#vrs-custom-arrow)" : undefined} />
        </svg>
      );
    return (
      <div key={l.id} style={{ position: "absolute", left: x, top: y, width: w, height: h, transformOrigin: `${l.pivotX * 100}% ${l.pivotY * 100}%`, transform: `scale(${sx}, ${sy}) rotate(${rot}deg)`, opacity: op, filter: bl ? `blur(${bl}px)` : undefined }}>
        {el}
        {children(l.id).map(render)}
      </div>
    );
  };
  return (
    <AbsoluteFill>
      <Backdrop variant="none" />
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          <marker id="vrs-custom-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill={theme.accent} />
          </marker>
        </defs>
      </svg>
      <SceneHeader title={params.title ?? ""} />
      {children(null).map(render)}
    </AbsoluteFill>
  );
};
