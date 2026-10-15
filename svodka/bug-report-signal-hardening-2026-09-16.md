# Bug report signal hardening

## Наблюдение
- Первые bug-репорты были, но `npcLifeEvents` почти полностью состояли из повторяющегося `phase_hidden`.
- Это зашумляло полезные события и мешало анализу фокуса по конкретному NPC (например, "мельник Фаулий").

## Что улучшено
- `apps/client/src/sprites/haven-citizens.ts`
  - Добавлен дедуп событий в буфере (`slot + reason + schedKey + transition`, окно 1200ms).
  - В `applyCitizenSchedule` для `hidden/at_home` добавлен ранний выход, если NPC уже скрыт и фаза не поменялась.
- `apps/client/src/boot-app.ts`
  - В bug-report добавляется контекст UI-фокуса:
    - текущая цель из `#hud-target-name` или `#dialogue-npc-name`,
    - `document.activeElement` (tag/id/class),
    - всё это попадает в `note`.

## Почему
- Репорт теперь содержит меньше шумовых повторов и больше полезной диагностики по конкретной цели/фокусу.
- Это делает кнопку `Bug` пригодной для системной отладки разных багов, не только NPC.

## Проверка
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts` — OK
