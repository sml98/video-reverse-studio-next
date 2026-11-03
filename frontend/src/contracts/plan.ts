// Contrato TypeScript/Zod do FilmPlan (vrs.filmplan/1), alinhado a backend/vrs/contracts.py.
// Os parâmetros de cada cena são validados por esquemas Zod gerados da MESMA
// especificação JSON lida pelo Python (scene-specs.json / rendercomp-registry.json).
import { z } from "zod";
import specs from "./scene-specs.json";
import rc from "./rendercomp-registry.json";

const color = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
const easing = z.enum(["linear", "smooth", "in", "out", "back", "spring", "cinematic", "elastic", "steps"]);

export const WordSchema = z.object({ id: z.string().min(1).max(64), word: z.string().min(1).max(80), start: z.number().int().min(0), end: z.number().int().min(0) }).strict().refine((w) => w.end > w.start, "end > start");

export const KeyframeSchema = z.object({ frame: z.number().int().min(0), value: z.number().finite(), easing: easing.default("smooth") }).strict();
const animProp = z.enum(["x", "y", "scale", "scaleX", "scaleY", "rotate", "opacity", "progress", "blur"]);

export const LayerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_\-]{0,63}$/),
    type: z.enum(["group", "text", "image", "rect", "circle", "path", "arrow"]),
    parent: z.string().nullable().default(null),
    x: z.number().default(0),
    y: z.number().default(0),
    w: z.number().default(100),
    h: z.number().default(100),
    pivotX: z.number().min(0).max(1).default(0.5),
    pivotY: z.number().min(0).max(1).default(0.5),
    text: z.string().max(400).default(""),
    src: z.string().max(400).default(""),
    d: z.string().max(4000).regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s\-+]*$/).default(""),
    fill: z.union([color, z.literal("")]).default("#ffffff"),
    stroke: z.union([color, z.literal("")]).default(""),
    strokeWidth: z.number().min(0).max(200).default(0),
    fontSize: z.number().positive().max(600).default(48),
    fontWeight: z.number().int().min(100).max(900).default(700),
    radius: z.number().min(0).default(0),
    animations: z.partialRecord(animProp, z.array(KeyframeSchema)).default({}),
  })
  .strict();

const transitionType = z.enum(["none", "fade", "wipe", "slide", "zoom", "circle", "flash"]);
export const TransitionSchema = z.object({ type: transitionType.default("fade"), durationInFrames: z.number().int().min(0).max(90).default(12), color: z.string().default("") }).strict();

export const PlanSceneSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_\-]{0,63}$/),
    component: z.string().min(1).max(80),
    params: z.record(z.string(), z.any()).default({}),
    durationInFrames: z.number().int().positive(),
    narration: z.string().max(2000).default(""),
    voice: z.string().max(40).default(""),
    words: z.array(WordSchema).default([]),
    timing: z.enum(["user_text", "proportional", "tts_phonemes", "asr_estimated", "forced_aligned", "none"]).default("none"),
    assets: z.record(z.string(), z.string()).default({}),
    layers: z.array(LayerSchema).max(80).default([]),
    transitionIn: TransitionSchema.default({ type: "fade", durationInFrames: 12, color: "" }),
    transitionOut: TransitionSchema.default({ type: "none", durationInFrames: 0, color: "" }),
    sfx: z.array(z.record(z.string(), z.any())).max(8).default([]),
    notes: z.string().max(1000).default(""),
  })
  .strict();

export const ThemeSchema = z
  .object({
    background: color.default("#0b1020"),
    foreground: color.default("#f5f7ff"),
    accent: color.default("#ffb02e"),
    accent2: color.default("#5ad1ff"),
    muted: color.default("#8a93b8"),
    font: z.enum(["sans", "serif", "display", "mono", "rounded"]).default("sans"),
    visualLanguage: z.string().max(40).default("motion-graphics"),
  })
  .strict();

export const FilmPlanSchema = z
  .object({
    schema: z.literal("vrs.filmplan/1").default("vrs.filmplan/1"),
    title: z.string().min(1).max(160),
    language: z.string().default("pt-BR"),
    width: z.number().int().min(240).max(3840).refine((n) => n % 2 === 0, "par"),
    height: z.number().int().min(240).max(3840).refine((n) => n % 2 === 0, "par"),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
    theme: ThemeSchema.default(ThemeSchema.parse({})),
    captions: z
      .object({
        enabled: z.boolean().default(true),
        mode: z.enum(["word", "phrase", "off"]).default("word"),
        position: z.enum(["bottom", "center", "top"]).default("bottom"),
        maxWords: z.number().int().min(1).max(6).default(3),
        highlight: z.string().default("#ffd23f"),
        style: z.enum(["hormozi", "karaoke", "cinema", "comic"]).default("hormozi"),
      })
      .strict()
      .default({ enabled: true, mode: "word", position: "bottom", maxWords: 3, highlight: "#ffd23f", style: "hormozi" }),
    audio: z
      .object({ narration: z.string().default(""), music: z.string().default(""), musicVolume: z.number().min(0).max(1).default(0.12), duck: z.boolean().default(true), voice: z.string().default("") })
      .strict()
      .default({ narration: "", music: "", musicVolume: 0.12, duck: true, voice: "" }),
    scenes: z.array(PlanSceneSchema).min(1).max(60),
    uncertainties: z.array(z.string()).default([]),
    sources: z.array(z.object({ claim: z.string(), source: z.string() })).default([]),
    illustrativeData: z.boolean().default(false),
    warnings: z.array(z.string()).default([]),
  })
  .strict();

export type FilmPlan = z.infer<typeof FilmPlanSchema>;
export type PlanScene = z.infer<typeof PlanSceneSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Layer = z.infer<typeof LayerSchema>;

// ---------------------------------------------------------------------------
// Esquemas de parâmetros gerados a partir da especificação compartilhada
// ---------------------------------------------------------------------------
export type ParamSpec = {
  key?: string;
  type: string;
  label?: string;
  default?: unknown;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: string[];
  maxItems?: number;
  minItems?: number;
  item?: ParamSpec & { fields?: ParamSpec[] };
  fields?: ParamSpec[];
};

export type SceneSpec = { id: string; title: string; summary?: string; category?: string; params: ParamSpec[]; nativeFps?: number; nativeWidth?: number; nativeHeight?: number; thumbnail?: string; motion?: string[] };

export const ICONS: string[] = specs.icons;

function zodFor(p: ParamSpec): z.ZodTypeAny {
  switch (p.type) {
    case "text":
    case "longtext":
      return z.string().max(p.maxLength ?? 400);
    case "color":
      return color;
    case "number":
      return z.number().finite().min(p.min ?? -1e12).max(p.max ?? 1e12);
    case "boolean":
      return z.boolean();
    case "select":
      return z.enum((p.options ?? [""]) as [string, ...string[]]);
    case "icon":
      return z.enum(ICONS as [string, ...string[]]);
    case "asset":
      return z.string().max(400).refine((s) => s === "" || (!s.startsWith("/") && !s.includes("..") && !/^[a-z]+:/i.test(s)), "asset precisa ser caminho relativo do projeto");
    case "list": {
      const item = p.item ?? { type: "text" };
      const inner = item.type === "object" ? z.object(Object.fromEntries((item.fields ?? []).map((f) => [f.key!, zodFor(f).optional()]))).strict() : zodFor(item);
      return z.array(inner).max(p.maxItems ?? 12).min(p.minItems ?? 0);
    }
    case "json":
      return z.any();
    default:
      return z.never();
  }
}

export function paramsSchema(spec: SceneSpec) {
  return z.object(Object.fromEntries(spec.params.map((p) => [p.key!, zodFor(p).optional()]))).strict();
}

export const SCENE_SPECS: Record<string, SceneSpec> = Object.fromEntries([...(specs.scenes as SceneSpec[]).map((s) => [s.id, s] as const), ...(rc.scenes as unknown as SceneSpec[]).map((s) => [s.id, s] as const)]);

export function defaultsFor(spec: SceneSpec): Record<string, unknown> {
  return Object.fromEntries(spec.params.map((p) => [p.key!, structuredClone(p.default)]));
}

export function validatePlan(input: unknown): { ok: true; plan: FilmPlan } | { ok: false; errors: string[] } {
  const parsed = FilmPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const errors: string[] = [];
  for (const s of parsed.data.scenes) {
    const spec = SCENE_SPECS[s.component];
    if (!spec) {
      errors.push(`cena ${s.id}: componente desconhecido ${s.component}`);
      continue;
    }
    const r = paramsSchema(spec).safeParse(s.params);
    if (!r.success) errors.push(...r.error.issues.map((i) => `cena ${s.id}.params.${i.path.join(".")}: ${i.message}`));
  }
  return errors.length ? { ok: false, errors } : { ok: true, plan: parsed.data };
}
