#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p data/logs
PIDFILE="data/logs/vrs.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Video Reverse Studio já está rodando (PID $(cat "$PIDFILE")) em http://127.0.0.1:8765"
  exit 0
fi
rm -f "$PIDFILE"

if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q "127.0.0.1:8765 "; then
  echo "A porta 127.0.0.1:8765 já está em uso por outro processo:" >&2
  ss -tlnp 2>/dev/null | grep "127.0.0.1:8765 " >&2 || true
  echo "Nada foi encerrado automaticamente. Se for o app antigo (~/video-reverse-studio), pare-o com:" >&2
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

nohup .venv/bin/vrs serve < /dev/null > data/logs/server.log 2>&1 &
disown || true
echo $! > "$PIDFILE"
sleep 1.5
if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Video Reverse Studio iniciado em http://127.0.0.1:8765 (PID $(cat "$PIDFILE"))"
else
  echo "Falha ao iniciar servidor. Verifique data/logs/server.log" >&2
  exit 1
fi
