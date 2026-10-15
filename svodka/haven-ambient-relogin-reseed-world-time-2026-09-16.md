# Haven ambient relogin reseed on first WS world_time

## Симптом
- После reload/relogin жители начинали движение из той же стартовой точки, как при первом входе.

## Причина
- Первичный snap делался сразу из текущего schedule (часто bootstrap).
- Если этот snapshot совпадал между перезаходами, crowd каждый раз стартовал одинаково.
- Обязательного one-shot reseed на первом **новом** `world_time` по WebSocket не было.

## Исправление
- Файл: `apps/client/src/sprites/haven-citizens.ts`.
- Добавлены флаги `joinSeedServerAt` и `joinReseedPending`.
- Логика:
  - при первом snap запоминаем `serverAt`;
  - на `subscribeHavenSchedule` ждём snapshot с отличающимся `serverAt`;
  - как только приходит новый server tick, выполняем `snapAllCitizens(true)` и снимаем pending-флаг.

## Результат
- После входа crowd reseed'ится от актуального серверного времени, а не от повторяемого bootstrap-якоря.
- Повторный вход/обновление больше не должны постоянно начинать жителей из одной и той же стартовой позы.
