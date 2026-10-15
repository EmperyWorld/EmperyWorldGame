#!/usr/bin/env bash
# Admin UI → http://127.0.0.1:5190 (проксирует /api на :3000)
set -euo pipefail
# shellcheck source=lib/env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/env.sh"

empery_bootstrap
echo "→ Empery admin :5190  (нужен сервер на :3000; Ctrl+C стоп)"
echo "  Выдать admin: pnpm admin:grant -- --user=USERNAME"
echo "  или EMPERY_BOOTSTRAP_ADMIN=USERNAME при старте сервера"
exec pnpm --filter @empery/admin dev
