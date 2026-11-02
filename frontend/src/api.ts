// Cliente da API local (mesma origem; nenhuma credencial no navegador).
export class ApiError extends Error {
  code?: string;
  constructor(msg: string, code?: string) {
    super(msg);
    this.code = code;
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const r = await fetch(url, init);
  const ct = r.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new ApiError((data as any)?.error ?? (data as any)?.detail?.[0]?.msg ?? `HTTP ${r.status}`, (data as any)?.code);
  return data as T;
}

export const api = {
  get: <T,>(u: string) => req<T>("GET", u),
  post: <T,>(u: string, b?: unknown) => req<T>("POST", u, b),
  put: <T,>(u: string, b?: unknown) => req<T>("PUT", u, b),
};

export type Niche = {
  id: string;
  title: string;
  emoji: string;
  description: string;
  arc: string[];
  visualLanguages: string[];
  aspects: string[];
  defaultDuration: number;
  example: { title: string; idea: string; aspect: string };
  scenes: { role: string; label: string; preset_id: string; duration: number }[];
  example_video: string;
  thumbnail: string;
};
export type Voice = { id: string; language: string; quality: string; audition: string; model_card: string };
export type AgentOpt = { id: string; label: string; available: boolean; note: string };
export type Catalog = { niches: Niche[]; voices: Voice[]; agents: AgentOpt[]; sogni: { enabled: boolean; policy: string }; stages: string[] };
export type Job = { id: string; kind: string; state: string; step: string; progress: number; error: string; result: any; created_at: number; project_id: string };
export type Render = { version: number; mp4: string; size: number; review_state: string; created_at: number };
export type Project = {
  id: string;
  name: string;
  idea: string;
  niche_id: string;
  aspect: string;
  target_seconds: number;
  stage: string;
  status: string;
  reference: any;
  options: any;
  renders: Render[];
  latest_render?: Render | null;
  jobs?: Job[];
  history?: any[];
  storyboard?: any;
  plan?: any;
  created_at: number;
  updated_at: number;
};
export type Resource = { id: string; kind: string; name: string; tags: string[]; pack: string; license: string; preview: string; url: string; size: number; capability?: string };

export const media = (pid: string, rel: string) => `/media/projects/${pid}/${rel}`;
export const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
