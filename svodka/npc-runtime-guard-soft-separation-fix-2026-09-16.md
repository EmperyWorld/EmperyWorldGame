# NPC runtime guard soft-separation fix

## Симптом
- Ночной стражник визуально "летит" сквозь дома.

## Корень
- В `apps/client/src/game/systems/NpcRuntime.ts` применялся `applyNpcSoftSeparation()` ко всем видимым NPC, включая server-driven (`town_guard` в фазе `patrol`).
- Этот push выполнялся через прямой `setPosition(...)` без учёта коллизий/улиц, что могло локально сдвигать NPC через преграды и ломать визуальную траекторию.

## Исправление
- `applyNpcSoftSeparation()` теперь **не применяется** к `serverDriven` NPC.
- Для локальных NPC (без серверного schedule) separation дополнительно пропускается через `nudgePointFromPropColliders(...)`, чтобы не сдвигать в твёрдые зоны.

## Почему так
- Server-driven акторы в Haven должны следовать серверной правде и street-route логике, без локальных "физических" коррекций позиции.
- Это убирает класс багов "проталкивания" через здания из клиентского пост-обработчика.

## Проверка
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts realtime-gateway.test.ts` — OK
