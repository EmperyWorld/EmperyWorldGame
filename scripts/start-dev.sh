#!/usr/bin/env bash
# Сервер + клиент в одном терминале (оба Ctrl+C)
set -euo pipefail
# shellcheck source=lib/env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/env.sh"

empery_bootstrap
pnpm --filter "@empery/server^..." build
node apps/server/scripts/init-persistence.mjs

cleanup() {
  local code=$?
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "${CLIENT_PID:-}" ]] && kill -0 "$CLIENT_PID" 2>/dev/null; then
    kill "$CLIENT_PID" 2>/dev/null || true
    wait "$CLIENT_PID" 2>/dev/null || true
  fi
  exit "$code"
}
trap cleanup INT TERM EXIT

echo "→ server :3000 + client :5180"
(cd apps/server && exec node --import tsx --watch src/index.ts) &
SERVER_PID=$!
empery_wait_http http://127.0.0.1:3000/ready 240 "$SERVER_PID"
(cd apps/client && exec node node_modules/vite/bin/vite.js --strictPort) &
CLIENT_PID=$!

wait -n "$SERVER_PID" "$CLIENT_PID"
