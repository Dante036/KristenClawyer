#!/bin/bash
cd "$(dirname "$0")"
PORT="${WECHAT_SYNC_PORT:-4318}"
LOCAL_ENV_FILE="${WECHAT_SYNC_LOCAL_ENV:-$(pwd)/wechat-sync.local.env}"

if [ -f "$LOCAL_ENV_FILE" ]; then
  set -a
  . "$LOCAL_ENV_FILE"
  set +a
fi

EXISTING_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n 1)"
if [ -n "$EXISTING_PID" ]; then
  EXISTING_CMD="$(ps -p "$EXISTING_PID" -o command= 2>/dev/null)"
  if echo "$EXISTING_CMD" | grep -q "tools/wechat-sync/server.js"; then
    kill "$EXISTING_PID" 2>/dev/null || true
    sleep 1
  fi
fi

open "http://127.0.0.1:${PORT}/tool/" >/dev/null 2>&1 || true
exec node tools/wechat-sync/server.js
