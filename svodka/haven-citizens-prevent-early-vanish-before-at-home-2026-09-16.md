# Haven citizens: prevent early vanish before `at_home`

## Что показали последние 2 репорта
- Оба репорта на `hour ~ 23.40`.
- В `npcLifeEvents` только `walking_home_wait_hidden` (120/120).
- При этом серверный `ambient` содержит много `walking_home`, а не только `at_home`.

## Корень
- Клиент завершал "вход в дом" и скрывал жителя раньше, чем серверная фаза доходила до конца перехода (`walking_home` продолжалась).
- Визуально это выглядело как "просто исчез".

## Исправление
- Файл: `apps/client/src/sprites/haven-citizens.ts`
- Для `walking_home` добавлен серверный гейт:
  - вход в дом/скрытие разрешены только когда `entry.walkT >= 0.94` (`HOME_ENTER_MIN_WALKT`).
- До этого момента житель:
  - доходит до дверной точки,
  - ждёт у двери видимым (с north-idle),
  - не скрывается преждевременно.
- Если житель уже оказался скрыт рано, добавлено восстановление (`walking_home_unhide_early`).

## Почему так
- Синхронизация с server truth: исчезновение теперь связано с концом серверного commute, а не с локальной скоростью добегания до дома.

## Проверка
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-citizens.test.ts` — OK
