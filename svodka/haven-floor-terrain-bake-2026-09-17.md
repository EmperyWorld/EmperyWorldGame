# Пол Гавани — каша текстур — 2026-09-17

## Причина

ComfyUI `terrain_tile` для `tile_haven_*` часто игнорировал «seamless ground» и рисовал **домики/сцены**. Эти картинки попали в `tileset_empery_haven` (GID 1–8).

На карте GID 4 («wall») стоит на **638** клетках пола — вместо камня там был мусорный спрайт. Отсюда «лютый напутес».

## Фикс

- `pnpm bake:terrain:haven` — процедурный mid-scale cobble/road/water/wall strip (как задумано в клиентском fallback).
- Пишет и strip, и отдельные `tile_haven_*`, чтобы `pack:terrain` / admin regen не вернули Comfy-мусор.
- `generate:media:terrain` теперь = bake, не Comfy.

## Проверка

Ctrl+Shift+R на `:5180`. Пол: булыжник/дорога/синяя вода/тёмная кладка, без домиков на тайлах.
