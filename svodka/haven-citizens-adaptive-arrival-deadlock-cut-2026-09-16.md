# Haven citizens adaptive arrival deadlock cut

## Что видно по новым bug-репортам
- После прошлой правки заторы резко уменьшились, но остались точечно:
  - `walking_to_post_retry_no_snap`
  - `walking_to_post_repath_abort`
- Повторяются на узких коридорах с gap ~200-466 (иногда больше).

## Что добавлено
- `apps/client/src/sprites/haven-citizens.ts`
  - `arriveToleranceForWalkT(walkT)`:
    - ранняя фаза пути — строгий порог,
    - ближе к концу server commute порог плавно расширяется до `480px`.
  - В `walking_to_post`:
    - near-post arrival теперь проверяется адаптивным порогом,
    - при retry добавляется `arriveTol` и `walkT` в debug.
  - В `at_post`:
    - при repath-abort также применяется адаптивный порог прибытия.
  - Сохраняется `lane yield` (боковой разъезд) при клине.

## Почему
- Когда сервер уже практически довёл жителя до поста, но локально узкий проход держит клин, продолжать бесконечные retry хуже, чем мягко завершить переход и вернуть в day-cycle.

## Проверка
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts` — OK
