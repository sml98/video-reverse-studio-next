// Curvas nomeadas com a mesma semântica em todos os componentes e no motor de keyframes.
import { Easing, interpolate, spring } from "remotion";

export type EasingName = "linear" | "smooth" | "in" | "out" | "back" | "spring" | "cinematic" | "elastic" | "steps";

const back = Easing.bezier(0.34, 1.56, 0.64, 1);
const cinematic = Easing.bezier(0.7, 0, 0.2, 1);
const smooth = Easing.bezier(0.45, 0, 0.55, 1);

export function ease(name: EasingName, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (name) {
    case "linear":
      return x;
    case "in":
      return Easing.in(Easing.cubic)(x);
    case "out":
      return Easing.out(Easing.cubic)(x);
    case "back":
      return back(x);
    case "cinematic":
      return cinematic(x);
    case "elastic":
      return x === 0 || x === 1 ? x : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    case "steps":
      return Math.floor(x * 4) / 4;
    case "spring":
      // Mola criticamente amortecida aproximada (determinística, independente de fps).
      return 1 - Math.exp(-6 * x) * Math.cos(x * 7.5);
    case "smooth":
    default:
      return smooth(x);
  }
}

/** Progresso 0→1 entre dois frames com curva nomeada. */
export function prog(frame: number, start: number, dur: number, curve: EasingName = "smooth"): number {
  if (dur <= 0) return frame >= start ? 1 : 0;
  return ease(curve, (frame - start) / dur);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function pop(frame: number, fps: number, delay = 0, damping = 12): number {
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 160, mass: 0.7 } });
}

export type Kf = { frame: number; value: number; easing?: EasingName };

/** Interpola keyframes ordenados; fora do intervalo mantém extremos. */
export function sampleKeyframes(kfs: Kf[] | undefined, frame: number, fallback: number): number {
  if (!kfs || kfs.length === 0) return fallback;
  if (frame <= kfs[0].frame) return kfs[0].value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      const t = (frame - a.frame) / Math.max(1, b.frame - a.frame);
      return lerp(a.value, b.value, ease(b.easing ?? "smooth", t));
    }
  }
  return kfs[kfs.length - 1].value;
}

export { interpolate };
