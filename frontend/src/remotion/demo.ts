import { FilmPlanSchema, type FilmPlan } from "../contracts/plan";

/** Plano mínimo usado apenas como defaultProps das composições (o app sempre passa o plano real). */
export const DEMO_PLAN: FilmPlan = FilmPlanSchema.parse({
  title: "Demonstração",
  width: 1280,
  height: 720,
  fps: 30,
  scenes: [
    { id: "s1", component: "vrs-title", params: { label: "VRS", title: "Video Reverse Studio", subtitle: "Composição de demonstração" }, durationInFrames: 90 },
  ],
});
