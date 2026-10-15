# Harbor leftover look: caravel lateen + N/S (2026-09-17)

Не коммит. Флот / расписание / шкиперы / посадка не трогались. Не регенили все 63.

## Было плохо
- Каравелла — квадратный фрегат на всех 8 heading.
- `_n` / `_s` — 3/4 музейные портреты, направление не читалось.
- `prop_ship_barge_n` — водяной знак `Empire Worldic`.
- Тёмный киль съедался luminance-cut (дыры в носу).

## Реген
Все 9 `prop_ship_caravel` + `_e…_ne`.  
N/S + unsuffixed юг: brig, cog, ferry, barge, fishing, skiff (`_n`, `_s`, без суффикса).

**Скип (не в scope / уже ок после осмотра):** 36 боковых heading не-каравелл (`_e _se _sw _w _nw _ne`).  
Повторно не гоняли чистые: `prop_ship_barge`, `prop_ship_barge_n`, `prop_ship_fishing_s`, `prop_ship_cog`, `prop_ship_cog_n`, `prop_ship_ferry_n`.

Промпты: lateen-only на каравелле; N/S = ось вертикально; painted только на этих ID.  
`normalizeShipSprite` threshold 10, чтобы не выедать корпус.

## Проверка preview :5180
- 7 уникальных корпусов.
- Heading swap жив: причал `caravel_s`, уход `caravel_e`, возврат `caravel_w`.
- Вёсел и букв на корпусе нет.

## Скрины
- `svodka/harbor-ships-lateen-berth-2026-09-17.png` — каравелла у причала, `_s` bow-on
- `svodka/harbor-ships-lateen-caravel-e-2026-09-17.png` — lateen, heading E
- `svodka/harbor-ships-lateen-caravel-w-2026-09-17.png` — lateen, heading W
- `svodka/harbor-ships-frame-caravel-se-2026-09-17.png` — lateen SE
- `svodka/harbor-ships-frame-n-2026-09-17.png` — `prop_ship_skiff_n` bow-on
- `svodka/harbor-ships-frame-s-2026-09-17.png` — `prop_ship_fishing_s` bow-on

## Осталось
- Flux Klein всё ещё 3D, не painted sprite.
- `_n` и `_s` оба bow-on; настоящий stern-on Flux почти не даёт (N и S визуально похожи).
- Каравелла чаще 1–2 треугольных паруса (кэттер/гаф), не классическая трёхмачтовая латина.
- Дырка в носу `prop_ship_caravel_s`.
