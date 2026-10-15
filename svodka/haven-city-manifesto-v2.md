# Сводка: Манифест городской застройки Haven v2.0

## Дата
2026-09-15

## Результат

Монолитная Гавань на сетке 80×56: террасные фасады, каменные артерии, отмостки, ~457 пропов, AABB-коллизии зданий = 0.

| Метрика | Значение |
|---|---|
| Props (`HAVEN_CITY_PROPS`) | **457** (цель 450–480) |
| Террасные дома | **18** (ряды встык по X) |
| Колоссы ∩ колоссы | **0** |
| Unique building AABB overlaps | **0** |
| `haven-aabb-occupancy` / `haven-city-placement` / `haven-object-census` | **green** |
| `haven-npc-posts-sync` / `haven-coords` | **green** |
| maps-stamp | `9febc7f1e21b` |

## Архитектура кварталов

- **Запад:** два сплошных ряда @ ty 39 / 45 (шаг 3, size 192).
- **Север:** короткий фасад @ ty 36 (вне двери кузни).
- **Восток:** Г-крыло @ tx 35 (вертикальный ряд).
- **Юг:** перекладина П-двора @ ty 47, **6 секций** 14→29 встык.
- Двор-колодец вокруг тенемента + community garden.

Колоссы (собор / HQ-кампус / казармы / трактир / кузня / рынок) — крупные footprints из `haven-npc-buildings.ts`.

## Слои земли (`ground`, GID после diversify)

Логика в `buildHavenTiles` → Tiled `empery_haven.json`:

| Семантика | Базовый GID | После diversify | Роль |
|---|---|---|---|
| Dirt / plaza A | 1 | 1 / 5 / 6 | грунт, переулки, поля |
| Stone paved | 2 | 2 / 7 / 8 | главные артерии (ширина **3**) |
| Water | 3 | 3 | река / порт |
| Wall | 4 | 4 | периметр стен |
| Gravel yard | 5 | → plaza-варианты | форум, рынок, трактир, плац, порт, конюшня |
| Apron brick | 6 | → plaza-варианты | отмостка под колоссы и террасы (+≈1 тайл) |

Фактический состав ground (после generate):

`1:427 · 2:782 · 3:96 · 4:638 · 5:460 · 6:433 · 7:810 · 8:834`

### Артерии (камень, 3 тайла)

- N–S форум / ворота @ tx 38
- E–W бульвар @ ty 18
- Ветки: гарнизон (СЗ), собор (СВ), рынок (З), ремёсла, конюшня (камень→гравий), порт/HQ, школа

### Переулки и отмостка

- Dirt 1–2 тайла между террасами спального
- Apron под каждым домом и колоссом
- Гравийные площади у рынка / трактира / конюшни / порта

## NPC и двери

Именные посты южнее footprints; резерв 3×3 в пакере **после** террас (чтобы фасады не вытеснялись дверным карманом кузни).

`HAVEN_NPC_POSTS` ↔ YAML ↔ layout — синхронизированы.

## Пакер декора

- Террасы: claim только **ядра** (общий крайний тайл OK), pin без relocate.
- Wall infra / pass-through (`PROP_PASS`: awning, window_box, stage, lamps…) не ломают коллизии.
- Солиды только на свободных тайлах отмостки/дорог.

## Как воспроизвести

```bash
node scripts/generate-maps.mjs
pnpm --filter @empery/shared build
pnpm --filter @empery/client test -- haven-aabb-occupancy haven-object-census haven-city-placement
pnpm --filter @empery/server test -- haven-npc-posts-sync haven-coords
pnpm exec tsx scripts/haven-aabb-audit.mts
```
