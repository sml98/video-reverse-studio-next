import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { FilmPlan, PlanScene } from "../contracts/plan";
import { SCENE_SPECS, defaultsFor } from "../contracts/plan";
import { RENDERCOMP_COMPONENTS } from "./rendercomp/registry.generated";
import { ease } from "./core/easing";
import { ThemeProvider, makeLayout, type Ctx } from "./core/theme";
import { ViralCaptions } from "./ViralCaptions";
import { CalcScene, BarChartScene, ComparisonScene, LineChartScene } from "./scenes/data";
import { MapRouteScene, MechanismScene, StepsScene, TimelineScene } from "./scenes/explain";
import { CustomLayersScene, DocMontageScene, ObjectStageScene, StoryPanelScene } from "./scenes/media";
import { CtaScene, MemeScene, QuoteScene, StatScene, TitleScene } from "./scenes/text";

const OWN: Record<string, React.FC<{ params: Record<string, any> }>> = {
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
        {body}
      </TransitionWrap>
      {captionsOn ? <ViralCaptions words={scene.words} mode={captionMode(plan.captions.mode, scene.timing)} maxWords={plan.captions.maxWords} position={plan.captions.position} highlight={plan.captions.highlight} color={plan.theme.foreground} precision={scene.timing} /> : null}
    </ThemeProvider>
  );
};
