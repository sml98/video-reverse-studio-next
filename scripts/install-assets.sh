#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Verificando pacotes iniciais de biblioteca, fontes OFL e vozes locais ==="
mkdir -p data/library/packs .tools/voices .tools/asr frontend/public/fonts

for f in Inter.ttf PlayfairDisplay.ttf Anton.ttf Nunito.ttf JetBrainsMono.ttf; do
  if [ ! -f "frontend/public/fonts/$f" ]; then
    echo "ERRO: fonte ausente frontend/public/fonts/$f" >&2
    exit 1
  fi
done

for v in faber cadu jeff; do
  if [ ! -f ".tools/voices/$v/pt_BR-$v-medium.onnx" ]; then
    echo "ERRO: modelo de voz Piper ausente: $v" >&2
    exit 1
  fi
done

echo "OK: Fontes OFL, vozes Piper PT-BR e pacotes de biblioteca verificados."
