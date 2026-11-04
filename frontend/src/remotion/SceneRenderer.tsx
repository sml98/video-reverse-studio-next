import React from "react";
import {HypitWordAnchorLayer,WordMotionWrap} from "./HypitEffects";
import {PandoraCutoutScene} from "./scenes/PandoraCutout";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { FilmPlan, PlanScene } from "../contracts/plan";
import { SCENE_SPECS, defaultsFor } from "../contracts/plan";
import { RENDERCOMP_COMPONENTS } from "./rendercomp/registry.generated";
import { ease } from "./core/easing";
import { ThemeProvider, fontStack, makeLayout, withAlpha, type Ctx } from "./core/theme";
import { ViralCaptions } from "./ViralCaptions";
import { CalcScene, BarChartScene, ComparisonScene, LineChartScene } from "./scenes/data";
import { MapRouteScene, MechanismScene, StepsScene, TimelineScene } from "./scenes/explain";
import { CustomLayersScene, DocMontageScene, ObjectStageScene, ParallaxPhotoScene, Stage3DScene, StoryPanelScene } from "./scenes/media";
import {
  DeviceMockupScene,
  MultiplaneStageScene,
  NewsHighlightScene,
  RobloxStageScene,
  SouthParkStageScene,
  StickmanStageScene,
  VideoBrollScene,
} from "./scenes/characters";
import { CodeWalkthroughScene, CtaScene, MemeScene, QuoteScene, StatScene, TitleScene } from "./scenes/text";

const OWN: Record<string, React.FC<{ params: Record<string, any> }>> = {
  "vrs-pandora-cutout": PandoraCutoutScene,
  "vrs-title": TitleScene,
  "vrs-kinetic-quote": QuoteScene,
  "vrs-timeline": TimelineScene,
  "vrs-mechanism": MechanismScene,
  "vrs-bar-chart": BarChartScene,
  "vrs-line-chart": LineChartScene,
  "vrs-calc": CalcScene,
  "vrs-comparison": ComparisonScene,
  "vrs-steps": StepsScene,
  "vrs-map-route": MapRouteScene,
  "vrs-doc-montage": DocMontageScene,
  "vrs-story-panel": StoryPanelScene,
  "vrs-meme": MemeScene,
  "vrs-cta": CtaScene,
  "vrs-stat": StatScene,
  "vrs-object-stage": ObjectStageScene,
  "vrs-3d-stage": Stage3DScene,
  "vrs-parallax-photo": ParallaxPhotoScene,
  "vrs-code-walkthrough": CodeWalkthroughScene,
  "vrs-stickman-stage": StickmanStageScene,
  "vrs-southpark-stage": SouthParkStageScene,
  "vrs-roblox-stage": RobloxStageScene,
  "vrs-multiplane-stage": MultiplaneStageScene,
  "vrs-news-highlight": NewsHighlightScene,
  "vrs-device-mockup": DeviceMockupScene,
  "vrs-video-broll": VideoBrollScene,
};

export const KNOWN_COMPONENTS = new Set<string>([...Object.keys(OWN), "vrs-custom", ...Object.keys(RENDERCOMP_COMPONENTS)]);

/** Adapta uma cena RenderComp (tamanho nativo fixo) ao quadro do filme sem modificá-la. */
const RenderCompAdapter: React.FC<{ id: string; params: Record<string, any>; background: string }> = ({ id, params, background }) => {
  const { width, height } = useVideoConfig();
  const spec = SCENE_SPECS[id];
  const Comp = RENDERCOMP_COMPONENTS[id];
  const nw = spec?.nativeWidth ?? 1920;
  const nh = spec?.nativeHeight ?? 1080;
  const scale = Math.min(width / nw, height / nh);
  const props = { ...defaultsFor(spec), ...params };
  return (
    <AbsoluteFill style={{ background: (props as any).background ?? background, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: nw, height: nh, transform: `scale(${scale})`, flexShrink: 0, position: "relative" }}>
        <Comp {...props} />
      </div>
    </AbsoluteFill>
  );
};

/** Revelação de entrada e cobertura de saída pela mesma cor => transição contínua entre cenas renderizadas separadamente. */
const TransitionWrap: React.FC<{ scene: PlanScene; color: string; children: React.ReactNode }> = ({ scene, color, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const tin = scene.transitionIn;
  const tout = scene.transitionOut;
  const inP = tin.type === "none" || tin.durationInFrames === 0 ? 1 : ease("cinematic", frame / tin.durationInFrames);
  const outStart = durationInFrames - tout.durationInFrames;
  const outP = tout.type === "none" || tout.durationInFrames === 0 ? 0 : ease("cinematic", (frame - outStart) / tout.durationInFrames);
  const c = tin.color || color;
  const style: React.CSSProperties = {};
  let overlay: React.ReactNode = null;
  if (tin.type === "fade") style.opacity = inP;
  if (tin.type === "zoom") {
    style.transform = `scale(${1.15 - 0.15 * inP})`;
    style.opacity = inP;
  }
  if (tin.type === "slide") style.transform = `translateX(${(1 - inP) * width * 0.25}px)`;
  if (tin.type === "wipe" && inP < 1) overlay = <AbsoluteFill style={{ background: c, transform: `translateX(${inP * 100}%)` }} />;
  if (tin.type === "circle" && inP < 1) style.clipPath = `circle(${inP * Math.hypot(width, height) * 0.6}px at 50% 50%)`;
  if (tin.type === "flash" && inP < 1) overlay = <AbsoluteFill style={{ background: "#ffffff", opacity: 1 - inP }} />;
  let outOverlay: React.ReactNode = null;
  if (outP > 0) {
    if (tout.type === "wipe") outOverlay = <AbsoluteFill style={{ background: tout.color || color, transform: `translateX(${(outP - 1) * 100}%)` }} />;
    else outOverlay = <AbsoluteFill style={{ background: tout.color || color, opacity: outP }} />;
  }
  return (
    <AbsoluteFill style={{ background: c }}>
      <AbsoluteFill style={style}>{children}</AbsoluteFill>
      {overlay}
      {outOverlay}
    </AbsoluteFill>
  );
};

/** Camada global de acabamento óptico (vinheta sutil, barra de retenção por capítulos e lower-third de fonte). */
const PostFXOverlay: React.FC<{ plan: FilmPlan; scene: PlanScene }> = ({ plan, scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;

  // Calcula progresso global do vídeo até o quadro atual desta cena
  let beforeFrames = 0;
  let sceneIndex = 0;
  const totalFrames = Math.max(1, plan.scenes.reduce((a, s) => a + s.durationInFrames, 0));
  for (let i = 0; i < plan.scenes.length; i++) {
    if (plan.scenes[i].id === scene.id) {
      sceneIndex = i;
      break;
    }
    beforeFrames += plan.scenes[i].durationInFrames;
  }
  const globalPct = Math.min(100, Math.max(0, ((beforeFrames + frame) / totalFrames) * 100));
  const srcItem = plan.sources && plan.sources.length > 0 ? plan.sources[sceneIndex % plan.sources.length] : null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Vinheta óptica suave */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at 50% 50%, transparent 64%, rgba(0,0,0,0.34) 100%)",
        }}
      />

      {/* Barra superior de progresso / capítulos de retenção */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: Math.max(4, Math.round(6 * u)),
          background: "rgba(255,255,255,0.12)",
          display: "flex",
        }}
      >
        <div
          style={{
            width: `${globalPct.toFixed(2)}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${plan.theme.accent}, ${plan.theme.accent2})`,
          }}
        />
      </div>

      {/* Lower-third discreto de citação/fonte quando o projeto declara sources */}
      {srcItem && frame > 18 && frame < scene.durationInFrames - 12 ? (
        <div
          style={{
            position: "absolute",
            left: Math.round(width * 0.05),
            bottom: Math.round(height * 0.035),
            background: "rgba(8, 12, 24, 0.72)",
            borderLeft: `${3 * u}px solid ${plan.theme.accent}`,
            padding: `${4 * u}px ${12 * u}px`,
            borderRadius: 6 * u,
            fontFamily: fontStack("mono"),
            fontSize: Math.max(11, Math.round(15 * u)),
            color: withAlpha(plan.theme.foreground, 0.85),
          }}
        >
          Fonte: {srcItem.source}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Destaque palavra a palavra só com tempos derivados do áudio; distribuição proporcional => legenda por frase. */
export function captionMode(requested: "word" | "phrase" | "off", timing: PlanScene["timing"]): "word" | "phrase" | "off" {
  if (requested !== "word") return requested;
  return timing === "tts_phonemes" || timing === "forced_aligned" || timing === "asr_estimated" ? "word" : "phrase";
}

export type SceneRendererProps = { plan: FilmPlan; scene: PlanScene; assetUrls: Record<string, string> };

export const SceneRenderer: React.FC<SceneRendererProps> = ({ plan, scene, assetUrls }) => {
  const { width, height } = useVideoConfig();
  const captionsOn = plan.captions.enabled && plan.captions.mode !== "off" && scene.words.length > 0;
  const ctx: Ctx = {
    theme: plan.theme,
    layout: makeLayout(width, height, captionsOn),
    assetUrl: (rel) => {
      if (!rel) return "";
      const u = assetUrls[rel];
      if (!u) throw new Error(`Recurso não resolvido na cena ${scene.id}: ${rel}`);
      return u;
    },
    captionsOn,
    words: scene.words,
    narration: scene.narration,
  };
  const spec = SCENE_SPECS[scene.component];
  if (!spec || !KNOWN_COMPONENTS.has(scene.component)) throw new Error(`Componente desconhecido: ${scene.component}`);
  const params = { ...defaultsFor(spec), ...scene.params };
  let body: React.ReactNode;
  if (scene.component === "vrs-custom") body = <CustomLayersScene params={params} layers={scene.layers} />;
  else if (scene.component.startsWith("rc-")) body = <RenderCompAdapter id={scene.component} params={scene.params} background={plan.theme.background} />;
  else {
    const C = OWN[scene.component];
    body = <C params={params} />;
  }
  return (
    <ThemeProvider value={ctx}>
      <TransitionWrap scene={scene} color={plan.theme.background}>
        <WordMotionWrap scene={scene}>{body}</WordMotionWrap>
        <HypitWordAnchorLayer plan={plan} scene={scene} assetUrls={assetUrls}/>
      </TransitionWrap>
      <PostFXOverlay plan={plan} scene={scene} />
      {captionsOn ? (
        <ViralCaptions
          words={scene.words}
          mode={captionMode(plan.captions.mode, scene.timing)}
          maxWords={plan.captions.maxWords}
          position={plan.captions.position}
          highlight={plan.captions.highlight}
          color={plan.theme.foreground}
          stylePreset={(plan.captions as any).style || "hormozi"}
          precision={scene.timing}
        />
      ) : null}
    </ThemeProvider>
  );
};
