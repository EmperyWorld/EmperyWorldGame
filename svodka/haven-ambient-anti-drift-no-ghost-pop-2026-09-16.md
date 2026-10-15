# Haven ambient anti-drift (no ghost pop on reload)

## Симптом
- После reload/relogin жители могли резко "оказаться в других местах".
- Во время наблюдения часть жителей визуально "пропадала/появлялась" как будто призраки.

## Корень
- Для `phase=at_post` часть поведения оставалась локально "живой":
  - паузы на приветствие игрока;
  - social-chat паузы;
  - soft-separation и коллизионные подталкивания.
- Эти локальные сайд-эффекты уводили клиентов от одной и той же server timeline.
- После reload клиент пересаживал crowd обратно к server-based фазе, что выглядело как резкий reset.

## Исправление
- Файл: `apps/client/src/sprites/haven-citizens.ts`.
- Для schedule-driven дневных жителей (`entry.phase === 'at_post'`):
  - на каждом новом `havenSchedule.serverAt` выполняется re-anchor от server tick (`seedDayPatrolFromServer`);
  - отключены локальные player-greet и social-chat паузы;
  - выключено коллизионное подталкивание в patrol-сегменте (`walkPatrolSegment(..., collide=false)`);
  - исключены из soft-separation.

## Результат
- Позиции жителей больше не "уплывают" между клиентами из-за локальной косметической логики.
- Reload/relogin перестает давать эффект "другой толпы" и "призрачных" перестановок.
