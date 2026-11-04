#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${VRS_PORT:-8765}"
PIDFILE="data/logs/vrs-$PORT.pid"
if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Video Reverse Studio encerrado (PID $PID)."
  fi
  rm -f "$PIDFILE"
else
  echo "Nenhum PID ativo em $PIDFILE."
fi
