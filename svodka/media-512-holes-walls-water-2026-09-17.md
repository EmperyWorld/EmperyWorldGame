# Atlas 512 + дырявые дома / забор / вода — 2026-09-17

## Причины

1. **Атлас давил в 128/256** — поднят `WORLD_CELL` до **512** (Haven atlas ~15936×3600).
2. **Дырявые дома** — старый `removeDarkBackground` резал тёмный камень по luminance по всему кадру. Заменено на border-connected cut + heal interior holes + solidify partial alpha. Починено ~530k дыр + 240 props.
3. **«Забор из хуйни»** — `prop_city_wall_*` генерился как двор/сцена, не сегмент стены. Промпты ужесточены, стены перегенерены (curtain wall segment).
4. **Воды нет** — `tile_haven_water` был булыжником; перегенен (синий). Плюс баг `pack-terrain-strip`: `sharp.composite` склеивал strip в однородную кашу. Упаковка через raw buffer — ячейки снова разные, вода в GID=3 синяя.

## Что сделать в браузере

Ctrl+Shift+R на `:5180`. Если SW упрямится — Clear site data.
