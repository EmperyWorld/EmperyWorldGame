# Haven citizens traffic-jam yield fix

## Наблюдение по bug-репортам
- На утреннем расходе (`walking_to_post`) массово:
  - `walking_to_post_retry_no_snap`
  - `walking_to_post_repath_abort`
- Это соответствует "столкнулись и не могут разойтись" на узких участках.

## Исправление
- Файл: `apps/client/src/sprites/haven-citizens.ts`

1) **Near-post arrival tolerance**
- Добавлен `NEAR_POST_ARRIVE_PX = 140`.
- Если житель уже близко к посту:
  - в `walking_to_post` → `resumeDayPath()` без бесконечных retry,
  - в `at_post` при repath-abort → также считаем прибытие.

2) **Lane yield при клине**
- Добавлен `applyLaneYield(...)`:
  - переворачивает lane (`-1/+1`),
  - смещает в перпендикуляр к цели,
  - прогоняет через `nudgePointFromPropColliders`.
- Вызывается при `walking_to_post_retry_no_snap` и `at_post_repath_abort_retry_no_snap`.

## Почему
- Раньше логика при клине только сбрасывала route + ждала, что порождало цикл retry.
- Теперь есть активный механизм разъезда + мягкое условие прибытия у поста.

## Проверка
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts haven-city-placement.test.ts` — OK
