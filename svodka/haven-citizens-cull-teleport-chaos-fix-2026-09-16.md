# Haven citizens cull/teleport chaos fix

## Наблюдение
- Жители продолжали "пропадать/появляться/телепортироваться" даже после удаления per-tick reseed.

## Корень
- В `haven-citizens` была агрессивная связка:
  - offscreen-culling (`setVisible(false)`),
  - offscreen movement с `collide: false`,
  - последующий recovery-snap при возврате в кадр.
- Это давало эффект "призраков": пропал за границей/в коллизии, вернулся с jump в новой точке.

## Исправление
- `apps/client/src/sprites/haven-citizens.ts`
  - убрано скрытие `setVisible(false)` для offscreen ambient;
  - offscreen schedule-follow и patrol теперь с `collide: true`;
  - удалён recovery-cull hard-snap `recoverFromCull(...)`;
  - patrol для `at_post` снова проходит через коллизии (без bypass).

## Почему это соответствует практике
- Для сетевых/authoritative сущностей лучше избегать резких скрытий+пересадок между тиками.
- Официальные практики Phaser/сообщества: плавное следование и минимизация hard snaps, особенно вне резких рассинхронов.

## Эффект
- Убраны искусственные pop-in/pop-out переходы и часть визуальных телепортов, вызванных cull-recovery pipeline.
