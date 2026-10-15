# Аудит: координаты, рендер построек, коллизии, входы/выходы

## Дата
2026-09-16

## Объект аудита

- Координатная математика Haven и travel pad.
- Рендер world props/построек (depth + origin + silhouettes).
- Коллизии тайлов и построек.
- Переходы между локациями (вход/выход, server checks, spawn arrival).

## Что проверено

- Код:
  - `packages/shared/src/haven-coords.ts`
  - `apps/client/src/sprites/place-world-prop.ts`
  - `apps/client/src/sprites/prop-colliders.ts`
  - `apps/client/src/sprites/location-decor.ts`
  - `apps/client/src/game/systems/GameplaySession.ts`
  - `apps/client/src/game/systems/portal-pad.ts`
  - `apps/client/src/game/systems/PortalSystem.ts`
  - `apps/server/src/services/locations.ts`
  - `packages/shared/src/content-schemas.ts`
- Тесты:
  - `pnpm --filter @empery/client test -- src/game/systems/portal-pad.test.ts src/game/systems/haven-aabb-occupancy.test.ts src/game/systems/haven-city-placement.test.ts src/sprites/prop-colliders.test.ts`
  - `pnpm --filter @empery/server test -- src/services/haven-coords.test.ts src/services/locations-arrival.test.ts`
  - Результат: pass.

## Выводы по состоянию

1. Координаты и геометрия переходов:
   - В `@empery/shared` есть единый источник правды для Haven (`havenWorldFromTile`, `worldToHavenTile`, `havenTravelPadAabb`, door/gate constants).
   - Инварианты покрыты тестами (`haven-coords.test.ts`, `portal-pad.test.ts`).
   - Фактический drift по оффсетам travel pad (+40 по Y) сейчас не обнаружен.

2. Рендер построек:
   - Рендер и коллизия связаны корректно через `placeWorldProp(...)`: при успешной отрисовке сразу создаётся footprint.
   - Для фолбэков (когда текстура не загрузилась) footprint добавляется отдельно, так что проходимость не ломается.
   - Y-sort/depth для props и игрока разделён и консистентен (`depth.ts` + `place-world-prop.ts`).

3. Коллизии:
   - Ground collision включается через `setCollisionByExclusion([...WALKABLE_TILE_GIDS])`.
   - Prop-colliders чистятся и пересоздаются на смене сцены (`clearPropColliders` перед rebuild), что снимает риск stale group после travel.
   - Есть safety nudge игрока и NPC после спавна (`nudgePointFromPropColliders`, tile nudge), застревание в постройках снижено.

## Найденные риски

### 1) Server travel не валидирует топологию переходов от текущей локации

Сейчас `/api/saves/:id/travel` проверяет только `canTravel(save, locationId)` (флаги, приватность, "уже здесь"), но не проверяет, есть ли реальный выход из текущей локации к `locationId`.

Что это означает:
- клиент/скрипт может запросить переход в любую доступную по флагам локацию, даже без физического входа/выхода на карте;
- топология порталов фактически не является обязательной на сервере (она обязательна только в обычном клиентском UX).

Почему важно:
- механика "входов/выходов" становится мягкой договорённостью UI, а не серверным правилом;
- повышает риск обхода progression/маршрута через произвольные HTTP вызовы.

### 2) Схема `parseLocationContent` валидирует только часть полей

`LocationContentSchema` в `packages/shared/src/content-schemas.ts` сейчас не проверяет структуру `zones`, `npcs`, `landmarks`, `enemies` (из-за `.passthrough()` + узкого набора полей), после чего в `locations.ts` данные приводятся к `LocationDefinition`.

Что это означает:
- ошибка в YAML (например, пропущенный `zones[].travelTo`/`x`/`y` тип) может пройти парсер и всплыть только в runtime;
- серверные и клиентские инварианты координат/входов проверяются поздно.

Почему важно:
- для систем с плотной spatial-логикой лучше ловить ошибки контента на этапе загрузки схемой, а не в бою.

## Рекомендованные действия

1. Ужесточить server check в `/travel`:
   - разрешать переход только если из текущей `save.location` существует zone с `travelTo === destination`.
   - отдельным whitelist оставить режимы/фичи fast-travel, если они действительно нужны.

2. Расширить Zod-схему локаций:
   - добавить строгие схемы для `zones`, `npcs`, `landmarks`, `enemies`, `farmSpawn`, `questSpawns`.
   - минимум: типы и обязательные поля координат (`x`, `y`) и `travelTo` для travel-зон.

3. Добавить 2 теста регрессии:
   - server: отклоняет `/travel`, если нет ребра current->dest в `zones`.
   - shared/content: reject malformed `zones`/`npcs` в YAML.

## Статус

- Критичных runtime-блокеров в текущем коде не обнаружено.
- Обнаружены архитектурные риски в server validation и content-schema coverage.
