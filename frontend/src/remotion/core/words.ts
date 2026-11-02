// Contrato temporal canônico em milissegundos (vrs.words/1).
// Funções puras: usadas por WordAnchor, ViralCaptions, Player e MP4.

export type Word = { id: string; word: string; start: number; end: number };

export class WordTimingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WordTimingError";
  }
}

/** Normaliza caixa, acentos e pontuação para comparar gatilhos. */
export function normalizeToken(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Valida tempos finitos, ordenados e IDs únicos. Lança erro claro. */
export function validateWords(words: Word[]): void {
  const ids = new Set<string>();
  let prevStart = -Infinity;
  words.forEach((w, i) => {
    if (!w || typeof w.word !== "string" || !w.word.trim()) throw new WordTimingError(`Palavra #${i} vazia.`);
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end)) throw new WordTimingError(`Palavra "${w.word}" com tempo não finito.`);
    if (w.start < 0 || w.end <= w.start) throw new WordTimingError(`Palavra "${w.word}": intervalo inválido [${w.start}, ${w.end}).`);
    if (w.start < prevStart) throw new WordTimingError(`Palavra "${w.word}" fora de ordem.`);
    if (ids.has(w.id)) throw new WordTimingError(`ID de palavra duplicado: ${w.id}`);
    ids.add(w.id);
    prevStart = w.start;
  });
}

export type AnchorQuery = {
  triggerWord?: string;
  /** Ocorrência base 1 do gatilho normalizado. */
  occurrence?: number;
  /** Quantas palavras a âncora cobre a partir do gatilho (>=1). */
  spanWords?: number;
  /** Alternativa estável ao gatilho textual. */
  wordId?: string;
};

export type ResolvedAnchor = { startIndex: number; endIndex: number; startMs: number; endMs: number };

export function resolveAnchor(words: Word[], q: AnchorQuery): ResolvedAnchor {
  validateWords(words);
  const span = q.spanWords ?? 1;
  if (!Number.isInteger(span) || span < 1) throw new WordTimingError(`spanWords inválido: ${q.spanWords}`);
  let idx = -1;
  if (q.wordId) {
    idx = words.findIndex((w) => w.id === q.wordId);
    if (idx < 0) throw new WordTimingError(`wordId não encontrado: ${q.wordId}`);
  } else {
    const target = normalizeToken(q.triggerWord ?? "");
    if (!target) throw new WordTimingError("triggerWord vazio.");
    const occ = q.occurrence ?? 1;
    if (!Number.isInteger(occ) || occ < 1) throw new WordTimingError(`occurrence precisa ser inteiro base 1: ${q.occurrence}`);
    let seen = 0;
    for (let i = 0; i < words.length; i++) {
      if (normalizeToken(words[i].word) === target) {
        seen++;
        if (seen === occ) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) throw new WordTimingError(`Gatilho "${q.triggerWord}" (ocorrência ${occ}) ausente na narração.`);
  }
  const endIndex = idx + span - 1;
  if (endIndex >= words.length) throw new WordTimingError(`spanWords=${span} ultrapassa o fim da narração.`);
  return { startIndex: idx, endIndex, startMs: words[idx].start, endMs: words[endIndex].end };
}

/** Início arredondado para baixo. */
export function msToFrameStart(ms: number, fps: number): number {
  return Math.floor((ms * fps) / 1000 + 1e-9);
}
/** Fim arredondado para cima. */
export function msToFrameEnd(ms: number, fps: number): number {
  return Math.ceil((ms * fps) / 1000 - 1e-9);
}

export function anchorToFrames(a: ResolvedAnchor, fps: number, durationInFrames: number): { from: number; durationInFrames: number } {
  const from = Math.min(Math.max(0, msToFrameStart(a.startMs, fps)), Math.max(0, durationInFrames - 1));
  const end = Math.min(durationInFrames, Math.max(from + 1, msToFrameEnd(a.endMs, fps)));
  return { from, durationInFrames: end - from };
}

/** Palavra ativa no instante `ms`, com intervalos [start, end). Pausas => -1. */
export function activeWordIndex(words: Word[], ms: number): number {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid];
    if (ms < w.start) hi = mid - 1;
    else if (ms >= w.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export type CaptionGroup = { words: Word[]; startIndex: number; start: number; end: number };

/** Agrupa 2–4 palavras, quebrando em pontuação forte e pausas longas. */
export function groupWords(words: Word[], maxWords = 3, pauseMs = 450): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  let cur: Word[] = [];
  let curStart = 0;
  const flush = () => {
    if (cur.length) groups.push({ words: cur, startIndex: curStart, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  words.forEach((w, i) => {
    if (cur.length === 0) curStart = i;
    else {
      const prev = cur[cur.length - 1];
      if (w.start - prev.end > pauseMs || cur.length >= maxWords) {
        flush();
        curStart = i;
      }
    }
    cur.push(w);
    if (/[.!?;:]$/.test(w.word) && cur.length >= 1) flush();
  });
  flush();
  return groups;
}

/** Grupo visível no instante: do início do grupo até o início do próximo (ou fim + 250 ms). */
export function visibleGroup(groups: CaptionGroup[], ms: number, holdMs = 250): CaptionGroup | null {
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const next = groups[i + 1];
    const until = next ? Math.min(next.start, g.end + 900) : g.end + holdMs;
    if (ms >= g.start && ms < Math.max(g.end, until)) return g;
  }
  return null;
}
