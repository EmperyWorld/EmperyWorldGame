# Haven citizens dawn exit + no small-distance snap

## Что ты наблюдал
- Ночью часть жителей у форума "ходит вверх-вниз".
- В 07:00 дети и часть жителей появляются мгновенно, без видимого выхода из домов.

## Найденный корень
- В `walking_to_post` клиент слишком рано сбрасывал `asleep=false` и сразу делал `showCitizenOutdoors()`.
- Из-за этого ветка анимации выхода из дома не запускалась (NPC уже считался "проснувшимся"), и появление выглядело как спавн.
- Дополнительно оставались локальные `setPosition(post)` снапы при коротких route-abort, что визуально давало микротелепорты.

## Исправление
- Файл: `apps/client/src/sprites/haven-citizens.ts`
  - В `applyCitizenSchedule(..., phase=walking_to_post)`:
    - сначала фиксируем `wasHiddenOrAsleep`,
    - если нужно — запускаем `homeExitTransition`,
    - только после завершения transition делаем `asleep=false` и обычный route.
  - В `snapCitizenToSchedule(...)`:
    - для `walking_to_post` (не force) добавлен defer для скрытых жителей: не раскрываем мгновенно, ждём per-frame exit transition.
  - Убраны короткие принудительные `setPosition`:
    - snap к посту теперь только при действительно большом разрыве (`> HARD_SNAP_DIST`),
    - иначе route retry без телепорта + debug reason.

## Почему это правильно
- Появление утром становится физически непрерывным: "вышел из дома -> пошёл".
- Телепорты от локальной клиентской аварийной коррекции на малых дистанциях убраны.
- Жёсткий snap остаётся только как guard от экстремальной рассинхронизации.

## Проверка
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts haven-city-placement.test.ts` — OK
