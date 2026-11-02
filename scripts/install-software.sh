#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
export OPENBLAS_NUM_THREADS=2

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e ".[dev]"

if [ ! -d ".tools/kinocut-venv" ]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv --python 3.12 .tools/kinocut-venv
    uv pip install --python .tools/kinocut-venv/bin/python kinocut
  else
    python3 -m venv .tools/kinocut-venv
    .tools/kinocut-venv/bin/pip install kinocut
  fi
fi

cd "$ROOT/frontend"
npm install --no-audit --no-fund
node scripts/gen-rendercomp-registry.mjs
