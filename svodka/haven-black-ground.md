# Сводка: чёрная земля Гавани на скрине

## Дата
2026-09-15

## Что на скрине

`download.png` — дневная Гавань, герой на скакуне. Камера `#0f1115` вместо брусчатки (~52% пикселей). Дома/сцена/собор есть, ореолы дорог почти не видны (α 0.08–0.12 на чёрном).

## Почему

`createLayer(..., gpu=true)` не кидает, но `TilemapGPULayer` не рисует canvas-тайлсет из `Graphics.generateTexture` (`ensureFallbackTileset`). CPU `TilemapLayer` этот canvas рисует.

## Фикс

`preferGpuGround`: GPU только если source — `HTMLImageElement`. Иначе CPU. После GPU-слоя — `generateLayerDataTexture()`.

## Проверка

- `pnpm --filter @empery/client test -- game/systems/ground-layer.test.ts`
- F5 клиента: земля 0x9a9080 / 0xb0a898, не `#0f1115`
