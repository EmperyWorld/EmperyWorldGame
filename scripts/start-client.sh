#!/usr/bin/env bash
# Vite-клиент → http://127.0.0.1:5180  (нужен запущенный сервер)
set -euo pipefail
# shellcheck source=lib/env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/env.sh"

empery_bootstrap
echo "→ Empery client (dev) :5180  (Ctrl+C стоп)"
exec pnpm --filter @empery/client dev
