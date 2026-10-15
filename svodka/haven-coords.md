# Сводка: система координат Гавани + census-карта

## Дата
2026-09-15

## Задача

Не угадывать NPC/HQ. Проверить гипотезы по коду, зафиксировать формулу, нарисовать фактическую карту из тех же таблиц, что использует игра.

## Гипотезы → проверка

| # | Гипотеза | Вердикт | Доказательство |
|---|---|---|---|
| H1 | YAML `x/y` — индексы тайлов | **Ложь** | `scripts/layouts/empery_haven.mjs` пишет `...xy(c(14,11))`. `c = (tx,ty) => [tx*TW+TW/2, ty*TW+TW/2]`. YAML капитан `(928, 736)`. |
| H2 | YAML уже world px (центр тайла) | **Истина** | Тот же `c()`. `havenTileCenter` / `havenWorldFromTile` совпадают. |
| H3 | Phaser/Tiled флипают Y (юг сверху) | **Ложь** | Orthogonal Tiled, tilemap в `(0,0)`, `worldToHavenTile` = `floor(x/64), floor(y/64)`. Север = малый Y. |
| H4 | Спрайт пропа стоит на записанной точке как центр | **Ложь** | `texture-loader` `setOrigin(0.5, 0.72)`. AABB: `[x±s/2] × [y−0.72s, y+0.28s]`. Фасад севернее точки. |
| H5 | Персонаж origin 0.5/0.5, размер 64 | **Ложь** | `sprite-loader` `setOrigin(0.5, 0.55)`, `DISPLAY_SIZE = 48`. |
| H6 | `fillEllipse(x,y,w,h)` — top-left | **Ложь** | Phaser: центр `(x,y)`, `w/h` — диаметры. `fillRect` — top-left. |
| H7 | Travel — круг YAML `radius` в `(zone.x, zone.y)` | **Ложь** | `PortalSystem`: `rectangle(zone.x, zone.y+40, r*1.6, r*1.1)`, origin 0.5. Default `r = zone.radius ?? 56`. |
| H8 | Grove и Haven YAML в одной системе | **Частично** | Haven/HQ — центры тайлов. Grove spawn может быть угол `n*64`. Не смешивать. |
| H9 | Все слои живут в YAML | **Ложь** | YAML+Tiled+shared posts/homes — да. Props/districts/ambient/washes/place* — клиентские таблицы, сервер их не импортирует. |

## Формула (единственная)

```
TW = 64
worldX = tx * TW + TW/2     // = tx*64 + 32
worldY = ty * TW + TW/2
tx = floor(worldX / TW)
ty = floor(worldY / TW)
map = 80×56 тайлов = 5120×3584 px
(0,0) = СЗ, +X восток, +Y юг. Второго transform нет.
```

Код: `c()` в `empery_haven.mjs`, `havenWorldFromTile` / `havenTileCenter`, `worldToHavenTile`.

## Методика расчёта (не интуиция)

1. Авторство: тайл `(tx,ty)` в layout → `c()` → YAML px и `haven-city-data.ts` (generate-maps).
2. Игра читает YAML px как есть. Не делить на 64 при спавне NPC.
3. Ambient: тайлы → `havenWorldFromTile` в рантайме.
4. Homes/patrol: тайлы в shared → `havenTileCenter`.
5. Проп/колосс: записанная точка = origin `(0.5, 0.72)`, не визуальный центр.
6. Ореол района: `fillEllipse` вокруг **центра** `(x,y)` или `px(tx,ty)`.
7. HQ-плита: `fillRect(58*tw, 31*tw, 13*tw, 9*tw)` — **угол** тайла, не `c(58,31)`.
8. Travel: хитбокс смещён на `y+40`, прямоугольник, не круг.
9. Перед правкой позиции: клик по admin-карте, смотреть `source=` и `postMatch`. Не двигать «на глаз».

## Источники истины vs копии

| Слой | Источник | Карта |
|---|---|---|
| Геометрия GID 1–4 | `apps/client/public/maps/empery_haven.json` | dump.tiles |
| Spawn / NPC / zones / stations / landmarks | `content/locations/empery_haven.yaml` | dump.* |
| Work posts | `packages/shared/src/haven-npc-posts.ts` | dump.npcs.postMatch |
| Homes / patrol | `haven-npc-homes.ts` | dump.homes / guardPatrol |
| Пропы | `haven-city-data.ts` (generated) | admin import |
| Колоссы / districts | `haven-npc-buildings.ts` | admin import |
| Ореолы tx,ty | `haven-district-washes.ts` | admin import |
| Ambient | `haven-ambient-defs.ts` | admin import |
| Stage/garrison/tenement/court/HQ plate | литералы в `location-decor` / `haven-residential` | dump.runtimeAnchors |

Не в census: дети `placeHavenStage` / garrison / crafts — процедурные смещения от якоря. На карте якорь + note.

## Dev-сервис

- Admin `:5190` → вкладка **Карта Гавани**.
- `GET /api/admin/debug/haven-map` (`requireAdmin`). В production 404, пока `EMPERY_DEBUG_HAVEN_MAP=1`.
- Сервер отдаёт YAML+Tiled+shared. Клиентские Phaser-free модули подмешивает admin — те же import, что у игры.
- Клик: world px, тайл, `source`, `postMatch`. Красный NPC = YAML ≠ `HAVEN_NPC_POSTS`.

## Код формулы

`packages/shared/src/haven-coords.ts` — `havenWorldFromTile`, AABB пропа/эллипса/персонажа/travel pad.
