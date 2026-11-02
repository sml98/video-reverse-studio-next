import { describe, expect, it } from "vitest";
import {
  activeWordIndex,
  anchorToFrames,
  groupWords,
  msToFrameEnd,
  msToFrameStart,
  normalizeToken,
  resolveAnchor,
  validateWords,
  visibleGroup,
  Word,
  WordTimingError,
} from "../src/remotion/core/words";

const SAMPLE: Word[] = [
  { id: "w0", word: "Sol,", start: 100, end: 420 },
  { id: "w1", word: "calor", start: 420, end: 810 },
  { id: "w2", word: "e", start: 810, end: 930 },
  { id: "w3", word: "mais", start: 1450, end: 1750 }, // pausa de 520ms antes
  { id: "w4", word: "sol!", start: 1750, end: 2150 },
  { id: "w5", word: "Ação.", start: 2200, end: 2680 },
];

describe("WordAnchor & ViralCaptions — Contrato Temporal em ms", () => {
  it("normaliza maiúsculas, acentos e pontuação sem perder letras", () => {
    expect(normalizeToken("Sol!")).toBe("sol");
    expect(normalizeToken("Ação.")).toBe("acao");
    expect(normalizeToken("«Samhain»")).toBe("samhain");
  });

  it("resolve gatilho por palavra, ocorrência base 1 e spanWords", () => {
    const firstSol = resolveAnchor(SAMPLE, { triggerWord: "sol", occurrence: 1, spanWords: 2 });
    expect(firstSol).toEqual({ startIndex: 0, endIndex: 1, startMs: 100, endMs: 810 });

    const secondSol = resolveAnchor(SAMPLE, { triggerWord: "SOL", occurrence: 2, spanWords: 1 });
    expect(secondSol).toEqual({ startIndex: 4, endIndex: 4, startMs: 1750, endMs: 2150 });

    const acao = resolveAnchor(SAMPLE, { triggerWord: "acao", occurrence: 1 });
    expect(acao.startIndex).toBe(5);
    expect(acao.startMs).toBe(2200);
  });

  it("resolve por wordId estável e acompanha mudança de tempos do áudio sem editar código", () => {
    const before = resolveAnchor(SAMPLE, { wordId: "w3", spanWords: 2 });
    expect(before.startMs).toBe(1450);
    expect(before.endMs).toBe(2150);

    // Simula re-síntese de voz com novos tempos em ms
    const shifted = SAMPLE.map((w) => ({ ...w, start: w.start + 350, end: w.end + 350 }));
    const after = resolveAnchor(shifted, { wordId: "w3", spanWords: 2 });
    expect(after.startMs).toBe(1800);
    expect(after.endMs).toBe(2500);
  });

  it("converte ms para quadros corretamente em 24, 30 e 60 fps (start arredonda p/ baixo, end p/ cima)", () => {
    const resolved = resolveAnchor(SAMPLE, { triggerWord: "calor", occurrence: 1 });
    for (const fps of [24, 30, 60]) {
      const f = anchorToFrames(resolved, fps, fps * 5);
      expect(f.from).toBe(msToFrameStart(420, fps));
      expect(f.from + f.durationInFrames).toBe(msToFrameEnd(810, fps));
      expect(f.durationInFrames).toBeGreaterThanOrEqual(1);
    }
  });

  it("destaca exatamente uma palavra ativa por vez em [start, end) e retorna -1 nas pausas", () => {
    expect(activeWordIndex(SAMPLE, 50)).toBe(-1);
    expect(activeWordIndex(SAMPLE, 100)).toBe(0);
    expect(activeWordIndex(SAMPLE, 419)).toBe(0);
    expect(activeWordIndex(SAMPLE, 420)).toBe(1);
    // Pausa entre 930ms e 1450ms
    expect(activeWordIndex(SAMPLE, 1100)).toBe(-1);
    expect(activeWordIndex(SAMPLE, 1450)).toBe(3);
  });

  it("agrupa palavras respeitando pausas e pontuação final", () => {
    const groups = groupWords(SAMPLE, 3, 450);
    expect(groups.length).toBe(3);
    expect(groups[0].words.map((w) => w.word)).toEqual(["Sol,", "calor", "e"]);
    expect(groups[1].words.map((w) => w.word)).toEqual(["mais", "sol!"]); // quebrou em '!'
    expect(groups[2].words.map((w) => w.word)).toEqual(["Ação."]);
    expect(visibleGroup(groups, 500)?.startIndex).toBe(0);
    expect(visibleGroup(groups, 1800)?.startIndex).toBe(3);
  });

  it("lança WordTimingError claro para gatilhos inexistentes, ocorrência 0, span inválido ou IDs duplicados", () => {
    expect(() => resolveAnchor(SAMPLE, { triggerWord: "inexistente" })).toThrow(WordTimingError);
    expect(() => resolveAnchor(SAMPLE, { triggerWord: "sol", occurrence: 0 })).toThrow(WordTimingError);
    expect(() => resolveAnchor(SAMPLE, { triggerWord: "sol", occurrence: 3 })).toThrow(WordTimingError);
    expect(() => resolveAnchor(SAMPLE, { triggerWord: "acao", spanWords: 2 })).toThrow(WordTimingError);
    expect(() =>
      validateWords([
        { id: "dup", word: "a", start: 0, end: 100 },
        { id: "dup", word: "b", start: 100, end: 200 },
      ]),
    ).toThrow(WordTimingError);
    expect(() => validateWords([{ id: "x", word: "a", start: 300, end: 100 }])).toThrow(WordTimingError);
  });
});
