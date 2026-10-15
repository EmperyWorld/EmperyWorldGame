# Harbor ship look pass (2026-09-17)

## Было плохо
- SOUTH-тексты на транце (`SOUSTH` / `SOOTH` / номера).
- Несогласованные 3/4 портреты, heading слабо читался.
- Каравелла как фрегат, паром как яхта.

## Сделано
Переген **всех 63** `prop_ship_{brig,cog,ferry,barge,fishing,caravel,skiff}` + `_e…_ne`.
Промпты: isometric 3/4, blank hull, no oars/text. `--only=` теперь exact, если id есть в каталоге.

## Проверка
- 7 уникальных корпусов, heading swap жив (`fishing_s` у причала, `ferry_e` / `brig_e` в рейсе).
- Скриншоты: `svodka/harbor-ships-look-berth-2026-09-17.png`, `…-heading-a-…png`, `…-heading-b-…png`.

## Осталось
Flux Klein всё ещё рисует 3D-модели, не painted sprite. Каравелла часто с прямым парусом. N/S ближе к 3/4, чем bow-on.
