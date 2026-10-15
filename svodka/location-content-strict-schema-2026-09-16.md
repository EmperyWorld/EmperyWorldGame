# Strict server-side location content validation

## Что было не так
- `parseLocationContent` в `@empery/shared` валидировал только базовые поля локации.
- Блоки `npcs`, `zones`, `landmarks`, `enemies` и связанные структуры фактически проходили в loose-режиме.
- Ошибки/опечатки в YAML могли доехать до runtime и ломать поведение уже во время игры.

## Что сделано
- В `packages/shared/src/content-schemas.ts` введены строгие схемы:
  - `LocationNpcSchema`
  - `LocationZoneSchema`
  - `LocationLandmarkSchema`
  - `LocationEnemySpawnSchema`
  - `LocationQuestSpawnSchema`
  - `LocationQuestCompleteSchema`
  - `LocationFarmSpawnSchema`
- `LocationContentSchema` расширен полным набором полей локации и переведен в `.strict()`.
- Добавлены проверки диапазонов и структур:
  - `anomalyTier` только `1..4`;
  - `recommendedLevel.max >= recommendedLevel.min`;
  - `questSpawns[].enemies` и `farmSpawn.points` не пустые;
  - числовые координаты и радиусы — finite/positive по месту.

## Валидация
- Добавлен тест: `apps/server/src/services/location-content-schema.test.ts`.
- Тесты покрывают:
  - успешный парс реального `empery_haven.yaml`;
  - падение на некорректном `zones.travelTo`;
  - падение на неизвестном top-level ключе;
  - падение на пустом `questSpawns[].enemies`;
  - падение на инверсии `recommendedLevel`.

## Почему это правильно
- Ошибки контента ловятся на сервере в момент загрузки YAML, а не в runtime.
- Это напрямую поддерживает принцип "истина на сервере": сервер принимает только консистентные, строго валидированные world данные.
