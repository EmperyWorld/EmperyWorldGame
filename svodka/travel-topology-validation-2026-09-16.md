# Сводка: валидация топологии переходов travel

## Дата
2026-09-16

## Проблема

`/api/saves/:id/travel` валидировал цель по флагам/приватности, но не проверял физическое ребро перехода из текущей локации. Из-за этого можно было делать дальний hop HTTP-запросом без входа в реальный портал на карте.

## Что изменено

- В `apps/server/src/services/locations.ts` (`canTravel`) добавлена обязательная проверка:
  - загружается текущая локация `save.location`;
  - переход разрешается только если у неё есть `zone.travelTo === destination`.
- При отсутствии ребра возвращается отказ:
  - `Отсюда нет прямого перехода`.

## Почему так

- Сервер теперь держит тот же инвариант, что и геймплей:
  - сначала физический вход в доступный портал,
  - потом смена локации.
- Это закрывает обход топологии через прямой HTTP travel.

## Тесты

- Обновлён `apps/server/src/services/economy.test.ts`:
  - проверка unlock `shadow_depths` переведена на `starter_grove` (где реально есть ребро в `shadow_depths`).
- Дополнен `apps/server/src/services/locations-arrival.test.ts`:
  - `canTravel` разрешает прямое ребро (`empery_haven -> suburban_park`);
  - `canTravel` отклоняет не-соседнюю цель без ребра (`empery_haven -> silverwood`).
- Прогон:
  - `pnpm --filter @empery/server exec vitest run src/services/locations-arrival.test.ts src/services/economy.test.ts` — pass.
