# Haven citizens teleport/vanish chaos: root cause and fix

## Симптом
- Жители "рандомно" пропадали/появлялись и телепортировались во время движения.

## Корень проблемы
- В `apps/client/src/sprites/haven-citizens.ts` для части жителей (`phase=at_post`) выполнялся принудительный reseed позиции на **каждом** новом server tick (`serverAt`).
- Это приводило к `setPosition`-пересадке поверх текущего движения, что визуально давало jump/pop-chaos.

## Что говорит практика/документация
- Официальные и общепринятые multiplayer-паттерны для Phaser: не делать жёсткий `setPosition` каждый сетевой тик, а использовать интерполяцию/плавное следование и snap только при крупной рассинхронизации.
- Источники по подходу:
  - Phaser + interpolation (Colyseus tutorial): [Linear Interpolation](https://0-16-x.docs.colyseus.io/tutorial/phaser/linear-interpolation)
  - fixed tick + smooth rendering: [Fixed tick-rate](https://docs.colyseus.io/learn/tutorial/phaser/client-predicted-input)
  - Phaser TimeStep (delta smoothing / rawDelta): [TimeStep API](https://docs.phaser.io/api-documentation/class/core-timestep)

## Исправление
- Удален per-tick reseed в `apps/client/src/sprites/haven-citizens.ts`:
  - убрана логика `scheduleTickAdvanced` + `seedDayPatrolFromServer(...)` на каждом обновлении `serverAt`.
- Оставлены только:
  - join reseed (первичная authoritative расстановка после входа),
  - day/night phase snaps по schedule transitions.

## Результат
- Исчезли постоянные принудительные пересадки позиции, которые создавали хаотичные телепорты.
- Движение жителей снова непрерывное в рамках текущей серверной фазы без "призрачных" pop-in/pop-out на месте.
