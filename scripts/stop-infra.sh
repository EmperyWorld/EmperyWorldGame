#!/usr/bin/env bash
# Остановить EmperyWorldGame Postgres + Redis (данные на диске остаются).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT/deploy/podman"

cd "$COMPOSE_DIR"
echo "→ Останавливаю emperyworld-infra…"
podman compose -f compose.yaml down
podman rm -f ewg-postgres ewg-redis 2>/dev/null || true
echo "✓ Контейнеры остановлены. Bind-данные: $ROOT/data/postgres , $ROOT/data/redis"
