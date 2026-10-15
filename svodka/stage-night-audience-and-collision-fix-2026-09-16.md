# Stage night audience + collision fix

## Симптомы
- Ночью у амфитеатра оставались «застывшие» зрители.
- Сквозь сцену можно было пройти, хотя она должна блокировать движение.

## Причины
- В `haven-stage` создавалось 15 зрителей, а shared-расписание генерирует слоты только для 11 (`HAVEN_STAGE_ACTOR_COUNT=12` с бардом).
  - Лишние 4 актера не имели schedule-entry и никогда не уходили в night-state.
- `prop_open_stage` был помечен как pass-through в `PROP_PASS`, из-за чего footprint-коллизия для сцены не создавалась.

## Исправления
- `apps/client/src/sprites/haven-stage.ts`
  - число мест зрителей ограничено `HAVEN_STAGE_ACTOR_COUNT - 1` из `@empery/shared/haven-npc-posts`.
  - теперь клиент и shared расписание используют одинаковую размерность stage-roster.
- `apps/client/src/sprites/prop-footprint.ts`
  - `prop_open_stage` удален из `PROP_PASS`, чтобы для сцены создавался физический footprint.
- Тесты:
  - `apps/client/src/sprites/prop-colliders.test.ts` — добавлен кейс, что `prop_open_stage` остается collidable.
  - `apps/server/src/services/haven-schedule.test.ts` — добавлен кейс непрерывности `stage_*` id и совпадения длины со `HAVEN_STAGE_ACTOR_COUNT`.

## Результат
- Ночные зрители у сцены больше не «висят» без расписания.
- Сцена снова имеет коллизию и не проходится насквозь.
