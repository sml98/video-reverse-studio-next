import React from "react";
import { Composition, registerRoot } from "remotion";
import { Film, SceneOnly, totalFrames, type FilmProps, type SceneOnlyProps } from "./Film";
import { DEMO_PLAN } from "./demo";

const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="VrsFilm"
      component={Film as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={totalFrames(DEMO_PLAN)}
      fps={DEMO_PLAN.fps}
      width={DEMO_PLAN.width}
      height={DEMO_PLAN.height}
      defaultProps={{ plan: DEMO_PLAN, assetUrls: {}, withAudio: false } as FilmProps as unknown as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const p = props as unknown as FilmProps;
        return { durationInFrames: totalFrames(p.plan), fps: p.plan.fps, width: p.plan.width, height: p.plan.height };
      }}
    />
    <Composition
      id="VrsScene"
      component={SceneOnly as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={DEMO_PLAN.scenes[0].durationInFrames}
      fps={DEMO_PLAN.fps}
      width={DEMO_PLAN.width}
      height={DEMO_PLAN.height}
      defaultProps={{ plan: DEMO_PLAN, sceneId: DEMO_PLAN.scenes[0].id, assetUrls: {} } as SceneOnlyProps as unknown as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const p = props as unknown as SceneOnlyProps;
        const s = p.plan.scenes.find((x) => x.id === p.sceneId);
        if (!s) throw new Error(`Cena não encontrada: ${p.sceneId}`);
        return { durationInFrames: s.durationInFrames, fps: p.plan.fps, width: p.plan.width, height: p.plan.height };
      }}
    />
  </>
);

registerRoot(RemotionRoot);
