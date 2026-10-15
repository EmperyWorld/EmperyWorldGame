#!/usr/bin/env bash
# Общий bootstrap для скриптов запуска EmperyWorldGame.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

empery_ensure_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm не найден. Установи: https://pnpm.io/installation" >&2
    exit 1
  fi
}

empery_ensure_config() {
  if [[ ! -f config/services.yaml ]]; then
    if [[ -f config/services.example.yaml ]]; then
      cp config/services.example.yaml config/services.yaml
      echo "Создан config/services.yaml из example — при необходимости поправь URL."
    else
      echo "Нет config/services.yaml и example." >&2
      exit 1
    fi
  fi
}

empery_ensure_deps() {
  if [[ ! -d node_modules ]] || [[ ! -d apps/server/node_modules ]]; then
    echo "→ pnpm install"
    pnpm install
  fi
}

# shared (и save) должны быть собраны: server/client импортируют из dist/
empery_ensure_packages() {
  local need=0
  if [[ ! -f packages/shared/dist/index.js ]]; then need=1; fi
  if [[ ! -f packages/save/dist/index.js ]]; then need=1; fi
  if [[ "$need" -eq 1 ]]; then
    echo "→ build @empery/shared @empery/save"
    pnpm --filter @empery/shared build
    pnpm --filter @empery/save build
  fi
}

empery_wait_http() {
  local url=$1
  local tries=${2:-40}
  local pid=${3:-}
  local i
  for ((i = 1; i <= tries; i++)); do
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      echo "процесс $pid завершился до готовности $url" >&2
      return 1
    fi
    if curl -sf -m 1 "$url" >/dev/null; then
      return 0
    fi
    sleep 0.25
  done
  echo "не дождался $url" >&2
  return 1
}

empery_bootstrap() {
  empery_ensure_pnpm
  empery_ensure_config
  empery_ensure_deps
  empery_ensure_packages
}
