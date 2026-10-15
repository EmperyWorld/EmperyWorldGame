# Server truth hardening: no client schedule fallback

## Что сделано
- Удален compatibility API `refreshHavenSchedule()` из `apps/client/src/world-clock.ts`.
- Во всех Haven runtime-модулях убран шаблон `getHavenSchedule() ?? refreshHavenSchedule()`:
  - `apps/client/src/game/systems/GameplaySession.ts`
  - `apps/client/src/sprites/haven-citizens.ts`
  - `apps/client/src/sprites/haven-residential.ts`
  - `apps/client/src/sprites/location-decor.ts`
  - `apps/client/src/sprites/haven-crafts.ts`
  - `apps/client/src/sprites/haven-garrison.ts`
  - `apps/client/src/sprites/haven-night-life.ts`
  - `apps/client/src/sprites/haven-stage.ts`

## Почему так
- Fallback API даже как "пустышка" маскирует архитектурный долг: разработчик может снова добавить в него локальную симуляцию и незаметно сломать server-authoritative модель.
- Удаление API делает нарушение явным на уровне компиляции (импорт/вызов сразу падает).

## Дополнительная защита от конфликтов
- `apps/client/src/game/systems/EntityManager.ts`:
  - для `empery_haven` запрещен fallback к `hour` при отсутствии server schedule entry.
- `apps/client/src/dialogue-controller.ts`:
  - для `empery_haven` интеракция с NPC невозможна без server schedule entry.

## Валидация
- `apps/client/src/world-clock.test.ts`
  - проверка, что schedule не "дрейфует" локально между тиками;
  - проверка, что schedule меняется только от server payload;
  - проверка отсутствия `refreshHavenSchedule` в исходнике.
- `apps/client/src/sprites/haven-citizens.test.ts`
  - проверка one-shot join reseed по новому `serverAt`.

## Аудит оставшихся рисков
- Gameplay-конфликтов с принципом "истина только на сервере" для Haven schedule не найдено.
- Остается только визуальная интерполяция `day-night` в `apps/client/src/day-night-overlay.ts` через `Date.now()` между серверными тиками; это render-only слой и не участвует в gameplay-решениях.
