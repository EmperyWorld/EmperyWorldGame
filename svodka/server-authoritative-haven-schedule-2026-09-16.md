# Server-authoritative Haven schedule (client no longer simulates life phases)

## Принцип
- Источник истины для day/night и расписания жителей — только серверный world clock + haven schedule snapshot.
- Клиент не досчитывает фазы жизни локально.

## Что изменено
- `apps/client/src/world-clock.ts`
  - удален локальный пересчет `computeHavenSchedule(...)` на клиенте;
  - удалены client-side refresh heuristics (`havenScheduleRefreshDue`, `Date.now`-driven recompute);
  - `applyWorldClock(...)` теперь принимает server snapshot как authoritative state;
  - compatibility API `refreshHavenSchedule()` удален, чтобы исключить повторное внедрение локального fallback-цикла.
- `apps/client/src/game/systems/GameplaySession.ts`
  - в update-loop для Haven используется только `getHavenSchedule()` (без fallback).

## Почему это важно
- Единая ночь/день для всех игроков.
- Жизнь города идет на сервере независимо от присутствия клиентов.
- Входящий игрок видит текущий серверный процесс, а не клиентскую локальную симуляцию.

## Валидация (автотесты-контракты)
- `apps/client/src/world-clock.test.ts`
  - проверяет, что schedule не "дрейфует" локально между тиками и остается последним server snapshot;
  - проверяет, что schedule меняется только от входящего payload (`applyWorldClock(..., havenSchedule)`).
  - проверяет отсутствие compatibility API `refreshHavenSchedule` в исходнике.
- `apps/client/src/sprites/haven-citizens.test.ts`
  - проверяет join-reseed контракт: после входа пересев толпы выполняется только на первом snapshot с новым `serverAt`.

## Требование на будущее (обязательно)
- Day/night, schedule, фазы NPC и ambient-толпы — только server-authoritative.
- Клиенту запрещено:
  - локально пересчитывать `HavenSchedule` от `Date.now()`;
  - вводить fallback-логику, которая "дорисовывает" lifecycle NPC без server snapshot;
  - принимать gameplay-решения на основе клиентского времени, если сервер присылает authoritative поле.
- Любые изменения в этой зоне должны сопровождаться тестом-контрактом на server truth.
