# Haven ambient strict night + no runtime teleport

## Что показал последний репорт
- Последний `Bug` был в момент `hour ~= 21.00` (переключение в ночь).
- В событиях были:
  - `phase_hidden` / `show_outdoors` (массовый фазовый flip),
  - и `at_post_walk_finish_snap_far` (клиентский жёсткий snap).

## Проблемы
1) Ночные "жители/стражники" часть времени были клиентскими ambient (`nightPatrolOnly`) и воспринимались как реальные NPC, но без гарантии интерактива/правдоподобного происхождения.
2) В runtime оставались аварийные `setPosition(...)` снапы для некоторых веток commute/at_post, дающие визуальные телепорты.

## Исправление
- `apps/client/src/sprites/haven-citizens.ts`
  - Введён strict default: client-side `nightPatrolOnly` ambient выключен.
    - включить обратно только вручную: `?ambientNightlife`.
  - Убраны per-frame hard snaps в `applyCitizenSchedule`:
    - `walking_to_post`: больше нет `snap_post_far`, только route retry;
    - `at_post`: больше нет `...snap_far`, только route retry / resume.

## Почему
- Это убирает "фантомных" ночных гуманоидов, не соответствующих серверной правде.
- Устраняет визуальные телепорты от клиентской аварийной коррекции позиций в обычном апдейте.

## Проверка
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts haven-city-placement.test.ts` — OK
