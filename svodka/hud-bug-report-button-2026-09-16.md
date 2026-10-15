# HUD bug report button

## Что сделано
- Добавлена кнопка `Bug` в HUD: `apps/client/index.html` (`#action-bug`, hotkey `B`).
- В `apps/client/src/overlay-controller.ts` добавлен обработчик кнопки и хоткея `B`.
- В `apps/client/src/boot-app.ts` реализована сборка диагностического пакета и отправка на сервер.
- В `apps/client/src/api.ts` добавлен клиентский API `submitBugReport(...)`.
- В `apps/server/src/index.ts` добавлен endpoint `POST /api/debug/bug-report`.

## Что отправляется
- URL страницы, user-agent, timestamp.
- `saveId`, `locationId`.
- `worldTime` (час), `havenSchedule`.
- клиентские `settings`, `graphicsQuality`.
- последние события `npcLifeEvents` (буфер до 120).

## Где сохраняется
- Сервер пишет JSONL в `data/bug-reports.jsonl`.
- Каждый репорт получает `reportId`, который показывается в toast на клиенте.

## Почему это полезно
- Репорты становятся воспроизводимыми: есть состояние игры + последние причины смены состояний NPC.
- Канал универсальный для любых багов, не только телепортов.

## Проверка
- `pnpm --filter @empery/server typecheck` — OK
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts` — OK
