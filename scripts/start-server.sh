#!/usr/bin/env bash
# Dev-сервер API :3000 + Admin UI :5190
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
  if [[ -n "${ADMIN_PID:-}" ]] && kill -0 "$ADMIN_PID" 2>/dev/null; then
    kill "$ADMIN_PID" 2>/dev/null || true
    wait "$ADMIN_PID" 2>/dev/null || true
  fi
  exit "$code"
}
trap cleanup INT TERM EXIT

echo "→ Empery server :3000 + admin :5190  (Ctrl+C стоп)"
echo "  Admin: http://127.0.0.1:5190/  (pnpm admin:grant -- --user=NAME)"
(cd apps/server && exec node --import tsx --watch src/index.ts) &
SERVER_PID=$!
empery_wait_http http://127.0.0.1:3000/ready 240 "$SERVER_PID"
(cd apps/admin && exec node node_modules/vite/bin/vite.js --strictPort) &
ADMIN_PID=$!

wait -n "$SERVER_PID" "$ADMIN_PID"
