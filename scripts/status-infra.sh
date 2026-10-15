#!/usr/bin/env bash
# Статус локальной инфры EmperyWorldGame.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/deploy/podman"

echo "=== ewg containers ==="
podman ps -a --filter name=ewg- --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
echo
if podman exec ewg-postgres pg_isready -U empery -d empery 2>/dev/null; then
  echo "Postgres (:5433): OK"
  podman exec ewg-postgres psql -U empery -d empery -c '\dt' 2>/dev/null || true
else
  echo "Postgres (:5433): down"
fi
if podman exec ewg-redis redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "Redis (:6380): OK"
else
  echo "Redis (:6380): down"
fi
