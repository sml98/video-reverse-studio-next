#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export OMP_NUM_THREADS="${VRS_THREADS:-2}" MKL_NUM_THREADS="${VRS_THREADS:-2}" OPENBLAS_NUM_THREADS="${VRS_THREADS:-2}" TOKENIZERS_PARALLELISM=false
exec "$ROOT/.venv/bin/python" -m vrs.mcp_server
