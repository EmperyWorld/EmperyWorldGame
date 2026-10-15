# Haven citizens: remove live at_post hard-snap

## Что увидели в bug-репортах
- В вечерних кликах (`hour ~21`) почти всё корректно шло в сон, но оставались единичные:
  - `snap_post_hard` с gap ~665/757.
- Это объясняет визуальные "дёрнулся/встал" во время массового перехода.

## Исправление
- Файл: `apps/client/src/sprites/haven-citizens.ts`
- В `snapCitizenToSchedule(..., phase=at_post)`:
  - hard snap оставлен только для `force` bootstrap-сценариев;
  - на live-апдейтах при большом разрыве теперь route-recover через `beginStreetRoute(...)`, без `setPosition(...)`.

## Почему
- Убираем последний живой клиентский телепорт в обычном runtime.
- Сохраняем непрерывность движения при возвращении к посту даже после рассинхрона.

## Проверка
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts` — OK
