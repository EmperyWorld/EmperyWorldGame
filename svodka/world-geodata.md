# Сводка: геодата / коллизии / физика

## Дата
2026-09-15

## Проблема

Walkable geodata жила одной строкой `setCollisionByExclusion([1, 2])`. Клик по крыше/воде вёл в стену до «Путь заблокирован». NPC nudge знал только пропы, не тайлы. Dash 420 на тонких static-box (8px) мог проскочить стену на низком FPS.

## Что сделано

| Место | Зачем |
|---|---|
| `world-geodata.ts` | GID 1–2 walkable; `pullTowardWalkable`; nudge с colliding cell |
| `world-tiles.ts` | ground layer в `scene.data`; `isTileBlockedAt` |
| клик | цель стягивается к игроку, пока не выйдет из стены/пропа |
| `nudgePointFromPropColliders` | после пропов ещё тайлы — граждане не стоят в воде |
| `TILE_BIAS=40`, arcade `fps: 60` | меньше тоннеля рывка сквозь клетку 64 |
| min static box 12px | тонкие столбы не исчезают на шаге dash |

Без navmesh / A*. Прямой клик, но не внутрь solid.
