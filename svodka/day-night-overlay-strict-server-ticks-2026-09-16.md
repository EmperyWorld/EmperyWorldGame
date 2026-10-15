# Day-night overlay: strict server ticks only

## Что изменено
- Файл: `apps/client/src/day-night-overlay.ts`.
- Удалена клиентская интерполяция времени по `Date.now()` между server tick'ами.
- `DayNightOverlay` теперь обновляет snapshot только через `setWorldTime(...)` (входящий `world_time` от сервера).
- `currentClock()` и `currentSnapshot()` возвращают последний серверный snapshot без локального пересчета.

## Почему так
- Это устраняет даже визуальный drift от локального времени клиента.
- Политика становится однозначной: источник времени один — сервер.
- Любые рассогласования между клиентами из-за local clock (таймзона, sleep/wake, tab throttling) исключаются.

## Технические детали
- Добавлено поле `snapshot` для хранения последнего примененного server snapshot.
- `setProfile(...)` теперь переапплаит текущий snapshot под location profile без изменения времени.
- `onResize()` переапплаит текущий snapshot, чтобы перестроить звезды/оверлей после смены размера.
