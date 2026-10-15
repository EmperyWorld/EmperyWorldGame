# NPC pathing mechanic (official guidance + implementation)

## Что говорит движок (официально)
- У Phaser (Arcade Physics) нет встроенного pathfinding/obstacle avoidance для NPC.
- Официальные материалы Phaser для pathfinding рекомендуют внешние подходы:
  - grid A* (часто через EasyStar.js),
  - navmesh-плагины (например phaser-navmesh, в Phaser 3 экосистеме).
- Для нашего стека (Phaser 4 + текущая карта/коллизии) выбран engine-native путь: отдельный runtime path-модуль в проекте.

## Проблема до изменения
- Жители/часть NPC ходили по предзаданному street polyline без runtime проверки на реальные блокеры текущей сцены.
- Из-за этого возникали проходы "сквозь сцену/здания", застревания и резкие исчезновения при репозиционировании.

## Новая отдельная механика
- Новый модуль: `apps/client/src/sprites/npc-pathing.ts`.
- Что делает:
  - строит базовый маршрут от `havenStreetWorldPathLaned(...)`;
  - валидирует сегменты по runtime препятствиям:
    - проп-коллизии (`isInsidePropAabb`),
    - коллизии тайлов (`isTileBlockedAt`);
  - если базовый маршрут блокируется, автоматически переключается на fallback A* (grid, 32px cell);
  - сглаживает результат line-of-sight проходом;
  - кэширует маршруты по tile-key + lane.

## Интеграция
- `apps/client/src/sprites/haven-citizens.ts`
  - уличные маршруты ambient жителей переведены на `buildNpcRoute(...)`.
- `apps/client/src/game/systems/NpcRuntime.ts`
  - server-driven маршруты интерактивных NPC переведены на `buildNpcRoute(...)`.
- `apps/client/src/game/systems/EntityManager.ts`
  - при shutdown очищается path cache через `clearNpcStreetCache()`.

## Debug-инструмент для карты
- Query-параметр `?npcPathDebug` включает overlay маршрутов NPC.
- Показывает последние маршруты:
  - зеленый: базовый street-route,
  - голубой: fallback A*,
  - красный маркер: точка, где базовый маршрут был заблокирован коллизией.
- Нужен для быстрой диагностики кейсов "идет сквозь сцену", "застрял", "исчез/телепортнулся".

## Почему это "по-взрослому"
- Механика путей выделена в отдельный слой, а не размазана по двум системам.
- Решение учитывает реальные runtime-коллизии сцены, а не только идеальный топологический маршрут.
- Поведение одинаковое для ambient и интерактивных NPC, что снижает рассинхроны и edge-case баги.
