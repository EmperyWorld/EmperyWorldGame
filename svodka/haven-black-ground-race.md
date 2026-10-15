# Сводка: снова чёрная земля после Image/GPU

## Дата
2026-09-15

## Причина
`textures.addBase64` асинхронный. Boot ждал max 120 мс и стартовал GameScene; `preferGpuGround` видел `HTMLImageElement` (часто ещё 0×0) → `TilemapGPULayer` → пустой quad → камера `#0f1115`.

## Фикс
- Тайлсет снова **sync canvas** `generateTexture('terrain-tiles', 512, 64)`.
- CPU `TilemapLayer` (canvas GPU не умеет).
- `preferGpuGround` только для complete Image с naturalWidth≥64.
- Boot снова синхронный.

8 GID / plaza vs road в карте остаются.
