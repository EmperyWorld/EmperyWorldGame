# Haven citizens lifecycle debug + mount stamina payload slimming

## 1) Диагностика исчезновений/телепортов жителей

- Файл: `apps/client/src/sprites/haven-citizens.ts`
- Добавлен debug-режим по query-параметру `npcLifeDebug`:
  - включение: `http://127.0.0.1:5180/?npcLifeDebug`
  - вывод в `console.info('[haven-citizens]', ...)` с причинами смен состояния.

### Что логируется
- `schedule_phase_change` (phase/asleep/walkT),
- `snap_force_commute`, `snap_hard_gap`, `snap_post_hard`,
- `walking_home_repath_abort`, `walking_to_post_repath_abort`,
- `home_enter_start`, `home_enter_done_hide`, `home_exit_start`, `home_exit_done`,
- `phase_hidden`, `phase_at_home`, `show_outdoors`.

### Зачем
- Чтобы точно видеть причинно-следственную цепочку: почему NPC исчез/появился и был ли это корректный переход, hard-snap или аварийный route-abort.

## 2) Раздутый ответ `POST /api/saves/:id/mount/stamina`

- Файл: `apps/server/src/index.ts`
- Было: сервер возвращал весь `save` (крупный JSON).
- Стало: сервер возвращает только минимальный срез:
  - `save.id`
  - `save.mount`
  - `stats.mountStamina`, `stats.mountCanRun`

- Файл: `apps/client/src/api.ts`
  - Тип `syncMountStamina` обновлен под минимальный ответ (`Pick<PlayerSave, 'id' | 'mount'>`).

### Почему
- Для stamina-sync не нужен полный объект персонажа.
- Меньше трафика, меньше сериализация/парсинг, меньше шум в network trace.

## Проверка
- `pnpm --filter @empery/server typecheck` — OK
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts realtime-gateway.test.ts` — OK
