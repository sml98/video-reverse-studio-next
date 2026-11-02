#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Video Reverse Studio — Verificação de Ambiente (CPU) ==="
uname -a
echo "CPU threads: $(nproc)"
free -h || true
df -h "$ROOT" || true

for bin in python3 node npm ffmpeg ffprobe git; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERRO: binário obrigatório ausente: $bin" >&2
    exit 1
  fi
  echo "OK: $bin -> $(command -v "$bin")"
done
