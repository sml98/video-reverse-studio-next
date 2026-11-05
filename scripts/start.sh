#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${VRS_PORT:-8765}"
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT > 0 && PORT <= 65535)) || { echo "VRS_PORT inválida" >&2; exit 1; }
export VRS_PORT="$PORT"
mkdir -p data/logs
PIDFILE="data/logs/vrs-$PORT.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "FrameRise já está rodando (PID $(cat "$PIDFILE")) em http://127.0.0.1:$PORT"
  exit 0
fi
rm -f "$PIDFILE"

if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q "127.0.0.1:$PORT "; then
  echo "A porta 127.0.0.1:$PORT já está em uso por outro processo:" >&2
  ss -tlnp 2>/dev/null | grep "127.0.0.1:$PORT " >&2 || true
  echo "Nada foi encerrado automaticamente. Encerre o serviço que ocupa a porta antes de iniciar esta instalação:" >&2
  echo "  systemctl --user stop video-reverse-studio.service" >&2
  exit 1
fi

export OMP_NUM_THREADS="${VRS_THREADS:-2}"
export MKL_NUM_THREADS="${VRS_THREADS:-2}"
export OPENBLAS_NUM_THREADS="${VRS_THREADS:-2}"
export TOKENIZERS_PARALLELISM=false
export PATH="$ROOT/.tools/bin:$PATH"
export LD_LIBRARY_PATH="$ROOT/.tools/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
export TESSDATA_PREFIX="$ROOT/.tools/usr/share/tesseract-ocr/5/tessdata"

.venv/bin/python - "$PIDFILE" <<'PY'
import os, subprocess, sys
from pathlib import Path
root = Path.cwd()
with (root / "data/logs/server.log").open("ab") as log:
    process = subprocess.Popen(
        [str(root / ".venv/bin/vrs"), "serve"],
        stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
        start_new_session=True, env=os.environ.copy(),
    )
Path(sys.argv[1]).write_text(str(process.pid) + "\n")
PY
sleep 1.5
if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "FrameRise iniciado em http://127.0.0.1:$PORT (PID $(cat "$PIDFILE"))"
else
  echo "Falha ao iniciar servidor. Verifique data/logs/server.log" >&2
  exit 1
fi
