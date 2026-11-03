import React, { useEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { pop, prog } from "../core/easing";
import { fontStack, useVrs, withAlpha, type WordTiming } from "../core/theme";
import { AssetImg, SceneHeader, Tag } from "./common";

type Any = Record<string, any>;

export type Viseme = "closed" | "A" | "O" | "E" | "M" | "smile";

/** Extrai o visema labial e estado de fala em tempo real a partir das WordAnchors (ou cadência de fallback). */
export function computeSpeechState(
  frame: number,
  fps: number,
  words: WordTiming[] | undefined,
  fallbackText: string,
  steppedFps = 0,
): { talking: boolean; viseme: Viseme; syllablePulse: number; wordIndex: number; activeWord: string } {
  const effFrame = steppedFps > 0 ? Math.floor(frame / Math.max(1, Math.round(fps / steppedFps))) * Math.max(1, Math.round(fps / steppedFps)) : frame;
  const ms = (effFrame / fps) * 1000;

  if (words && words.length > 0) {
    const idx = words.findIndex((w) => ms >= w.start - 30 && ms <= w.end + 40);
    if (idx >= 0) {
      const w = words[idx];
      const dur = Math.max(80, w.end - w.start);
      const local = Math.max(0, Math.min(1, (ms - w.start) / dur));
      const clean = (w.word || "").toLowerCase();
      const subOsc = Math.sin(local * Math.PI * Math.max(1, Math.min(3, Math.ceil(clean.length / 3))));
      if (subOsc < -0.55) {
        return { talking: true, viseme: "M", syllablePulse: 0.2, wordIndex: idx, activeWord: w.word };
      }
      let v: Viseme = "A";
      if (/[oóôõuú]/.test(clean)) v = local < 0.55 ? "O" : "A";
      else if (/[eéêií]/.test(clean)) v = local < 0.55 ? "E" : "A";
      else if (/^[mpb]/.test(clean) && local < 0.25) v = "M";
      return {
        talking: true,
        viseme: v,
        syllablePulse: Math.max(0, Math.sin(local * Math.PI)),
        wordIndex: idx,
        activeWord: w.word,
      };
    }
    return { talking: false, viseme: "closed", syllablePulse: 0, wordIndex: -1, activeWord: "" };
  }

  // Fallback quando a cena está sem TTS (ex.: preview mudo mas com texto/fala configurado)
  if (fallbackText && fallbackText.trim().length > 0 && effFrame > 12) {
    const cyc = Math.floor(effFrame / 4);
    const talking = cyc % 7 !== 0;
    const pool: Viseme[] = ["A", "O", "E", "M", "A", "E"];
    return {
      talking,
      viseme: talking ? pool[cyc % pool.length] : "closed",
      syllablePulse: talking ? Math.abs(Math.sin(effFrame * 0.45)) : 0,
      wordIndex: Math.floor(cyc / 2),
      activeWord: "",
    };
  }

  return { talking: false, viseme: "closed", syllablePulse: 0, wordIndex: -1, activeWord: "" };
}

/** Diretor de câmera 2D/2.5D: alterna entre Plano Geral (establishing shot) e Close-up no personagem/quadro ativo. */
export function computeCameraTransform(
  frame: number,
  fps: number,
  durationInFrames: number,
  cameraMode: string,
  isDuet: boolean,
  leftSpeakerActive: boolean,
  hasBoard = false,
): string {
  if (cameraMode === "wide") return "scale(1)";
  const sec = frame / fps;
  const totalSec = durationInFrames / fps;
  if (cameraMode === "closeup") {
    const tx = isDuet ? (leftSpeakerActive ? 12 : -12) : hasBoard ? -8 : 0;
    return `scale(1.18) translate(${tx}%, -3%)`;
  }
  // auto_cut: Plano geral nos primeiros 1.2s e últimos 0.8s; cortes cinematográficos no meio
  if (sec < 1.15 || sec > totalSec - 0.8) {
    return "scale(1)";
  }
  const beat = Math.floor((sec - 1.15) / 1.9);
  if (isDuet) {
    if (beat % 3 === 2) return "scale(1.04)";
    const tx = leftSpeakerActive ? 13 : -13;
    return `scale(1.2) translate(${tx}%, -4%)`;
  }
  if (hasBoard) {
    if (beat % 2 === 1) return "scale(1.16) translate(-10%, -2%)"; // Foco no quadro branco
    return "scale(1.14) translate(10%, -3%)"; // Foco no apresentador
  }
  return beat % 2 === 0 ? "scale(1.15) translate(0%, -4%)" : "scale(1.03)";
}

// ============================================================================
// MOTOR 1: vrs-stickman-stage (Bonequinho Palito Articulado 2D + Quadro/Cenário)
// ============================================================================

const StickFigureSVG: React.FC<{
  frame: number;
  fps: number;
  action: string;
  expression: string;
  accessory: string;
  viseme: Viseme;
  talking: boolean;
  syllablePulse: number;
  strokeColor: string;
  accentColor: string;
  flip?: boolean;
  scale?: number;
}> = ({ frame, fps, action, expression, accessory, viseme, talking, syllablePulse, strokeColor, accentColor, flip = false, scale = 1 }) => {
  const t = frame / fps;
  const blink = frame % 85 >= 81;

  // Cinemática de juntas em coordenadas locais (viewBox 0..260 x 0..420)
  const walkPhase = t * 7.5;
  const isWalk = action === "walk_talk";
  const isPoint = action === "explain_board";
  const isDesk = action === "desk_podcast";
  const isPanic = action === "shrug_panic";

  const bodyBob = isWalk ? Math.abs(Math.sin(walkPhase)) * -10 : talking ? syllablePulse * -4 : Math.sin(t * 2.5) * 2;
  const headTilt = talking ? Math.sin(t * 14) * 5 : Math.sin(t * 2) * 2;

  const neck = { x: 130, y: 128 + bodyBob };
  const hip = { x: 130, y: (isDesk ? 245 : 255) + bodyBob };

  // Braço esquerdo e direito (ombro -> cotovelo -> mão)
  let elbowL = { x: 96, y: 185 + bodyBob };
  let handL = { x: 84, y: 238 + bodyBob };
  let elbowR = { x: 164, y: 185 + bodyBob };
  let handR = { x: 178, y: 238 + bodyBob };

  if (isPoint) {
    elbowR = { x: 178, y: 156 + bodyBob };
    handR = { x: 232, y: 122 + Math.sin(t * 6) * 10 + bodyBob };
    elbowL = { x: 95, y: 185 + bodyBob };
    handL = { x: 105, y: 225 + (talking ? Math.sin(t * 10) * 8 : 0) + bodyBob };
  } else if (isWalk) {
    const sw = Math.sin(walkPhase) * 32;
    elbowL = { x: 130 - sw * 0.6, y: 182 + bodyBob };
    handL = { x: 130 - sw * 1.2, y: 228 + bodyBob };
    elbowR = { x: 130 + sw * 0.6, y: 182 + bodyBob };
    handR = { x: 130 + sw * 1.2, y: 228 + bodyBob };
  } else if (isDesk) {
    elbowL = { x: 92, y: 205 + bodyBob };
    handL = { x: 108, y: 226 + (talking ? Math.sin(t * 12) * 6 : 0) };
    elbowR = { x: 168, y: 205 + bodyBob };
    handR = { x: 156, y: 224 + (talking ? Math.cos(t * 12) * 8 : 0) };
  } else if (isPanic) {
    const wv = Math.sin(t * 15) * 18;
    elbowL = { x: 78, y: 145 + bodyBob };
    handL = { x: 58, y: 98 + wv + bodyBob };
    elbowR = { x: 182, y: 145 + bodyBob };
    handR = { x: 202, y: 98 - wv + bodyBob };
  } else if (talking) {
    const g = Math.sin(t * 9) * 16;
    elbowR = { x: 170, y: 176 + bodyBob };
    handR = { x: 198, y: 158 + g + bodyBob };
    elbowL = { x: 92, y: 182 + bodyBob };
    handL = { x: 76, y: 172 - g * 0.6 + bodyBob };
  }

  // Pernas (quadril -> joelho -> pé)
  let kneeL = { x: 108, y: 325 };
  let footL = { x: 98, y: 395 };
  let kneeR = { x: 152, y: 325 };
  let footR = { x: 162, y: 395 };

  if (isWalk) {
    const lsw = Math.sin(walkPhase) * 38;
    kneeL = { x: 130 + lsw * 0.7, y: 325 - Math.max(0, lsw * 0.25) };
    footL = { x: 130 + lsw * 1.15, y: 395 - Math.max(0, lsw * 0.35) };
    kneeR = { x: 130 - lsw * 0.7, y: 325 - Math.max(0, -lsw * 0.25) };
    footR = { x: 130 - lsw * 1.15, y: 395 - Math.max(0, -lsw * 0.35) };
  }

  return (
    <svg
      viewBox="0 0 260 420"
      style={{
        width: 260 * scale,
        height: 420 * scale,
        overflow: "visible",
        transform: flip ? "scaleX(-1)" : undefined,
        filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.38))",
      }}
    >
      {/* Sombra no chão */}
      {!isDesk && <ellipse cx={130} cy={404} rx={56} ry={10} fill="rgba(0,0,0,0.32)" />}

      {/* Pernas */}
      {!isDesk && (
        <g stroke={strokeColor} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d={`M ${hip.x} ${hip.y} L ${kneeL.x} ${kneeL.y} L ${footL.x} ${footL.y}`} />
          <path d={`M ${hip.x} ${hip.y} L ${kneeR.x} ${kneeR.y} L ${footR.x} ${footR.y}`} />
        </g>
      )}

      {/* Tronco */}
      <line x1={neck.x} y1={neck.y} x2={hip.x} y2={hip.y} stroke={strokeColor} strokeWidth={11} strokeLinecap="round" />

      {/* Braços */}
      <g stroke={strokeColor} strokeWidth={9.5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={`M ${neck.x} ${neck.y + 12} L ${elbowL.x} ${elbowL.y} L ${handL.x} ${handL.y}`} />
        <path d={`M ${neck.x} ${neck.y + 12} L ${elbowR.x} ${elbowR.y} L ${handR.x} ${handR.y}`} />
      </g>

      {/* Vareta apontadora quando explain_board */}
      {isPoint && (
        <line
          x1={handR.x}
          y1={handR.y}
          x2={handR.x + 58}
          y2={handR.y - 42}
          stroke={accentColor}
          strokeWidth={6}
          strokeLinecap="round"
        />
      )}

      {/* Cabeça articulada */}
      <g transform={`translate(130, ${82 + bodyBob}) rotate(${headTilt})`}>
        <circle cx={0} cy={0} r={44} fill="#ffffff" stroke={strokeColor} strokeWidth={8} />

        {/* Olhos e Sobrancelhas */}
        {expression === "money" ? (
          <g fill="#16a34a" fontWeight={900} fontSize={24} textAnchor="middle" fontFamily="monospace">
            <text x={-14} y={4}>$</text>
            <text x={16} y={4}>$</text>
          </g>
        ) : blink ? (
          <g stroke="#111827" strokeWidth={4} strokeLinecap="round">
            <line x1={-22} y1={-4} x2={-6} y2={-4} />
            <line x1={8} y1={-4} x2={24} y2={-4} />
          </g>
        ) : (
          <g fill="#111827">
            <circle cx={-13} cy={-5} r={expression === "shocked" ? 7 : 5} />
            <circle cx={15} cy={-5} r={expression === "shocked" ? 7 : 5} />
          </g>
        )}

        {/* Sobrancelhas por expressão */}
        {expression === "angry" && (
          <g stroke="#111827" strokeWidth={4} strokeLinecap="round">
            <line x1={-24} y1={-19} x2={-6} y2={-12} />
            <line x1={26} y1={-19} x2={8} y2={-12} />
          </g>
        )}
        {expression === "skeptical" && (
          <g stroke="#111827" strokeWidth={4} strokeLinecap="round">
            <line x1={-23} y1={-14} x2={-6} y2={-15} />
            <path d="M 8 -18 Q 17 -26 26 -16" fill="none" />
          </g>
        )}

        {/* Boca sincronizada por visemas */}
        {viseme === "O" ? (
          <ellipse cx={2} cy={19} rx={9} ry={11} fill="#111827" />
        ) : viseme === "A" ? (
          <path d="M -13 13 Q 2 32 17 13 Z" fill="#111827" />
        ) : viseme === "E" ? (
          <rect x={-13} y={13} width={28} height={10} rx={5} fill="#111827" />
        ) : expression === "happy" || viseme === "smile" ? (
          <path d="M -14 14 Q 2 27 18 14" stroke="#111827" strokeWidth={4.5} fill="none" strokeLinecap="round" />
        ) : expression === "shocked" ? (
          <circle cx={2} cy={19} r={8} fill="#111827" />
        ) : (
          <line x1={-11} y1={18} x2={14} y2={18} stroke="#111827" strokeWidth={4.5} strokeLinecap="round" />
        )}

        {/* Acessórios */}
        {accessory === "cap" && (
          <g>
            <path d="M -42 -20 Q 0 -58 42 -20 Z" fill={accentColor} stroke="#111827" strokeWidth={4} />
            <path d="M 10 -22 L 58 -15 L 42 -28 Z" fill={accentColor} stroke="#111827" strokeWidth={3} />
          </g>
        )}
        {accessory === "crown" && (
          <polygon
            points="-30,-38 -15,-64 0,-44 15,-64 30,-38"
            fill="#facc15"
            stroke="#111827"
            strokeWidth={3.5}
          />
        )}
        {accessory === "glasses" && (
          <g stroke="#111827" strokeWidth={3.5} fill="rgba(56,189,248,0.22)">
            <rect x={-26} y={-14} width={20} height={15} rx={3} />
            <rect x={4} y={-14} width={20} height={15} rx={3} />
            <line x1={-6} y1={-7} x2={4} y2={-7} />
          </g>
        )}
        {accessory === "headphones" && (
          <g>
            <path d="M -44 0 A 44 44 0 0 1 44 0" fill="none" stroke={accentColor} strokeWidth={8} />
            <rect x={-52} y={-14} width={12} height={28} rx={6} fill={accentColor} stroke="#111827" strokeWidth={3} />
            <rect x={40} y={-14} width={12} height={28} rx={6} fill={accentColor} stroke="#111827" strokeWidth={3} />
          </g>
        )}
      </g>
    </svg>
  );
};

export const StickmanStageScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout, words, narration } = useVrs();

  const action = params.action ?? "explain_board";
  const expression = params.expression ?? "neutral";
  const accessory = params.accessory ?? "cap";
  const environment = params.environment ?? "whiteboard";
  const bullets: string[] = Array.isArray(params.bullets) ? params.bullets : [];
  const bubble: string = params.bubble ?? "";

  const speech = computeSpeechState(frame, fps, words, narration || bubble || params.title || "explicando");
  const enter = prog(frame, 0, 16, "out");
  const isDuet = action === "duet_debate";
  const speaker1Turn = !isDuet || Math.floor((frame / fps) / 2.2) % 2 === 0;
  const hasBoard = (action === "explain_board" || environment === "whiteboard" || environment === "classroom") && !isDuet;
  const camTransform = computeCameraTransform(frame, fps, durationInFrames, params.cameraMode || "auto_cut", isDuet, speaker1Turn, hasBoard);
  const boilSeed = Math.floor(frame / 3) % 7;

  const groundY = layout.safeBottom - 20 * layout.u;

  return (
    <AbsoluteFill
      style={{
        background:
          environment === "whiteboard"
            ? "linear-gradient(180deg, #162032 0%, #0f172a 78%, #1e293b 78%)"
            : environment === "classroom"
              ? "linear-gradient(180deg, #1e293b 0%, #0f172a 75%, #334155 75%)"
              : `linear-gradient(180deg, ${withAlpha(theme.accent2, 0.18)} 0%, ${theme.background} 78%)`,
        overflow: "hidden",
      }}
    >
      {/* Filtro SVG de traço vivo (Line-Boil 10fps estilo animação rabiscada à mão) */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          <filter id="vrs-line-boil">
            <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves={2} seed={boilSeed} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={2.4} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <AbsoluteFill style={{ transform: camTransform, transformOrigin: "50% 55%", transition: "transform 0.22s ease-out" }}>
      {/* Piso do cenário */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: groundY - 24 * layout.u,
          bottom: 0,
          background: withAlpha(theme.foreground, 0.06),
          borderTop: `${3 * layout.u}px solid ${withAlpha(theme.foreground, 0.18)}`,
        }}
      />

      <SceneHeader title={params.title ?? ""} />

      {/* Quadro Branco / Lousa interativa quando explain_board ou classroom */}
      {(action === "explain_board" || environment === "whiteboard" || environment === "classroom") && !isDuet && (
        <div
          style={{
            position: "absolute",
            right: layout.padX,
            top: layout.padTop + (params.title ? 130 : 40) * layout.u,
            width: layout.w * (layout.vertical ? 0.86 : 0.54),
            height: (groundY - layout.padTop - (params.title ? 190 : 100) * layout.u) * (layout.vertical ? 0.52 : 0.88),
            background: "#f8fafc",
            color: "#0f172a",
            borderRadius: 20 * layout.u,
            border: `${10 * layout.u}px solid #475569`,
            boxShadow: "0 24px 50px rgba(0,0,0,0.45)",
            padding: `${26 * layout.u}px ${32 * layout.u}px`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transform: `scale(${0.92 + 0.08 * enter})`,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: fontStack("rounded"),
                fontWeight: 900,
                fontSize: 34 * layout.u,
                color: "#0f172a",
                borderBottom: `3px dashed #cbd5e1`,
                paddingBottom: 10 * layout.u,
                marginBottom: 18 * layout.u,
              }}
            >
              {params.boardTitle || "QUADRO DE EXPLICAÇÃO"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 * layout.u }}>
              {bullets.map((b, i) => {
                const bp = prog(frame, 10 + i * 14, 14, "out");
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12 * layout.u,
                      opacity: bp,
                      transform: `translateX(${(1 - bp) * 24}px)`,
                      fontFamily: fontStack("rounded"),
                      fontWeight: 700,
                      fontSize: 28 * layout.u,
                      color: "#1e293b",
                    }}
                  >
                    <span
                      style={{
                        width: 32 * layout.u,
                        height: 32 * layout.u,
                        borderRadius: 99,
                        background: theme.accent,
                        color: "#0f172a",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18 * layout.u,
                        fontWeight: 900,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span>{b}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {params.boardAsset ? (
            <div style={{ height: "44%", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <AssetImg src={params.boardAsset} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
            </div>
          ) : (
            <div style={{ height: "38%", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <svg viewBox="0 0 360 110" style={{ width: "86%", height: "100%", overflow: "visible" }}>
                <path
                  d="M 20 85 Q 95 20 175 65 T 335 22"
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth={6}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - prog(frame, 12, 38, "out")}
                />
                <circle cx={335} cy={22} r={9 * prog(frame, 44, 10, "out")} fill="#16a34a" />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Bonequinho Palito Principal */}
      <div
        style={{
          position: "absolute",
          left:
            action === "walk_talk"
              ? layout.padX + (frame / Math.max(1, durationInFrames)) * (layout.w * 0.35)
              : layout.padX + (layout.vertical ? 20 : 60) * layout.u,
          top: groundY - 410 * layout.u,
          transform: `translateX(${(1 - enter) * -120}px)`,
          filter: "url(#vrs-line-boil)",
        }}
      >
        <StickFigureSVG
          frame={frame}
          fps={fps}
          action={action}
          expression={expression}
          accessory={accessory}
          viseme={speaker1Turn ? speech.viseme : "closed"}
          talking={speaker1Turn && speech.talking}
          syllablePulse={speaker1Turn ? speech.syllablePulse : 0}
          strokeColor="#f8fafc"
          accentColor={theme.accent}
          scale={layout.u * (layout.vertical ? 0.92 : 1.02)}
        />
      </div>

      {/* Segundo Bonequinho Palito quando em modo Dueto / Debate */}
      {isDuet && (
        <div
          style={{
            position: "absolute",
            right: layout.padX + (layout.vertical ? 20 : 80) * layout.u,
            top: groundY - 410 * layout.u,
            transform: `translateX(${(1 - enter) * 120}px)`,
          }}
        >
          <StickFigureSVG
            frame={frame + 17}
            fps={fps}
            action="talk"
            expression={expression === "angry" ? "shocked" : "skeptical"}
            accessory={accessory === "cap" ? "glasses" : "crown"}
            viseme={!speaker1Turn ? speech.viseme : "closed"}
            talking={!speaker1Turn && speech.talking}
            syllablePulse={!speaker1Turn ? speech.syllablePulse : 0}
            strokeColor="#e2e8f0"
            accentColor={theme.accent2}
            flip
            scale={layout.u * (layout.vertical ? 0.92 : 1.02)}
          />
        </div>
      )}

      {/* Mesa de Podcast quando desk_podcast */}
      {action === "desk_podcast" && (
        <div
          style={{
            position: "absolute",
            left: layout.padX + 20 * layout.u,
            right: layout.padX + 20 * layout.u,
            top: groundY - 155 * layout.u,
            height: 155 * layout.u,
            background: "linear-gradient(180deg, #334155 0%, #1e293b 100%)",
            borderRadius: `${18 * layout.u}px ${18 * layout.u}px 0 0`,
            borderTop: `${6 * layout.u}px solid ${theme.accent}`,
            boxShadow: "0 -10px 30px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            padding: `0 ${40 * layout.u}px`,
          }}
        >
          <Tag text={params.boardTitle || "ESTÚDIO VRS PODCAST"} delay={4} />
        </div>
      )}

      {/* Balão de fala */}
      {bubble ? (
        <div
          style={{
            position: "absolute",
            left: layout.padX + 250 * layout.u,
            top: groundY - 430 * layout.u,
            maxWidth: layout.w * 0.42,
            background: "#ffffff",
            color: "#0f172a",
            padding: `${16 * layout.u}px ${24 * layout.u}px`,
            borderRadius: 24 * layout.u,
            fontFamily: fontStack("rounded"),
            fontWeight: 800,
            fontSize: 30 * layout.u,
            boxShadow: "0 14px 32px rgba(0,0,0,0.35)",
            transform: `scale(${pop(frame, fps, 10, 12)})`,
          }}
        >
          {bubble}
        </div>
      ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================================================================
// MOTOR 2: vrs-southpark-stage (Estilo South Park / Paper Cutout 12fps + LipSync)
// ============================================================================

const PaperCutoutPuppet: React.FC<{
  frame: number;
  fps: number;
  coatColor: string;
  hatColor: string;
  hatStyle: string;
  expression: string;
  viseme: Viseme;
  talking: boolean;
  syllablePulse: number;
  nameTag?: string;
}> = ({ frame, fps, coatColor, hatColor, hatStyle, expression, viseme, talking, syllablePulse, nameTag }) => {
  // Estética Stop-Motion 12 FPS característica de recorte de papel
  const stepFrame = Math.floor(frame / 2.5) * 2.5;
  const t = stepFrame / fps;
  const blink = Math.floor(frame / 3) % 29 === 0;

  // Waddle / pulinho de papel e inclinação da cabeça ao falar
  const bodyWaddle = talking ? (Math.floor(stepFrame / 3) % 2 === 0 ? -3.5 : 3.5) : 0;
  const bodyHop = talking ? syllablePulse * -10 : 0;
  const headTilt = talking ? (Math.floor(stepFrame / 2.5) % 2 === 0 ? -6.5 : 6.5) * (0.5 + syllablePulse * 0.6) : 0;
  const headBob = talking ? -syllablePulse * 9 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
      <svg
        viewBox="0 0 280 340"
        style={{
          width: "100%",
          height: "100%",
          overflow: "visible",
          filter: "drop-shadow(6px 8px 0px rgba(0,0,0,0.42))",
        }}
      >
        <g transform={`translate(140, 290) rotate(${bodyWaddle}) translate(0, ${bodyHop})`}>
          {/* Sombra no chão */}
          <ellipse cx={0} cy={18} rx={78} ry={14} fill="rgba(0,0,0,0.32)" />

          {/* Sapatos pretos achatados */}
          <ellipse cx={-34} cy={8} rx={34} ry={11} fill="#1e293b" stroke="#0f172a" strokeWidth={3} />
          <ellipse cx={34} cy={8} rx={34} ry={11} fill="#1e293b" stroke="#0f172a" strokeWidth={3} />

          {/* Calça */}
          <rect x={-58} y={-24} width={116} height={30} rx={8} fill="#1d4ed8" stroke="#0f172a" strokeWidth={3} />

          {/* Casaco / Tronco largo estilo South Park */}
          <path
            d="M -68 -118 C -78 -75 -74 -20 -62 -16 L 62 -16 C 74 -20 78 -75 68 -118 Z"
            fill={coatColor}
            stroke="#0f172a"
            strokeWidth={3.5}
          />
          {/* Gola e zíper central */}
          <line x1={0} y1={-114} x2={0} y2={-16} stroke="#0f172a" strokeWidth={3} />
          <circle cx={-10} cy={-86} r={3.5} fill="#0f172a" />
          <circle cx={-10} cy={-62} r={3.5} fill="#0f172a" />
          <circle cx={-10} cy={-38} r={3.5} fill="#0f172a" />

          {/* Mãozinhas circulares soltas (luvas) que gesticulam ao falar */}
          <circle
            cx={-74}
            cy={-56 + (talking ? Math.sin(t * 18) * 14 : 0)}
            r={18}
            fill={hatColor}
            stroke="#0f172a"
            strokeWidth={3}
          />
          <circle
            cx={74}
            cy={-56 + (talking ? -Math.sin(t * 18) * 14 : 0)}
            r={18}
            fill={hatColor}
            stroke="#0f172a"
            strokeWidth={3}
          />

          {/* Cabeça de papel separada com Head-Tilt e Head-Bob */}
          <g transform={`translate(0, ${-175 + headBob}) rotate(${headTilt})`} style={{ filter: "drop-shadow(3px 5px 0px rgba(0,0,0,0.28))" }}>
            <ellipse cx={0} cy={0} rx={72} ry={66} fill="#fde68a" stroke="#0f172a" strokeWidth={3.5} />

            {/* Olhos grandes ovais encostados */}
            {blink ? (
              <g stroke="#0f172a" strokeWidth={4} strokeLinecap="round">
                <line x1={-38} y1={-6} x2={-4} y2={-6} />
                <line x1={4} y1={-6} x2={38} y2={-6} />
              </g>
            ) : (
              <g>
                <ellipse cx={-19} cy={-8} rx={19} ry={23} fill="#ffffff" stroke="#0f172a" strokeWidth={2.5} transform="rotate(-6 -19 -8)" />
                <ellipse cx={19} cy={-8} rx={19} ry={23} fill="#ffffff" stroke="#0f172a" strokeWidth={2.5} transform="rotate(6 19 -8)" />
                <circle cx={-15} cy={-8} r={4.2} fill="#0f172a" />
                <circle cx={15} cy={-8} r={4.2} fill="#0f172a" />
              </g>
            )}

            {/* Sobrancelhas recortadas */}
            {expression === "angry" && (
              <g stroke="#0f172a" strokeWidth={5} strokeLinecap="round">
                <line x1={-38} y1={-32} x2={-6} y2={-20} />
                <line x1={38} y1={-32} x2={6} y2={-20} />
              </g>
            )}
            {expression === "shocked" && (
              <g stroke="#0f172a" strokeWidth={4.5} strokeLinecap="round">
                <line x1={-36} y1={-36} x2={-10} y2={-38} />
                <line x1={10} y1={-38} x2={36} y2={-36} />
              </g>
            )}

            {/* Boca de recorte com 6 visemas */}
            {viseme === "A" ? (
              <g>
                <path d="M -22 24 L 22 24 L 16 46 L -16 46 Z" fill="#0f172a" />
                <rect x={-16} y={24} width={32} height={6} fill="#ffffff" />
                <ellipse cx={0} cy={41} rx={10} ry={4} fill="#ef4444" />
              </g>
            ) : viseme === "O" ? (
              <ellipse cx={0} cy={34} rx={12} ry={14} fill="#0f172a" />
            ) : viseme === "E" ? (
              <g>
                <rect x={-20} y={26} width={40} height={13} rx={4} fill="#ffffff" stroke="#0f172a" strokeWidth={2.5} />
                <line x1={-20} y1={32.5} x2={20} y2={32.5} stroke="#0f172a" strokeWidth={2} />
              </g>
            ) : viseme === "smile" || expression === "happy" ? (
              <path d="M -20 26 Q 0 44 20 26 Z" fill="#0f172a" />
            ) : (
              <line x1={-15} y1={32} x2={15} y2={32} stroke="#0f172a" strokeWidth={3.5} strokeLinecap="round" />
            )}

            {/* Gorro / Chapéu estilo South Park */}
            {hatStyle === "ushanka" ? (
              <g>
                <rect x={-70} y={-68} width={140} height={36} rx={8} fill={hatColor} stroke="#0f172a" strokeWidth={3.5} />
                <rect x={-52} y={-56} width={104} height={24} rx={4} fill="#86efac" stroke="#0f172a" strokeWidth={2.5} />
                <path d="M -70 -36 L -78 4 L -56 -8 L -56 -36 Z" fill={hatColor} stroke="#0f172a" strokeWidth={3} />
                <path d="M 70 -36 L 78 4 L 56 -8 L 56 -36 Z" fill={hatColor} stroke="#0f172a" strokeWidth={3} />
              </g>
            ) : hatStyle === "spiky" ? (
              <path
                d="M -68 -34 L -56 -72 L -30 -52 L 0 -78 L 30 -52 L 56 -72 L 68 -34 Z"
                fill="#0f172a"
              />
            ) : (
              <g>
                <path d="M -70 -28 C -68 -78 68 -78 70 -28 Z" fill={hatColor} stroke="#0f172a" strokeWidth={3.5} />
                <rect x={-72} y={-36} width={144} height={14} rx={6} fill="#facc15" stroke="#0f172a" strokeWidth={3} />
                <circle cx={0} cy={-70} r={14} fill="#facc15" stroke="#0f172a" strokeWidth={3} />
              </g>
            )}
          </g>
        </g>
      </svg>
      {nameTag ? (
        <div
          style={{
            marginTop: -6,
            background: "#0f172a",
            color: "#f8fafc",
            padding: "4px 14px",
            borderRadius: 99,
            fontSize: 18,
            fontWeight: 800,
            fontFamily: fontStack("rounded"),
          }}
        >
          {nameTag}
        </div>
      ) : null}
    </div>
  );
};

export const SouthParkStageScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { layout, words, narration } = useVrs();

  const mode = params.mode ?? "duet";
  const environment = params.environment ?? "snow_town";
  const expression = params.expression ?? "neutral";
  const bubble = params.bubble ?? "";

  const speech = computeSpeechState(frame, fps, words, narration || bubble || params.title || "fala", 12);
  const isDuet = mode === "duet";
  const leftTurn = !isDuet || Math.floor(Math.max(0, speech.wordIndex) / 3) % 2 === 0;
  const camTransform = computeCameraTransform(frame, fps, durationInFrames, params.cameraMode || "auto_cut", isDuet, leftTurn, false);

  const groundY = layout.safeBottom - 16 * layout.u;
  const charSize = (layout.vertical ? 300 : 340) * layout.u;

  return (
    <AbsoluteFill
      style={{
        background:
          environment === "snow_town"
            ? "#bae6fd"
            : environment === "classroom"
              ? "#fef3c7"
              : environment === "courtroom"
                ? "#451a03"
                : "#1e293b",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill style={{ transform: camTransform, transformOrigin: "50% 60%", transition: "transform 0.18s steps(3)" }}>
      {/* Camada de fundo estilo papel recortado (Montanhas nevadas e pinheiros) */}
      {environment === "snow_town" && (
        <svg
          viewBox="0 0 1920 1080"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          {/* Sol de papel */}
          <circle cx={1580} cy={170} r={90} fill="#fde047" filter="drop-shadow(5px 6px 0px rgba(0,0,0,0.22))" />
          {/* Montanhas de papel recortado */}
          <polygon points="-100,820 360,260 820,820" fill="#64748b" stroke="#0f172a" strokeWidth={5} />
          <polygon points="240,406 360,260 480,406 410,430 360,390 310,430" fill="#f8fafc" />
          <polygon points="560,820 1080,210 1580,820" fill="#475569" stroke="#0f172a" strokeWidth={5} />
          <polygon points="940,380 1080,210 1220,380 1140,415 1080,370 1010,410" fill="#f8fafc" />
          <polygon points="1220,820 1690,300 2050,820" fill="#64748b" stroke="#0f172a" strokeWidth={5} />
          {/* Pinheiros de papel */}
          {[180, 480, 820, 1340, 1720].map((px, idx) => (
            <g key={idx} transform={`translate(${px}, 650)`} filter="drop-shadow(4px 5px 0px rgba(0,0,0,0.28))">
              <rect x={-14} y={70} width={28} height={60} fill="#78350f" stroke="#0f172a" strokeWidth={4} />
              <polygon points="-70,80 0,-30 70,80" fill="#15803d" stroke="#0f172a" strokeWidth={4} />
              <polygon points="-58,30 0,-70 58,30" fill="#16a34a" stroke="#0f172a" strokeWidth={4} />
            </g>
          ))}
          {/* Placa de ponto de ônibus */}
          <g transform="translate(960, 560)" filter="drop-shadow(5px 6px 0px rgba(0,0,0,0.35))">
            <rect x={-8} y={0} width={16} height={220} fill="#475569" stroke="#0f172a" strokeWidth={4} />
            <rect x={-95} y={-65} width={190} height={74} rx={8} fill="#facc15" stroke="#0f172a" strokeWidth={4} />
            <text x={0} y={-18} textAnchor="middle" fontFamily="sans-serif" fontWeight={900} fontSize={32} fill="#0f172a">
              BUS STOP
            </text>
          </g>
          {/* Chão de neve em papel branco */}
          <rect x={0} y={740} width={1920} height={340} fill="#f8fafc" stroke="#0f172a" strokeWidth={6} />
        </svg>
      )}

      {environment !== "snow_town" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: groundY - 40 * layout.u,
            bottom: 0,
            background: "#334155",
            borderTop: "6px solid #0f172a",
          }}
        />
      )}

      <SceneHeader title={params.title ?? ""} />

      {/* Personagem 1 (Esquerda ou Centro) */}
      <div
        style={{
          position: "absolute",
          left: isDuet ? layout.padX + 70 * layout.u : (layout.w - charSize) / 2,
          top: groundY - charSize * 1.05,
          width: charSize * 0.85,
          height: charSize,
        }}
      >
        <PaperCutoutPuppet
          frame={frame}
          fps={fps}
          coatColor={params.coatColor || "#ef4444"}
          hatColor={params.hatColor || "#38bdf8"}
          hatStyle={params.hatStyle || "beanie"}
          expression={expression}
          viseme={leftTurn ? speech.viseme : "closed"}
          talking={leftTurn && speech.talking}
          syllablePulse={leftTurn ? speech.syllablePulse : 0}
          nameTag={params.characterName || "Leo"}
        />
      </div>

      {/* Personagem 2 (Direita em modo Dueto) */}
      {isDuet && (
        <div
          style={{
            position: "absolute",
            right: layout.padX + 70 * layout.u,
            top: groundY - charSize * 1.05,
            width: charSize * 0.85,
            height: charSize,
          }}
        >
          <PaperCutoutPuppet
            frame={frame + 11}
            fps={fps}
            coatColor={params.secondCoatColor || "#f97316"}
            hatColor={params.secondHatColor || "#22c55e"}
            hatStyle={params.hatStyle === "ushanka" ? "beanie" : "ushanka"}
            expression={expression === "angry" ? "shocked" : "neutral"}
            viseme={!leftTurn ? speech.viseme : "closed"}
            talking={!leftTurn && speech.talking}
            syllablePulse={!leftTurn ? speech.syllablePulse : 0}
            nameTag={params.secondCharacterName || "Max"}
          />
        </div>
      )}

      {/* Balão de fala recortado em papel */}
      {bubble ? (
        <div
          style={{
            position: "absolute",
            left: isDuet ? (leftTurn ? layout.padX + 120 * layout.u : undefined) : layout.w * 0.54,
            right: isDuet && !leftTurn ? layout.padX + 120 * layout.u : undefined,
            top: groundY - charSize * 1.28,
            maxWidth: layout.w * 0.44,
            background: "#ffffff",
            color: "#0f172a",
            border: "5px solid #0f172a",
            borderRadius: 20 * layout.u,
            padding: `${16 * layout.u}px ${24 * layout.u}px`,
            fontFamily: fontStack("rounded"),
            fontWeight: 900,
            fontSize: 30 * layout.u,
            filter: "drop-shadow(6px 8px 0px rgba(0,0,0,0.45))",
          }}
        >
          {bubble}
        </div>
      ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================================================================
// MOTOR 3: vrs-roblox-stage (Bonecos Estilo Roblox / Blocky 3D + Cenário Obby)
// ============================================================================

function makeFaceTexture(talking: boolean, viseme: Viseme, skinHex: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = skinHex || "#facc15";
  ctx.fillRect(0, 0, 256, 256);

  // Olhos estilo Roblox
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.roundRect(72, 82, 24, 36, 10);
  ctx.roundRect(160, 82, 24, 36, 10);
  ctx.fill();

  // Brilho nos olhos
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(80, 92, 5, 0, Math.PI * 2);
  ctx.arc(168, 92, 5, 0, Math.PI * 2);
  ctx.fill();

  // Boca estilo Roblox sincronizada
  ctx.fillStyle = "#111827";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  if (talking && viseme === "O") {
    ctx.beginPath();
    ctx.arc(128, 168, 22, 0, Math.PI * 2);
    ctx.fill();
  } else if (talking && (viseme === "A" || viseme === "E")) {
    ctx.beginPath();
    ctx.roundRect(88, 148, 80, 38, 12);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(94, 150, 68, 10);
  } else {
    ctx.beginPath();
    ctx.arc(128, 148, 36, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

type BlockyRig = {
  root: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  faceMat: THREE.MeshStandardMaterial;
};

function createRobloxRig(shirtHex: string, pantsHex: string, skinHex: string, hatColor: string): BlockyRig {
  const root = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: skinHex || "#facc15", roughness: 0.35 });
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtHex || "#2563eb", roughness: 0.45 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsHex || "#16a34a", roughness: 0.5 });

  // Torso (bloco central Roblox R6: 1.0 x 1.1 x 0.5)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.52), shirtMat);
  torso.position.y = 1.55;
  root.add(torso);

  // Cabeça cilíndrica/bloco característica do Roblox
  const headMaterials = [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat];
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.76, 0.76), headMaterials);
  head.position.y = 2.52;
  root.add(head);

  // Boné / Acessório blocky no topo da cabeça
  if (hatColor) {
    const hatMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.4 });
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.24, 0.84), hatMat);
    hat.position.y = 0.44;
    head.add(hat);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.35), hatMat);
    visor.position.set(0, 0.36, 0.52);
    head.add(visor);
  }

  // Braços com pivô no ombro
  const makeLimb = (mat: THREE.Material) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.05, 0.48), mat);
    mesh.position.y = -0.45;
    pivot.add(mesh);
    return pivot;
  };

  const armL = makeLimb(skinMat);
  armL.position.set(-0.76, 2.02, 0);
  root.add(armL);

  const armR = makeLimb(skinMat);
  armR.position.set(0.76, 2.02, 0);
  root.add(armR);

  // Pernas com pivô no quadril
  const legL = makeLimb(pantsMat);
  legL.position.set(-0.26, 1.0, 0);
  root.add(legL);

  const legR = makeLimb(pantsMat);
  legR.position.set(0.26, 1.0, 0);
  root.add(legR);

  return { root, head, torso, armL, armR, legL, legR, faceMat };
}

export const RobloxStageScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { theme, layout, words, narration } = useVrs();
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    rig1: BlockyRig;
    rig2: BlockyRig | null;
    platforms: THREE.Mesh[];
  } | null>(null);

  const action = params.action ?? "obby_jump";
  const environment = params.environment ?? "obby_sky";
  const shirtColor = params.shirtColor || "#2563eb";
  const pantsColor = params.pantsColor || "#16a34a";
  const skinColor = params.skinColor || "#facc15";
  const w = Math.round(layout.w - layout.padX * 2);
  const h = Math.round(layout.safeBottom - layout.padTop - (params.title ? 140 : 40) * layout.u);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      return;
    }
    renderer.setSize(w, h);
    el.innerHTML = "";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / Math.max(1, h), 0.1, 120);

    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const sun = new THREE.DirectionalLight(0xfffbeb, 1.9);
    sun.position.set(6, 12, 8);
    scene.add(sun);

    // Piso e plataformas estilo Roblox Obby / Mundo em Blocos
    const platforms: THREE.Mesh[] = [];
    const colors = [0x38bdf8, 0xf43f5e, 0xfacc15, 0x22c55e, 0xa855f7];

    if (environment === "obby_sky") {
      for (let i = 0; i < 5; i++) {
        const plat = new THREE.Mesh(
          new THREE.BoxGeometry(2.4, 0.45, 2.4),
          new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.4 }),
        );
        plat.position.set((i - 1.5) * 2.2, (i % 2) * 0.35 - 0.22, -i * 0.6);
        scene.add(plat);
        platforms.push(plat);
      }
    } else {
      const ground = new THREE.Mesh(
        new THREE.BoxGeometry(18, 0.6, 18),
        new THREE.MeshStandardMaterial({ color: environment === "nature_camp" ? 0x16a34a : 0x334155, roughness: 0.7 }),
      );
      ground.position.y = -0.3;
      scene.add(ground);

      // Blocos decorativos de cenário (prédios ou árvores em blocos)
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        const prop = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 2.2 + Math.abs(i) * 0.8, 1.4),
          new THREE.MeshStandardMaterial({ color: environment === "nature_camp" ? 0x15803d : 0x475569 }),
        );
        prop.position.set(i * 2.4, 1.0, -3.2);
        scene.add(prop);
      }
    }

    const rig1 = createRobloxRig(shirtColor, pantsColor, skinColor, "#ef4444");
    scene.add(rig1.root);

    let rig2: BlockyRig | null = null;
    if (action === "duet_3d") {
      rig2 = createRobloxRig("#f97316", "#1e293b", "#fde047", "#38bdf8");
      rig2.root.position.set(1.6, 0, 0);
      rig2.root.rotation.y = -0.45;
      rig1.root.position.set(-1.6, 0, 0);
      rig1.root.rotation.y = 0.45;
      scene.add(rig2.root);
    }

    stateRef.current = { renderer, scene, camera, rig1, rig2, platforms };
    return () => {
      renderer.dispose();
      stateRef.current = null;
    };
  }, [w, h, action, environment, shirtColor, pantsColor, skinColor]);

  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    const t = frame / fps;
    const speech = computeSpeechState(frame, fps, words, narration || params.bubble || params.title || "roblox");

    // Atualiza textura facial com lip-sync
    const tex1 = makeFaceTexture(speech.talking, speech.viseme, skinColor);
    st.rig1.faceMat.map?.dispose();
    st.rig1.faceMat.map = tex1;
    st.rig1.faceMat.needsUpdate = true;

    const swing = Math.sin(t * 7.5);
    if (action === "obby_jump") {
      const jumpPhase = (t * 1.4) % 1;
      const jumpY = Math.sin(jumpPhase * Math.PI) * 1.15;
      st.rig1.root.position.set(Math.sin(t * 0.9) * 1.4, Math.max(0, jumpY), 0);
      st.rig1.root.rotation.y = Math.cos(t * 0.9) * 0.35;
      st.rig1.armL.rotation.x = swing * 0.9;
      st.rig1.armR.rotation.x = -swing * 0.9;
      st.rig1.legL.rotation.x = -swing * 0.85;
      st.rig1.legR.rotation.x = swing * 0.85;
    } else if (action === "wave_talk") {
      st.rig1.root.position.set(0, speech.talking ? speech.syllablePulse * 0.08 : 0, 0);
      st.rig1.armR.rotation.z = 2.4 + Math.sin(t * 12) * 0.35;
      st.rig1.armL.rotation.x = speech.talking ? Math.sin(t * 8) * 0.45 : 0;
      st.rig1.head.rotation.y = Math.sin(t * 2.5) * 0.18;
    } else if (action === "duet_3d" && st.rig2) {
      const turn1 = Math.floor(t / 2) % 2 === 0;
      st.rig1.armR.rotation.x = turn1 ? Math.sin(t * 10) * 0.6 : 0;
      st.rig2.armL.rotation.x = !turn1 ? Math.sin(t * 10) * 0.6 : 0;
      const tex2 = makeFaceTexture(!turn1 && speech.talking, speech.viseme, "#fde047");
      st.rig2.faceMat.map?.dispose();
      st.rig2.faceMat.map = tex2;
    } else {
      st.rig1.armL.rotation.x = swing * 0.65;
      st.rig1.armR.rotation.x = -swing * 0.65;
      st.rig1.legL.rotation.x = -swing * 0.65;
      st.rig1.legR.rotation.x = swing * 0.65;
    }

    st.camera.position.set(
      params.cameraMode === "closeup" ? (action === "duet_3d" ? (Math.floor(t / 2) % 2 === 0 ? -0.9 : 0.9) : 0.3) : Math.sin(t * 0.35) * 1.4,
      params.cameraMode === "closeup" ? 2.25 : 2.6,
      params.cameraMode === "closeup" ? 3.9 : 5.6,
    );
    st.camera.lookAt(0, 1.65, 0);
    st.renderer.render(st.scene, st.camera);
  }, [frame, fps, action, skinColor, words, narration, params.bubble, params.title, params.cameraMode]);

  return (
    <AbsoluteFill
      style={{
        background:
          environment === "obby_sky"
            ? "linear-gradient(180deg, #0284c7 0%, #38bdf8 55%, #bae6fd 100%)"
            : "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
      }}
    >
      <SceneHeader title={params.title ?? ""} align="center" />
      <div
        ref={mountRef}
        style={{
          position: "absolute",
          left: layout.padX,
          top: layout.padTop + (params.title ? 130 : 30) * layout.u,
          width: w,
          height: h,
        }}
      />
      {params.bubble ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: layout.padTop + (params.title ? 145 : 55) * layout.u,
            transform: `translateX(-50%) scale(${pop(frame, fps, 8, 12)})`,
            background: "rgba(255,255,255,0.95)",
            color: "#0f172a",
            borderRadius: 18 * layout.u,
            padding: `${12 * layout.u}px ${24 * layout.u}px`,
            fontFamily: fontStack("rounded"),
            fontWeight: 900,
            fontSize: 28 * layout.u,
            boxShadow: "0 14px 32px rgba(0,0,0,0.35)",
          }}
        >
          {params.bubble}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ============================================================================
// MOTOR 4: vrs-multiplane-stage (Cenários 2D Multi-Plano + Avatares + Stickers Die-Cut)
// ============================================================================

export const MultiplaneStageScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout, words, narration } = useVrs();

  const t = frame / Math.max(1, durationInFrames);
  const environment = params.environment ?? "podcast_studio";
  const speech = computeSpeechState(frame, fps, words, narration || params.bubble || params.title || "cena");
  const enter = prog(frame, 0, 16, "out");
  const groundY = layout.safeBottom - 16 * layout.u;
  const charH = layout.h * (layout.vertical ? 0.38 : 0.56);

  // Movimento vivo (breathing + squash-and-stretch na sílaba falada)
  const breathe = Math.sin(frame / 14) * 0.018;
  const talkStretch = speech.talking ? speech.syllablePulse * 0.045 : 0;
  const talkTilt = speech.talking ? Math.sin(frame * 0.65) * 2.8 : Math.sin(frame / 22) * 1.1;

  const stickers: Any[] = Array.isArray(params.stickers) ? params.stickers : [];
  const isDuet = Boolean(params.secondCharacter);
  const leftTurn = !isDuet || Math.floor(Math.max(0, speech.wordIndex) / 3) % 2 === 0;
  const camTransform = computeCameraTransform(frame, fps, durationInFrames, params.cameraMode || "auto_cut", isDuet, leftTurn, false);

  return (
    <AbsoluteFill style={{ background: theme.background, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: camTransform, transformOrigin: "50% 55%", transition: "transform 0.25s ease-out" }}>
      {/* CAMADA 1: Fundo distante com paralaxe lenta */}
      <AbsoluteFill
        style={{
          transform: `scale(1.12) translateX(${(0.5 - t) * 28}px)`,
          background:
            environment === "castle_hills"
              ? "linear-gradient(180deg, #38bdf8 0%, #bae6fd 65%, #86efac 65%)"
              : environment === "city_neon"
                ? "linear-gradient(180deg, #090d16 0%, #1e1b4b 68%, #0f172a 68%)"
                : "linear-gradient(180deg, #0f172a 0%, #1e293b 72%, #0b1020 72%)",
        }}
      >
        {params.farBackground ? (
          <AssetImg src={params.farBackground} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
      </AbsoluteFill>

      {/* CAMADA 2: Meio-termo (Cenário arquitetônico/paisagem) com paralaxe média */}
      <AbsoluteFill style={{ transform: `translateX(${(0.5 - t) * 55}px)` }}>
        {params.midground ? (
          <AssetImg src={params.midground} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom" }} />
        ) : environment === "podcast_studio" ? (
          <div
            style={{
              position: "absolute",
              left: layout.padX * 0.8,
              right: layout.padX * 0.8,
              top: layout.padTop + 90 * layout.u,
              bottom: layout.h - groundY + 90 * layout.u,
              borderRadius: 24 * layout.u,
              border: `2px solid ${withAlpha(theme.accent, 0.28)}`,
              background: "radial-gradient(circle at 50% 30%, rgba(56,189,248,0.14), rgba(15,23,42,0.85))",
            }}
          />
        ) : null}
      </AbsoluteFill>

      <SceneHeader title={params.title ?? ""} />

      {/* CAMADA 3: Personagens Ilustrados com Respiração + Pulso de Voz */}
      {params.character ? (
        <div
          style={{
            position: "absolute",
            left: params.secondCharacter ? layout.padX + 40 * layout.u : (layout.w - charH) / 2,
            top: groundY - charH - 35 * layout.u,
            width: charH,
            height: charH,
            transformOrigin: "50% 100%",
            transform: `translateY(${(1 - enter) * 80}px) scale(${1 - talkStretch * 0.4}, ${1 + breathe + talkStretch}) rotate(${talkTilt}deg)`,
            filter: speech.talking
              ? `drop-shadow(0 0 ${18 * layout.u}px ${withAlpha(theme.accent, 0.65)}) drop-shadow(0 16px 28px rgba(0,0,0,0.55))`
              : "drop-shadow(0 16px 28px rgba(0,0,0,0.55))",
          }}
        >
          <AssetImg src={params.character} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom" }} />
        </div>
      ) : null}

      {params.secondCharacter ? (
        <div
          style={{
            position: "absolute",
            right: layout.padX + 40 * layout.u,
            top: groundY - charH - 35 * layout.u,
            width: charH,
            height: charH,
            transformOrigin: "50% 100%",
            transform: `translateY(${(1 - enter) * 80}px) scale(${1}, ${1 + Math.cos(frame / 14) * 0.018}) rotate(${-talkTilt * 0.6}deg)`,
            filter: "drop-shadow(0 16px 28px rgba(0,0,0,0.55))",
          }}
        >
          <AssetImg src={params.secondCharacter} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom" }} />
        </div>
      ) : null}

      {/* CAMADA 4: Primeiro Plano (Bancada / Mesa / Grama frontal) com paralaxe rápida */}
      <div
        style={{
          position: "absolute",
          left: -40,
          right: -40,
          top: groundY - 85 * layout.u,
          height: 120 * layout.u,
          transform: `translateX(${(0.5 - t) * 90}px)`,
          background:
            environment === "castle_hills"
              ? "linear-gradient(180deg, #16a34a 0%, #15803d 100%)"
              : "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
          borderTop: `${5 * layout.u}px solid ${theme.accent}`,
          boxShadow: "0 -14px 34px rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {params.bubble ? (
          <div
            style={{
              background: "#ffffff",
              color: "#0f172a",
              padding: `${10 * layout.u}px ${26 * layout.u}px`,
              borderRadius: 999,
              fontFamily: fontStack("rounded"),
              fontWeight: 900,
              fontSize: 28 * layout.u,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            {params.bubble}
          </div>
        ) : null}
      </div>

      {/* CAMADA 5: Stickers Die-Cut (Adesivos com borda branca recortada que saltam com mola) */}
      {stickers.map((st, i) => {
        const delay = 10 + i * 16;
        const sp = pop(frame, fps, delay, 10);
        const sx = Number(st.x ?? (i % 2 === 0 ? 0.2 : 0.8)) * layout.w;
        const sy = Number(st.y ?? 0.34) * layout.h + Math.sin((frame + i * 15) / 14) * 6 * layout.u;
        const size = 150 * layout.u;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: sx - size / 2,
              top: sy - size / 2,
              transform: `scale(${sp}) rotate(${(i % 2 === 0 ? -9 : 9) + Math.sin(frame / 18) * 3}deg)`,
              background: "#ffffff",
              borderRadius: 26 * layout.u,
              padding: 12 * layout.u,
              boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
              border: `4px solid #ffffff`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4 * layout.u,
            }}
          >
            {st.asset ? (
              <AssetImg src={st.asset} style={{ width: size * 0.78, height: size * 0.78, objectFit: "contain" }} />
            ) : (
              <div style={{ fontSize: 54 * layout.u, lineHeight: 1 }}>{st.emoji || "⭐"}</div>
            )}
            {st.label ? (
              <span
                style={{
                  fontFamily: fontStack("display"),
                  fontWeight: 900,
                  fontSize: 20 * layout.u,
                  color: "#0f172a",
                  textTransform: "uppercase",
                  padding: "0 8px",
                }}
              >
                {st.label}
              </span>
            ) : null}
          </div>
        );
      })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================================================================
// MOTOR 5: vrs-news-highlight (Recorte de Jornal / Artigo com Marca-Texto Vox Style)
// ============================================================================

export const NewsHighlightScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();

  const t = frame / Math.max(1, durationInFrames);
  const enter = prog(frame, 0, 16, "out");
  const sweep = prog(frame, 18, 28, "out");
  const zoom = 0.96 + 0.08 * t;
  const tiltY = -6 + 10 * t;
  const tiltX = 4 - 5 * t;

  const cardW = Math.min(layout.w - layout.padX * 2, 1180 * layout.u);
  const cardH = layout.safeBottom - layout.padTop - (params.title ? 140 : 40) * layout.u;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 35%, #1e293b 0%, ${theme.background} 85%)`, overflow: "hidden" }}>
      <SceneHeader title={params.title ?? ""} />
      <div
        style={{
          position: "absolute",
          left: (layout.w - cardW) / 2,
          top: layout.padTop + (params.title ? 125 : 30) * layout.u,
          width: cardW,
          height: cardH,
          perspective: 1300 * layout.u,
          opacity: enter,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#f8f5eb",
            color: "#0f172a",
            borderRadius: 16 * layout.u,
            padding: `${32 * layout.u}px ${42 * layout.u}px`,
            boxShadow: "0 34px 70px rgba(0,0,0,0.68)",
            border: "2px solid #cbd5e1",
            transform: `rotateY(${tiltY}deg) rotateX(${tiltX}deg) scale(${zoom})`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* Cabeçalho de jornal / periódico */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "4px double #0f172a",
                paddingBottom: 10 * layout.u,
                marginBottom: 20 * layout.u,
                fontFamily: fontStack("serif"),
              }}
            >
              <span style={{ fontWeight: 900, fontSize: 24 * layout.u, letterSpacing: 1.5 }}>
                {params.sourceName || "BOLETIM CIENTÍFICO & DADOS"}
              </span>
              <span style={{ fontFamily: fontStack("mono"), fontSize: 16 * layout.u, color: "#475569", fontWeight: 700 }}>
                {params.publishDate || "RELATÓRIO OFICIAL"}
              </span>
            </div>

            {/* Manchete principal */}
            <div
              style={{
                fontFamily: fontStack("serif"),
                fontWeight: 900,
                fontSize: (layout.vertical ? 38 : 44) * layout.u,
                lineHeight: 1.12,
                color: "#0f172a",
                marginBottom: 22 * layout.u,
              }}
            >
              {params.headline || "Estudo revela impacto direto na retenção e clareza cognitiva"}
            </div>

            {/* Trecho grifado com marca-texto fluorescente */}
            <div
              style={{
                position: "relative",
                padding: `${16 * layout.u}px ${20 * layout.u}px`,
                borderRadius: 10 * layout.u,
                background: "rgba(15,23,42,0.04)",
                borderLeft: `6px solid #0f172a`,
                marginBottom: 18 * layout.u,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 12 * layout.u,
                  top: 10 * layout.u,
                  bottom: 10 * layout.u,
                  width: `${Math.round(sweep * 96)}%`,
                  background: "rgba(250, 204, 21, 0.72)",
                  borderRadius: 6 * layout.u,
                  transform: "skewX(-4deg)",
                }}
              />
              <div
                style={{
                  position: "relative",
                  fontFamily: fontStack("serif"),
                  fontWeight: 800,
                  fontSize: (layout.vertical ? 28 : 32) * layout.u,
                  lineHeight: 1.3,
                  color: "#0f172a",
                }}
              >
                “{params.highlightText || "A combinação de evidência visual e ritmo pausado eleva a compreensão em até 3x."}”
              </div>
            </div>
          </div>

          {/* Rodapé com texto de coluna + imagem opcional */}
          <div style={{ display: "flex", gap: 24 * layout.u, alignItems: "center" }}>
            <div
              style={{
                flex: 1,
                fontFamily: fontStack("serif"),
                fontSize: 22 * layout.u,
                lineHeight: 1.4,
                color: "#334155",
              }}
            >
              {params.bodySnippet || "Pesquisadores analisaram centenas de sessões práticas antes e depois da mudança estrutural."}
            </div>
            {params.image ? (
              <div
                style={{
                  width: 220 * layout.u,
                  height: 140 * layout.u,
                  borderRadius: 10 * layout.u,
                  overflow: "hidden",
                  border: "2px solid #0f172a",
                  flexShrink: 0,
                }}
              >
                <AssetImg src={params.image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// MOTOR 6: vrs-device-mockup (Mockup 2.5D de Celular / Navegador em Movimento)
// ============================================================================

export const DeviceMockupScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout } = useVrs();

  const t = frame / Math.max(1, durationInFrames);
  const enter = pop(frame, fps, 0, 14);
  const badgePop = pop(frame, fps, 18, 12);
  const isPhone = (params.deviceType ?? "phone") === "phone";

  const devW = (isPhone ? (layout.vertical ? 440 : 380) : layout.w * 0.72) * layout.u;
  const devH = (isPhone ? (layout.vertical ? 720 : 540) : layout.h * 0.56) * layout.u;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 30%, ${withAlpha(theme.accent2, 0.22)}, ${theme.background} 78%)` }}>
      <SceneHeader title={params.title ?? ""} align="center" />
      <div
        style={{
          position: "absolute",
          left: (layout.w - devW) / 2,
          top: layout.padTop + (params.title ? 125 : 40) * layout.u,
          width: devW,
          height: devH,
          perspective: 1200 * layout.u,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: (isPhone ? 42 : 20) * layout.u,
            background: "#0f172a",
            border: `${(isPhone ? 10 : 6) * layout.u}px solid #334155`,
            boxShadow: `0 30px 70px rgba(0,0,0,0.65), 0 0 40px ${withAlpha(theme.accent, 0.25)}`,
            transform: `scale(${0.9 + 0.1 * enter}) rotateY(${-8 + 16 * t}deg) rotateX(${4 - 6 * t}deg)`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Barra superior do dispositivo */}
          <div
            style={{
              height: 44 * layout.u,
              background: "#1e293b",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: `0 ${20 * layout.u}px`,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", gap: 6 * layout.u }}>
              <span style={{ width: 10 * layout.u, height: 10 * layout.u, borderRadius: 99, background: "#ef4444" }} />
              <span style={{ width: 10 * layout.u, height: 10 * layout.u, borderRadius: 99, background: "#f59e0b" }} />
              <span style={{ width: 10 * layout.u, height: 10 * layout.u, borderRadius: 99, background: "#22c55e" }} />
            </div>
            <span style={{ fontFamily: fontStack("sans"), fontWeight: 700, fontSize: 16 * layout.u, color: "#cbd5e1" }}>
              {params.appTitle || "Painel em Tempo Real"}
            </span>
            <span style={{ width: 24 * layout.u }} />
          </div>

          {/* Conteúdo rolante dentro da tela */}
          <div
            style={{
              flex: 1,
              padding: 24 * layout.u,
              display: "flex",
              flexDirection: "column",
              gap: 18 * layout.u,
              transform: `translateY(${-t * 36 * layout.u}px)`,
            }}
          >
            <div
              style={{
                background: `linear-gradient(135deg, ${withAlpha(theme.accent, 0.24)}, rgba(30,41,59,0.9))`,
                border: `2px solid ${theme.accent}`,
                borderRadius: 20 * layout.u,
                padding: 22 * layout.u,
              }}
            >
              <div style={{ fontFamily: fontStack("display"), fontWeight: 900, fontSize: 54 * layout.u, color: theme.accent }}>
                {params.metricValue || "+142%"}
              </div>
              <div style={{ fontFamily: fontStack("sans"), fontWeight: 700, fontSize: 22 * layout.u, color: "#f8fafc", marginTop: 4 * layout.u }}>
                {params.metricLabel || "Eficiência medida no fluxo"}
              </div>
            </div>

            {params.screenAsset ? (
              <div style={{ flex: 1, borderRadius: 16 * layout.u, overflow: "hidden", background: "#090d16" }}>
                <AssetImg src={params.screenAsset} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 * layout.u }}>
                {[0.82, 0.64, 0.91].map((wBar, idx) => (
                  <div
                    key={idx}
                    style={{
                      height: 36 * layout.u,
                      borderRadius: 10 * layout.u,
                      background: "rgba(255,255,255,0.06)",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      padding: `0 ${12 * layout.u}px`,
                    }}
                  >
                    <div
                      style={{
                        height: 14 * layout.u,
                        width: `${Math.round(wBar * prog(frame, 8 + idx * 8, 22, "out") * 100)}%`,
                        background: idx % 2 === 0 ? theme.accent2 : theme.accent,
                        borderRadius: 99,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notificação flutuante com mola */}
        {params.badge ? (
          <div
            style={{
              position: "absolute",
              right: -40 * layout.u,
              top: 48 * layout.u,
              transform: `scale(${badgePop})`,
              background: "#10b981",
              color: "#052e16",
              padding: `${12 * layout.u}px ${22 * layout.u}px`,
              borderRadius: 999,
              fontFamily: fontStack("rounded"),
              fontWeight: 900,
              fontSize: 22 * layout.u,
              boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
              border: "3px solid #ffffff",
            }}
          >
            {params.badge}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// MOTOR 7: vrs-video-broll (Vídeo B-Roll Real + Avatar Reagindo Picture-in-Picture)
// ============================================================================

export const VideoBrollScene: React.FC<{ params: Any }> = ({ params }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { theme, layout, words, narration } = useVrs();

  const speech = computeSpeechState(frame, fps, words, narration || params.caption || params.title || "broll");
  const t = frame / Math.max(1, durationInFrames);
  const pipPos = params.pipPosition ?? "bottom-right";
  const pipSize = (layout.vertical ? 230 : 250) * layout.u;

  return (
    <AbsoluteFill style={{ background: "#050811", overflow: "hidden" }}>
      {/* Fundo em movimento (Imagem/Frame de arquivo ou grade cinematográfica HUD) */}
      <AbsoluteFill
        style={{
          transform: `scale(${1.05 + 0.08 * t})`,
          background: `radial-gradient(circle at ${50 + Math.sin(t * 4) * 15}% 45%, ${withAlpha(theme.accent2, 0.28)}, #050811 75%)`,
        }}
      >
        {params.videoAsset && /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(params.videoAsset) ? (
          <AssetImg src={params.videoAsset} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
        {/* Grade HUD documental */}
        <svg viewBox="0 0 1920 1080" style={{ width: "100%", height: "100%", opacity: 0.24 }}>
          <line x1={960} y1={120} x2={960} y2={960} stroke={theme.accent2} strokeWidth={2} strokeDasharray="12 12" />
          <line x1={180} y1={540} x2={1740} y2={540} stroke={theme.accent2} strokeWidth={2} strokeDasharray="12 12" />
          <circle cx={960} cy={540} r={180 + Math.sin(t * 6) * 25} fill="none" stroke={theme.accent} strokeWidth={3} />
        </svg>
      </AbsoluteFill>

      <SceneHeader title={params.title ?? ""} />

      {/* Selo REC / B-Roll no canto superior */}
      {params.caption ? (
        <div
          style={{
            position: "absolute",
            left: layout.padX,
            top: layout.padTop + (params.title ? 130 : 20) * layout.u,
          }}
        >
          <Tag text={`● ${params.caption}`} delay={4} />
        </div>
      ) : null}

      {/* Moldura Picture-in-Picture (PiP) com Avatar Reativo */}
      {params.pipAvatar ? (
        <div
          style={{
            position: "absolute",
            right: pipPos.includes("right") ? layout.padX : undefined,
            left: pipPos.includes("left") ? layout.padX : undefined,
            top: pipPos.includes("top") ? layout.padTop + 120 * layout.u : layout.safeBottom - pipSize - 30 * layout.u,
            width: pipSize,
            height: pipSize,
            borderRadius: 999,
            background: "#0f172a",
            border: `${6 * layout.u}px solid ${speech.talking ? theme.accent : theme.accent2}`,
            boxShadow: speech.talking
              ? `0 0 ${28 * layout.u}px ${withAlpha(theme.accent, 0.8)}, 0 16px 36px rgba(0,0,0,0.65)`
              : "0 16px 36px rgba(0,0,0,0.65)",
            overflow: "hidden",
            transform: `scale(${1 + (speech.talking ? speech.syllablePulse * 0.06 : 0)})`,
          }}
        >
          <AssetImg src={params.pipAvatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
