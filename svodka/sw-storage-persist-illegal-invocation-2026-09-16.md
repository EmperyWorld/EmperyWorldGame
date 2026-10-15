# Fix: StorageManager.persist Illegal invocation

## Симптом
- После повторного входа возникал runtime:
  `TypeError: Failed to execute 'persist' on 'StorageManager': Illegal invocation`.
- На фоне ошибки визуально мог ломаться/пропадать часть медиа в интерфейсе.

## Причина
- В `sw-register` метод `navigator.storage.persist` сохранялся в переменную и вызывался без контекста объекта.
- Для Web API методов это ломает `this`-binding и вызывает `Illegal invocation`.

## Исправление
- `apps/client/src/sw-register.ts`
  - заменен вызов на `storage.persist()` через исходный объект `navigator.storage`;
  - добавлен `catch` на промис `persist`, чтобы не ронять цепочку инициализации.

## Почему это корректно
- Web API метод получает правильный receiver (`storage`), поэтому не падает на проверке invocation context.
- Ошибки persist-права (браузер отказал) теперь локально глушатся как нефатальные.
