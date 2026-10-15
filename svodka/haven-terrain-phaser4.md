# Сводка: земля по доке Phaser 4 (не «один квадратик на весь город»)

## Дата
2026-09-15

## Проблема
Тайлсет был `Graphics.generateTexture` → **4×64 canvas**. Один GID площади/улицы = один штамп на всю Гавань. `TilemapGPULayer` (Phaser 4) с canvas **не рисует**; дороги были полупрозрачным Graphics поверх.

## Что говорит Phaser 4
- `map.createLayer(id, tileset, x, y, gpu=true)` → `TilemapGPULayer` (один quad, seamless borders).
- Нужен **один image tileset** (`HTMLImageElement`), не canvas.
- Разнообразие = **много GID** в Tiled + sheet с вариантами.

## Фикс
1. Sheet **8×64 (512×64)** → Image через `textures.addBase64` (boot ждёт ready).
2. GID: plaza `1/5/6`, road `2/7/8`, water `3`, wall `4`; walkable обновлён.
3. Haven: площади красятся plaza, улицы — road; `diversifyHavenGround` ломает wallpaper.
4. Road wash в `location-decor` усилен.
5. `toTiled`: columns=8, imagewidth=512.

## Проверка
- Hard refresh / перезапуск клиента после `generate-maps`.
- Площадь ≠ бульвар по тону; нет синих «кирпичных» полос воды.
- В консоли нет чёрного clear под тайлами (GPU sheet живой).
