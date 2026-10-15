# Haven harbor — night / mole / lintel (2026-09-17)

## Что сделано
- Мол маяка: камень 7×16, маяк на 85,64, декинг/кнехты/ящики/лампы. Override 513 props (surgical).
- Ночь: wash + лампы на причалах, ADD glow независимо от schedule; `setHour` пинит часы от WS.
- Линтель: tight zoom 2.55–2.7, игрок в проёме 4000,3176.

## Доказательства
- `/tmp/haven-walk/03b-arch-lintel-in-opening.png` — аватар в проёме, не точка.
- `/tmp/haven-walk/04-quay-clutter-day.png` + `05-quay-clutter-night.png` — 14:00 / 23:00.
- `/tmp/haven-walk/06b-mole-on-pad.png` — маяк в кадре на молу.
- Флот на воде, motion galley/ferry/brig; chandler не в `ships()`.

## Честно не готово
- Набережная и мол всё ещё читаются как тонкий булыжник, не рабочий порт.
- Ночной clutter мелкий и сидит в лужах ламп.
- `prop_pier_long` не даёт деревянный настил.

Цель не закрывать.
