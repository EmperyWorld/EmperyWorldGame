# Haven residential: server-truth humanoids

## Что показало расследование
- Жалобы "дети появляются из ниоткуда на рассвете" и "стражник летает, без нормальной анимации и диалога" подтверждаются архитектурно:
  - в `apps/client/src/sprites/haven-residential.ts` были клиентские tween-актеры (`kids`, `night watchman`, `runner`, `vendor`, `gossip`, `balcony residents`);
  - эти сущности не сервер-авторитетные, не проходят через NPC runtime/schedule truth и часть из них не интерактивна по дизайну.

## Корень
- Смешивались 2 разных класса "людей" в кадре:
  1) server-driven NPC/ambient (источник правды);
  2) purely-client decor humanoids (локальные анимации).
- Пользователь визуально видел их как "жителей", отсюда ложные спавны/исчезновения и "летающий стражник".

## Исправление
- Введён строгий режим по умолчанию: `allowClientDecorHumanoids() === false`.
- В `placeHavenResidentialLife` отключены клиентские humanoid-декорации по умолчанию:
  - court kids/parents, well gossip, sandbox/hopscotch kids,
  - gate musician, delivery runner, night watchman,
  - corner vendor, table diners, laundry worker.
- Базовые props/ambient fx остаются (court prop, cats, ripple, laundry flutter, dust, etc).
- В `placeHavenTenementLife` балконные "жители" показываются только если явно включить `?decorHumanoids`.

## Почему так правильно
- Убирается источник неавторитетных "людей", который конфликтует с требованием "правда только на сервере".
- Баги вида "спавн из ниоткуда / неинтерактивный летающий стражник" больше не маскируются под реальные NPC.

## Диагностика/обратная совместимость
- Для временного сравнения можно вручную включить старый режим: `?decorHumanoids`.

## Проверка
- `pnpm --filter @empery/client typecheck` — OK
- `pnpm --filter @empery/client test -- haven-city-placement.test.ts haven-citizens.test.ts` — OK
