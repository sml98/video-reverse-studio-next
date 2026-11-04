// Render determinístico de cenas/filmes VRS com Remotion (CPU).
// Uso: node render/render.mjs <job.json>
// job.json: { cacheDir, concurrency, jobs: [{ composition, props, out, assetFiles: {rel: absPath} }] }
// - Bundle webpack reutilizado por hash do código-fonte da composição.
// - Recursos locais servidos por um servidor HTTP efêmero em 127.0.0.1 (lista explícita, sem diretórios).
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "..");
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");

function hashTree(paths) {
  const h = createHash("sha256");
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) for (const f of readdirSync(p).sort()) walk(join(p, f));
    else {
      h.update(relative(front, p));
      h.update(readFileSync(p));
    }
  };
  for (const p of paths) if (existsSync(p)) walk(p);
  return h.digest("hex").slice(0, 20);
}

export function sourceHash() {
  return hashTree([join(front, "src/remotion"), join(front, "src/contracts"), join(front, "src/vendor"), join(front, "public/fonts"), join(front, "package-lock.json")]);
}

async function getBundle(cacheDir) {
  const h = sourceHash();
  const dir = join(cacheDir, `bundle-${h}`);
  if (existsSync(join(dir, "index.html"))) return { serveUrl: dir, hash: h, cached: true };
  mkdirSync(cacheDir, { recursive: true });
  const tmp = `${dir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  emit({ event: "stage", stage: "bundle" });
  const out = await bundle({ entryPoint: join(front, "src/remotion/index.tsx"), outDir: tmp, publicDir: join(front, "public"), enableCaching: true });
  renameSync(out, dir);
  return { serveUrl: dir, hash: h, cached: false };
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json" };
const ALLOWED = new Set(Object.keys(MIME).filter((e) => e !== ".svg"));

function startAssetServer(files) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const m = /^\/a\/(\d+)$/.exec(req.url ?? "");
      const p = m ? files[Number(m[1])] : undefined;
      if (!p || !existsSync(p) || !ALLOWED.has(extname(p).toLowerCase())) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[extname(p).toLowerCase()], "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
      createReadStream(p).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const job = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const cacheDir = job.cacheDir ?? join(front, ".remotion-cache");
  const concurrency = Math.max(1, Number(job.concurrency ?? 2));
  if (!process.env.VRS_CHROME_EXECUTABLE) {
    emit({ event: "stage", stage: "browser" });
    await ensureBrowser();
  }
  const { serveUrl, hash, cached } = await getBundle(cacheDir);
  emit({ event: "bundle", hash, cached });

  const fileList = [];
  const index = new Map();
  for (const j of job.jobs) for (const abs of Object.values(j.assetFiles ?? {})) if (!index.has(abs)) { index.set(abs, fileList.length); fileList.push(abs); }
  const server = await startAssetServer(fileList);
  const port = server.address().port;
  try {
    for (let i = 0; i < job.jobs.length; i++) {
      const j = job.jobs[i];
      const assetUrls = Object.fromEntries(Object.entries(j.assetFiles ?? {}).map(([rel, abs]) => [rel, `http://127.0.0.1:${port}/a/${index.get(abs)}`]));
      const inputProps = { ...j.props, assetUrls };
      const t0 = Date.now();
      const composition = await selectComposition({ serveUrl, id: j.composition, inputProps, browserExecutable: process.env.VRS_CHROME_EXECUTABLE || null, chromiumOptions: { gl: "swangle" } });
      const tmpOut = j.out + ".part.mp4";
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        codec: "h264",
        outputLocation: tmpOut,
        muted: true,
        crf: 20,
        x264Preset: "veryfast",
        pixelFormat: "yuv420p",
        imageFormat: "jpeg",
        jpegQuality: 90,
        concurrency,
        browserExecutable: process.env.VRS_CHROME_EXECUTABLE || null,
        chromiumOptions: { gl: "swangle" },
        onProgress: ({ progress }) => emit({ event: "progress", job: i, progress: Math.round(progress * 1000) / 1000 }),
      });
      renameSync(tmpOut, j.out);
      emit({ event: "done", job: i, out: j.out, ms: Date.now() - t0, frames: composition.durationInFrames });
    }
  } finally {
    server.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    emit({ event: "error", message: String(e && e.stack ? e.stack : e).slice(0, 4000) });
    process.exit(1);
  });
}
