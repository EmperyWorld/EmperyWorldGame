#!/usr/bin/env bash
# Прод-запуск сервера: build → node dist (порт из config/services.yaml)
set -euo pipefail
# shellcheck source=lib/env.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/env.sh"

empery_bootstrap
node apps/server/scripts/init-persistence.mjs
echo "→ build workspace"
pnpm --filter @empery/shared build
pnpm --filter @empery/save build
pnpm --filter @empery/core build
pnpm --filter @empery/llm build
pnpm --filter @empery/media build
pnpm --filter @empery/world-engine build
pnpm --filter @empery/server build

echo "→ Empery server (prod)  (Ctrl+C стоп)"
exec pnpm --filter @empery/server start
