#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ $# -lt 1 ]; then
  echo "Uso: $0 <project_id>" >&2
  exit 1
fi
.venv/bin/vrs export "$1"
