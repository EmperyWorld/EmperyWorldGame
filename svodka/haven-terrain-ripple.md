# Сводка: земля «рябь»

## Причина
1. Слишком мелкая сетка камней (3–4px) → муа́р при скролле/зуме.
2. `smoothPixelArt` ставил LINEAR на `terrain-tiles` → мерцание.
3. Камни вылезали за край тайла → тёмная полоса-шов.

## Фикс
- Mid-scale cobble (~7–8 на тайл), soft mortar, seamless wrap.
- `terrain-tiles` всегда NEAREST.
- Слабее road washes.
- `pnpm bake:terrain:haven` перезаписан.

Hard refresh (manifest `generatedAt` обновлён).
