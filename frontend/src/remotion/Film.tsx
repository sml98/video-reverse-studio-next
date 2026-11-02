import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import type { FilmPlan } from "../contracts/plan";
import { SceneRenderer } from "./SceneRenderer";
import { FontGate } from "./core/theme";

export type FilmProps = {
  plan: FilmPlan;
  assetUrls: Record<string, string>;
  /** Player: toca a narração/música; MP4: áudio é mixado pelo FFmpeg (false). */
  withAudio?: boolean;
  audioUrls?: { narration?: string; music?: string };
};

/** Filme completo = sequência das mesmas cenas usadas no render por cena. */
export const Film: React.FC<FilmProps> = ({ plan, assetUrls, withAudio, audioUrls }) => {
  let from = 0;
  return (
    <FontGate>
      <AbsoluteFill style={{ background: plan.theme.background }}>
        {plan.scenes.map((s) => {
          const el = (
            <Sequence key={s.id} from={from} durationInFrames={s.durationInFrames} name={s.id}>
              <SceneRenderer plan={plan} scene={s} assetUrls={assetUrls} />
            </Sequence>
          );
          from += s.durationInFrames;
          return el;
        })}
        {withAudio && audioUrls?.narration ? <Audio src={audioUrls.narration} /> : null}
        {withAudio && audioUrls?.music ? <Audio src={audioUrls.music} volume={plan.audio.musicVolume} loop /> : null}
      </AbsoluteFill>
    </FontGate>
  );
};

export type SceneOnlyProps = { plan: FilmPlan; sceneId: string; assetUrls: Record<string, string> };

/** Uma cena isolada (cache por cena no MP4). */
export const SceneOnly: React.FC<SceneOnlyProps> = ({ plan, sceneId, assetUrls }) => {
  const scene = plan.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`Cena não encontrada: ${sceneId}`);
  return (
    <FontGate>
      <AbsoluteFill style={{ background: plan.theme.background }}>
        <SceneRenderer plan={plan} scene={scene} assetUrls={assetUrls} />
      </AbsoluteFill>
    </FontGate>
  );
};

export function totalFrames(plan: FilmPlan): number {
  return plan.scenes.reduce((a, s) => a + s.durationInFrames, 0);
}
