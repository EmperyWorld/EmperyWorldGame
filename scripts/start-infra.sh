#!/usr/bin/env bash
# Поднять локальный Postgres + Redis (Podman, bind-mount в data/).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT/deploy/podman"

mkdir -p "$ROOT/data/postgres" "$ROOT/data/redis"

cd "$COMPOSE_DIR"
echo "→ Podman Compose: Postgres :5433 + Redis :6380 (bind → data/)"
echo "  (порты не 5432/6379 — там может жить другой локальный стек)"

podman compose -f compose.yaml up -d

echo "→ Жду health…"
for _ in $(seq 1 "${EMPERY_INFRA_WAIT_SECONDS:-180}"); do
  pg_ok=0
  rd_ok=0
  if podman exec ewg-postgres pg_isready -U empery -d empery >/dev/null 2>&1; then
    pg_ok=1
  fi
  if podman exec ewg-redis redis-cli ping 2>/dev/null | grep -q PONG; then
    rd_ok=1
  fi
  if [[ "$pg_ok" -eq 1 && "$rd_ok" -eq 1 ]]; then
    echo "✓ Postgres ready  postgres://empery:***@127.0.0.1:5433/empery"
    echo "✓ Redis ready     redis://127.0.0.1:6380/0"
    echo
    echo "  config/services.yaml → persistence"
    echo "  Стоп: ./scripts/stop-infra.sh"
    exit 0
  fi
  sleep 1
done

echo "⚠ Таймаут ожидания. Статус:"
podman compose -f compose.yaml ps || true
podman logs --tail 40 ewg-postgres 2>/dev/null || true
podman logs --tail 20 ewg-redis 2>/dev/null || true
exit 1
