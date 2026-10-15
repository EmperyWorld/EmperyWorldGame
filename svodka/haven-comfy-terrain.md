# Сводка: земля Гавани через ComfyUI + bake

## Дата
2026-09-15

## Проблема
Процедурные «булыжники с здание» + чёрная земля. Нужны нормальные текстуры из ComfyUI (`podman` `comfyui` :31003, `~/podryad`).

## Что сделано
1. Профиль **`terrain_tile`** + каталог `tile_haven_*` (8 тайлов).
2. Terrain **не через Flux Klein** (даёт шум) → **SD1.5** `v1-5-pruned-emaonly-fp16`.
3. `pnpm generate:media:terrain` + `pack:terrain` → strip 512×64.
4. `pnpm bake:terrain:haven` — мелкозернистый procedural bake (~12–16 камней на 64px), когда Comfy мусор.
5. Клиент грузит `tileset_empery_haven` из manifest; fallback — мелкий procedural.
6. Инструменты: `scripts/comfy-terrain-tool.ts`, `tools/comfyui/*.api.json` + README.
7. GPU для terrain выключен (чёрный clear).

## Команды
```bash
pnpm --filter @empery/shared build && pnpm --filter @empery/media build
pnpm tsx scripts/comfy-terrain-tool.ts          # health + dump workflows
pnpm generate:media:terrain                     # Comfy tile_haven_* + pack
pnpm bake:terrain:haven                         # надёжный fine strip (сейчас в игре)
```

## Статус качества Comfy
Flux distilled / SD@64 пока дают артефакты на seamless cobble. В игре сейчас **bake:terrain:haven**. Пайплайн Comfy оставлен для следующих чекпоинтов / ControlNet Tile.
