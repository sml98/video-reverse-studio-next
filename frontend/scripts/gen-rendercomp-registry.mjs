// Gera o registro das cenas RenderComp a partir do Root.tsx upstream (sem modificar os componentes).
// Saídas:
//   src/contracts/rendercomp-registry.json  (metadados + especificação de parâmetros inferida dos defaults)
//   src/remotion/rendercomp/registry.generated.ts (imports estáticos para o bundle do Player/MP4)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "..");
const vendor = join(front, "src/vendor/rendercomp");
const root = readFileSync(join(vendor, "Root.upstream.tsx.txt"), "utf8");
const origin = { repository: "https://github.com/RenderComp/free-remotion-templates", revision: "f648980e528defb7594e24c6447055f0540f340b", license: "MIT" };

const imports = new Map();
for (const m of root.matchAll(/import \{ (\w+), (default\w+Props) \} from "\.\/components\/([\w-]+)\/(\w+)";/g)) {
  imports.set(m[1], { component: m[1], defaults: m[2], dir: m[3], file: m[4] });
}
const comps = [];
let folder = "";
for (const line of root.split("\n")) {
  const f = line.match(/<Folder name="([^"]+)"/);
  if (f) folder = f[1];
  const c = line.match(/<Composition id="([\w-]+)" component=\{(\w+)\} durationInFrames=\{(\d+)\} fps=\{FPS\} width=\{(\d+)\} height=\{(\d+)\}/);
  if (c) comps.push({ id: c[1], component: c[2], duration: +c[3], width: +c[4], height: +c[5], folder });
}

const tmp = mkdtempSync(join(front, ".rcreg-"));
const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function spec(key, value) {
  const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  if (typeof value === "string") {
    if (COLOR.test(value)) return { key, type: "color", label, default: value };
    return { key, type: value.length > 60 ? "longtext" : "text", label, maxLength: Math.max(80, value.length * 3), default: value };
  }
  if (typeof value === "number") return { key, type: "number", label, min: -1e9, max: 1e9, default: value };
  if (typeof value === "boolean") return { key, type: "boolean", label, default: value };
  if (Array.isArray(value)) {
    const first = value[0];
    let item;
    if (first && typeof first === "object") item = { type: "object", fields: Object.entries(first).map(([k, v]) => spec(k, v)).filter(Boolean) };
    else if (typeof first === "number") item = { type: "number", min: -1e9, max: 1e9, default: 0 };
    else item = { type: "text", maxLength: 120, default: "" };
    return { key, type: "list", label, maxItems: Math.max(12, value.length * 2), item, default: value };
  }
  if (value && typeof value === "object") return { key, type: "json", label, default: value };
  return null;
}

const out = [];
for (const c of comps) {
  const imp = imports.get(c.component);
  if (!imp) throw new Error(`Sem import para ${c.component}`);
  const entry = join(vendor, "components", imp.dir, imp.file + ".tsx");
  const outfile = join(tmp, c.id + ".mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile, external: ["react", "remotion", "react/jsx-runtime"], jsx: "automatic", logLevel: "silent" });
  const mod = await import(pathToFileURL(outfile).href);
  const defaults = mod[imp.defaults];
  const fps = typeof mod.FPS === "number" ? mod.FPS : 30;
  const params = Object.entries(defaults ?? {}).map(([k, v]) => spec(k, v)).filter(Boolean);
  out.push({
    id: `rc-${c.id}`,
    upstreamId: c.id,
    title: c.id.replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase()),
    category: c.folder,
    nativeWidth: c.width,
    nativeHeight: c.height,
    nativeFps: fps,
    nativeDurationInFrames: c.duration,
    component: imp.component,
    defaultsExport: imp.defaults,
    path: `src/vendor/rendercomp/components/${imp.dir}/${imp.file}.tsx`,
    thumbnail: `/rendercomp-thumbs/${c.id}.gif`,
    params,
  });
}
rmSync(tmp, { recursive: true, force: true });

writeFileSync(join(front, "src/contracts/rendercomp-registry.json"), JSON.stringify({ origin, scenes: out }, null, 2));
const lines = [
  "// GERADO por scripts/gen-rendercomp-registry.mjs — não editar à mão.",
  "// Componentes RenderComp (MIT) importados sem modificação.",
  'import type React from "react";',
];
for (const s of out) lines.push(`import { ${s.component} } from "../../vendor/rendercomp/components/${s.path.split("/").slice(-2).join("/").replace(/\.tsx$/, "")}";`);
lines.push("", "export const RENDERCOMP_COMPONENTS: Record<string, React.FC<any>> = {");
for (const s of out) lines.push(`  "${s.id}": ${s.component} as React.FC<any>,`);
lines.push("};", "");
writeFileSync(join(front, "src/remotion/rendercomp/registry.generated.ts"), lines.join("\n"));
console.log(`registro: ${out.length} cenas RenderComp`);
