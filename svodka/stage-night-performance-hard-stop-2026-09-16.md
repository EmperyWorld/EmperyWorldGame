# Night stage performance hard-stop

## Симптом
- Ночью у сцены мог оставаться активный перформанс (текст/анимация), хотя актеры должны уходить на ночной режим.

## Причина
- Клиент в `haven-stage` полагался в основном на `performancePaused`.
- При пограничном состоянии schedule (рефреш/снап) мог не включаться жесткий стоп по факту ночи.

## Исправление
- `apps/client/src/sprites/haven-stage.ts`
  - пауза перформанса теперь включается при `sched.restActive || sched.performancePaused`;
  - это применено и в начальном `applyScheduleSnap`, и в per-frame `onScheduleUpdate`.

## Почему это правильно
- `restActive` — прямой признак ночного режима.
- Даже если вспомогательный `performancePaused` временно неактуален, выступление ночью больше не продолжится.
