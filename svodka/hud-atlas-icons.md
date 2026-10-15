# Сводка: пустые иконки инвентаря и навыков

## Дата
2026-09-15

## Почему

После перехода на HUD CSS-atlas (`hud.webp` + `mediaIconElement`) слоты сумки и навыков были пустыми: атлас грузился, а спрайт рисовался мимо кадра.

## Причина

`hudAtlasBackgroundStyle` ставил `background-position: (-x/w)%` — это не тот алгоритм CSS `%`.
При shelf `pad=2` у всех кадров `x,y ≥ 2`, позиция уезжала в пустоту. Прямой `<img>` на `/media/assets/…` работал.

## Что изменилось

| | Было | Стало |
|---|---|---|
| `background-position` | `-x/frameW %` | `x / (atlasW − frameW) %` |
| меню | манифест без `ensureHudAtlas` | атлас грузится уже в `initMenu` |
| тест | ожидал `-100%` | формула `%` + pad=2 |

## Проверка

`pnpm --filter @empery/client test -- hud-atlas-style`

Жёсткий refresh клиента — иконки в сумке/навыках/хотбаре снова из атласа.
