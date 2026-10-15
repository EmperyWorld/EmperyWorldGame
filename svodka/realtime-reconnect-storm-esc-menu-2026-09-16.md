# Сводка: reconnect-шторм WS после ESC -> меню -> повторный вход

## Дата
2026-09-16

## Симптом

- После выхода в меню через `Esc` и повторного входа тем же персонажем сервер начинал получать серию `GET /ws` с одинаковым `saveId`.
- Кнопка `Продолжить` могла оставаться неактивной, а `Играть` в списке работала.

## Причина

В `RealtimeGateway` была гонка старого и нового сокета:
- `connect()` делал `disconnect()`, затем сразу сбрасывал `intentionalClose=false` и открывал новый сокет;
- поздний `close` от старого сокета попадал в общий обработчик и запускал `scheduleReconnect()`;
- при этом `openSocket()` блокировал только `CONNECTING`, но не `OPEN`, что позволяло создавать лишние параллельные подключения.

Плюс в `returnToMenu()` не возвращалась активность `continueBtn`.

## Исправление

- `apps/client/src/game/systems/RealtimeGateway.ts`
  - введён `connectionEpoch` для изоляции поколений подключения;
  - `message/close` обрабатываются только для актуального epoch;
  - `close` игнорируется для stale socket (`this.socket !== socket`);
  - `openSocket()` теперь не открывает новый сокет, если текущий уже `OPEN` или `CONNECTING`;
  - reconnect планируется в рамках текущего epoch.
- `apps/client/src/session-lifecycle.ts`
  - в `returnToMenu()` добавлено `deps.continueBtn.disabled = false`.

## Тест

- Добавлен `apps/client/src/game/systems/realtime-gateway.test.ts`:
  - проверяет, что `close` от устаревшего сокета не запускает новый reconnect.

## Результат

- Повторный вход тем же персонажем не должен порождать каскад новых `/ws`.
- Кнопка `Продолжить` после возврата в меню снова доступна.
