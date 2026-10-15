# Сводка: Улучшение механики движения жителей/NPC в Гавани

## Дата
2026-09-15

## Цель
Комплексный пакет (п.4): street-aware дневной wander + personal space + тротуары + плавный commute.

## Изменения

### Shared (`packages/shared/src/haven-street-path.ts`)
- `havenActorLane` — стабильная полоса −1/+1 по слоту/id
- `offsetWorldPathForLane` / `havenStreetWorldPathLaned` — смещение polyline на «тротуар»
- `softSeparatePosition` — мягкое разведение тел
- `HAVEN_SIDEWALK_OFFSET_PX = 14`

### Именованные NPC (`NpcRuntime.ts`)
- Commute `walking_home` / `walking_to_post`: маршрут к финальной точке (дом/пост), без дёрганья за live-sample
- Patrol: follow sample с порогом repath 72px + lane
- Дневной wander: цели через street path (не прямая через кварталы)
- Soft separation между outdoor NPC
- Stuck recovery: skip vertex + force repath

### Ambient горожане (`haven-citizens.ts`)
- Все street-маршруты с lane offset
- Stuck: сначала lateral nudge + repath (22 кадра), потом skip (40)
- Soft personal space каждые 4 кадра (с prop nudge)

## Верификация
- `pnpm typecheck` — ok
- Server tests 347 passed (+3 новых street/lane/separation)
- Client tests 65 passed
- `pnpm build` — ok
