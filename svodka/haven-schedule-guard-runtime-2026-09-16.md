# Haven runtime guard for missing server schedule

## Что сделано
- Добавлен runtime guard в `apps/client/src/game/systems/GameplaySession.ts` для `empery_haven`.
- Если `havenSchedule` не приходит:
  - через 1.5s показывается UI-индикатор `Ожидание server schedule...`;
  - через 5s отправляется одноразовый warning в чат и combat feedback.
- После получения server schedule индикатор скрывается автоматически, guard-состояние сбрасывается.

## Почему это нужно
- QA сразу видит проблему синхронизации, а не "тихие" деградации поведения NPC.
- Поведение клиента становится прозрачным: без server schedule мы явно показываем ограниченный режим, а не пытаемся симулировать локально.

## Архитектурное требование
- Для Haven все решения по NPC lifecycle/интеракциям зависят от server snapshot.
- При отсутствии snapshot клиент информирует игрока и не подменяет истину локальным временем.
