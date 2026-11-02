import { defineConfig } from "vite";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 5173, proxy: { "/api": "http://127.0.0.1:8765", "/media": "http://127.0.0.1:8765" } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2500, sourcemap: false },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
} as any);
