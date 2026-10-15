# WS reconnect storm: SESSION_REPLACED guard

## Симптом
- В серверных логах повторялись `GET /ws?...` запросы с интервалом около базового reconnect delay.
- Игровая сессия могла зациклиться на переподключениях после возврата в меню/повторного входа.

## Причина
- Сервер при дубликате сессии шлет WS ошибку `SESSION_REPLACED` и закрывает сокет.
- Клиентский `RealtimeGateway` трактовал это как обычный разрыв и продолжал авто-reconnect.
- В результате старый/второй клиент начинал бесконечную «перетяжку» с активной сессией.

## Что изменено
- `apps/client/src/game/systems/RealtimeGateway.ts`
  - Добавлен флаг `reconnectAllowed`.
  - На `connect()` флаг сбрасывается в `true` (явный старт новой сессии).
  - Для фатальных кодов (`SESSION_REPLACED`, `AUTH_REQUIRED`, `FORBIDDEN_SAVE`, `SAVE_NOT_FOUND`, `BAD_SAVE_ID`) reconnect отключается до следующего явного `connect()`.
  - `scheduleReconnect()` теперь проверяет `reconnectAllowed`.

## Почему это работает
- Мы различаем временный сетевой разрыв и фатальную бизнес-ошибку сессии.
- Для фатальных причин авто-восстановление не имеет смысла и только создает шторм.
- Повторный вход в игру по кнопке `Играть/Продолжить` вызывает явный `connect()` и корректно разрешен.

## Проверка
- Добавлен тест `stops reconnect loop after SESSION_REPLACED error` в `apps/client/src/game/systems/realtime-gateway.test.ts`.
- Прогон: `pnpm --filter @empery/client test -- realtime-gateway.test.ts` — успешно.
