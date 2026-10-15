#!/usr/bin/env bash
# Backend :3000 (node dist, без watch) + Client :5180 + Admin :5190 как vite preview (бандл, без /src)
set -euo pipefail
# shellcheck source=lib/env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/env.sh"

empery_bootstrap

cleanup() {
  local code=$?
  for pid in "${SERVER_PID:-}" "${CLIENT_PID:-}" "${ADMIN_PID:-}"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  exit "$code"
}
trap cleanup INT TERM EXIT

echo "→ build workspace"
pnpm build
node apps/server/scripts/init-persistence.mjs

echo "→ Empery all-in-one"
echo "  API    http://127.0.0.1:3000"
echo "  Client http://127.0.0.1:5180  (preview, замороженный бандл)"
echo "  Admin  http://127.0.0.1:5190  (preview; вкладка «Карта Гавани»)"
echo "  Карта объектов — только Admin, не клиент. Нужен admin: pnpm admin:grant -- --user=NAME"
echo "  HMR нет. Увидел старое — Ctrl+C, start-all снова, жёсткое обновление браузера."
echo "  API запускается из собранного dist."
echo "  Живые правки UI: pnpm start:dev + pnpm start:admin"
echo "  Ctrl+C — остановить всё"
echo

# Не tsx watch: смена packages/shared/dist иначе рвёт Vite proxy (WS handshake + 502).
node apps/server/dist/index.js &
SERVER_PID=$!
empery_wait_http http://127.0.0.1:3000/ready 240 "$SERVER_PID"
(cd apps/client && exec node node_modules/vite/bin/vite.js preview --port 5180 --strictPort) &
CLIENT_PID=$!
(cd apps/admin && exec node node_modules/vite/bin/vite.js preview --port 5190 --strictPort) &
ADMIN_PID=$!

# --strictPort гарантирует, что процесс упадёт (а не тихо сядет на другой
# порт), если 5180/5190 всё же заняты — но лучше явно проверить, что новые
# PID и правда живы и слушают, прежде чем говорить «готово».
sleep 1
for name_pid_port in "server:$SERVER_PID:3000" "client:$CLIENT_PID:5180" "admin:$ADMIN_PID:5190"; do
  name=${name_pid_port%%:*}
  rest=${name_pid_port#*:}
  pid=${rest%%:*}
  port=${rest#*:}
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "✗ $name (порт $port) упал сразу после старта — смотри вывод выше" >&2
    exit 1
  fi
done
empery_wait_http http://127.0.0.1:5180 20 "$CLIENT_PID"
empery_wait_http http://127.0.0.1:5190 20 "$ADMIN_PID"

echo "✓ все три процесса живы и слушают — жёсткое обновление браузера (Ctrl+Shift+R) на 5180/5190"
wait -n "$SERVER_PID" "$CLIENT_PID" "$ADMIN_PID"
