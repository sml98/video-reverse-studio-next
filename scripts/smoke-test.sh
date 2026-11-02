#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== 1. Doctor ==="
.venv/bin/vrs doctor

echo "=== 2. Testes unitários TypeScript (WordAnchor / ViralCaptions / words) ==="
(cd frontend && npm test)

echo "=== 3. Testes de aceitação Python (armazenamento isolado) ==="
.venv/bin/pytest -q
