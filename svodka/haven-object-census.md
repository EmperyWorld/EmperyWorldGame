# Сводка: census всех объектов Гавани

## Дата
2026-09-15

## Что проверяли

Каждый объект против тех же таблиц, что использует игра. Без второго transform.

| Слой | Кол-во | Сверка |
|---|---|---|
| Tiled ground | 80×56 | GID 1/2 walkable, 3 water, 4 wall |
| YAML NPC | 24 | = `HAVEN.npcs` layout `c()` |
| HAVEN_NPC_POSTS | 21 | = YAML, кроме yaml-only |
| Колоссы | 16 | tile center, exclusion table, ≤220px от NPC |
| HAVEN_CITY_PROPS | 568 | = `havenPropPlacements()` |
| Ambient | 147 | тайлы в карте, старт walkable |
| Homes | 21 | не вода |
| Patrol Леона | 17 | walkable |
| Zones | 19 | = layout |
| Stations | 8 | = layout, tile center |
| Landmarks | 52 | tile center, в карте |
| Washes | 22 | tx,ty в карте |
| Districts | 10 | центр в карте |
| Runtime anchors | stage/garrison/tenement/court/HQ plate | литералы в source |

Yaml-only (нет в posts): `town_notice_board`, `stage_bard`, `town_hq_sentry`.

## Два расхождения (доказаны, исправлены)

1. **`prop_stable` x=1920.** Единственный колосс не на центре тайла. Y=2464 = `c(30,38).y` (зона «Конюшня»). X=30×64 без +32. NPC Борис `c(30,40)=(1952,2592)`. Стало **1952,2464**. Дубль в `HAVEN_NPC_LANDMARK_EXCLUSIONS`.
2. **Ambient mira «Свеча за упокой» `[17,51]`.** Комментарий — некрополь. Южная стена layout: `rect(..., WALL_S_TY, ..., 2, 4)` → GID 4 на **ty 50 и 51**. Трава некрополя с ty=52 (рядом hermit `[16,52]`). Стало **`[17,52]`**.

## Замок

`apps/client/src/game/systems/haven-object-census.test.ts` — пустой список issues.

Карта admin «Карта Гавани» рисует эти же слои.
