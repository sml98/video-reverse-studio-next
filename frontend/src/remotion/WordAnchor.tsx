import React, { useMemo } from "react";
import { Sequence, useVideoConfig } from "remotion";
import { anchorToFrames, resolveAnchor, type AnchorQuery, type Word } from "./core/words";

export type WordAnchorProps = AnchorQuery & {
  words: Word[];
  children: React.ReactNode;
  /** Frames extras após o fim da âncora (limitado à composição). */
  holdFrames?: number;
  name?: string;
};

/**
 * Sincroniza um efeito a uma palavra da narração final.
 * Gatilho ausente, span inválido, IDs duplicados ou tempos inválidos lançam erro claro
 * (o render falha em vez de substituir silenciosamente).
 */
export const WordAnchor: React.FC<WordAnchorProps> = ({ words, triggerWord, occurrence, spanWords, wordId, children, holdFrames = 0, name }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const seq = useMemo(() => {
    const a = resolveAnchor(words, { triggerWord, occurrence, spanWords, wordId });
    const f = anchorToFrames(a, fps, durationInFrames);
    return { from: f.from, durationInFrames: Math.min(durationInFrames - f.from, f.durationInFrames + holdFrames) };
  }, [words, triggerWord, occurrence, spanWords, wordId, fps, durationInFrames, holdFrames]);
  return (
    <Sequence from={seq.from} durationInFrames={seq.durationInFrames} name={name ?? `anchor:${triggerWord ?? wordId}`} layout="none">
      {children}
    </Sequence>
  );
};
