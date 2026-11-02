// Verificação real da interface em Chromium headless (via Remotion) — gera capturas PNG.
import { openBrowser } from "@remotion/renderer";
import fs from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:8766";
const OUT = process.argv[3] || "../data/outputs";
const pages = [
  ["criar", "#/criar", "h1"],
  ["projetos", "#/projetos", ".niche-card"],
  ["projeto-halloween", "#/projetos/p903a75e28dee", ".stages"],
  ["biblioteca", "#/biblioteca", ".niche-card"],
  ["config", "#/config", "h1"],
];
const browser = await openBrowser("chrome", { chromiumOptions: { gl: "swangle" } });
const page = await browser.newPage({ context: () => null, logLevel: "error", indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => {} });
const client = page._client();
await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
const report = [];
for (const [name, hash, sel] of pages) {
  await page.goto({ url: `${BASE}/${hash}`, timeout: 20000 });
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const res = await client.send("Runtime.evaluate", { expression: `document.querySelectorAll(${JSON.stringify(sel)}).length`, returnByValue: true });
    ok = (res.value?.result?.value ?? res.result?.value ?? 0) > 0;
  }
  await new Promise((r) => setTimeout(r, 900));
  const info = await client.send("Runtime.evaluate", {
    expression: `JSON.stringify({h1: document.querySelector('h1')?.textContent, cards: document.querySelectorAll('.niche-card').length, videos: document.querySelectorAll('video').length, errors: [...document.querySelectorAll('.panel')].filter(p => p.style.borderColor.includes('bad')).map(p => p.textContent.slice(0,120))})`,
    returnByValue: true,
  });
  const shot = await client.send("Page.captureScreenshot", { format: "png" });
  const data = shot.value?.data ?? shot.data;
  fs.writeFileSync(`${OUT}/ui-${name}.png`, Buffer.from(data, "base64"));
  report.push({ name, selectorFound: ok, ...JSON.parse(info.value?.result?.value ?? info.result?.value ?? "{}") });
}
await browser.close({ silent: true });
console.log(JSON.stringify(report, null, 1));
