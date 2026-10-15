# Haven fleet cut + passenger phase 1 (2026-09-17)

## Что сделано
- Флот урезан до **одного корпуса каждого типа** (7, без галеры/шлюпки).
- У каждого судна свой причал и свой выход из бассейна; возврат — реверс маршрута.
- Расписание в **игровых часах**, детерминированно от `hullId` (не wall-clock): стоянка 1–24 ч, в море 24–48 ч.
- Шкипер у борта только в `in_port`. Диалог: куда идут / взять пассажира / отказ «Пассажиров не берём». Телепорта нет.

## Суда
| hull | berth tx,ty | skipper | выход |
|---|---|---|---|
| barge | 47,58 | harbor_skipper_barge | 47,58 → 90,76 |
| cog | 47,66 | harbor_skipper_cog | 47,66 → 102,76 |
| fishing | 61,59 | harbor_skipper_fishing | 61,59 → 88,81 |
| caravel | 62,62 | harbor_skipper_caravel | 62,62 → 110,76 |
| ferry | 62,70 | harbor_skipper_ferry | 62,70 → 112,74 |
| skiff | 76,58 | harbor_skipper_skiff | 76,58 → 104,80 |
| brig | 96,74 | harbor_skipper_brig | 96,74 → 114,82 |

## Часы
`absoluteGameHours(now, cycleMs, epochMs)` без modulo 24. Таймер: FNV hash от `hullId` → dock/away/offset. Reload стабилен без save-полей.

QA: `__EMPERY_HARBOR__.setHour`, `advanceHours`, `pinVoyage(hull, state)`. Пин только на клиенте; диалог смотрит серверные часы.

## Проверка
- 7 уникальных hull id в `__EMPERY_HARBOR__.ships()`.
- Ferry departing: `(5756,5141)` heading `e`, `routeT≈0.55`.
- Ferry back: `(4000,4512)` тот же причал.
- `POST /api/dialogue/choice` `skipper_board` → «Пассажиров не берём. На палубе сети, не скамьи.»
- Lettering-regen остановлен (задача стёрта).

## Не сделано
- Посадка / путешествие.
- Серверный pin часов для QA.
- Переген SOUTH-леттеринга.
