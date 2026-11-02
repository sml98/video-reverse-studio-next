#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PIDFILE="data/logs/vrs.pid"
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
