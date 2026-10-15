# start-all save build hardening

## Проблема
- `start:all` пересобирал `@empery/shared`, `@empery/client`, `@empery/admin`, но не гарантировал свежую сборку `@empery/save`.
- При изменениях в `packages/save` сервер мог стартовать с устаревшим `dist`, что создает риск несогласованного runtime-поведения.

## Что изменено
- `scripts/start-all.sh`
  - обновлён комментарий: backend реально запускается как `tsx runtime` без watch;
  - добавлен обязательный шаг `pnpm --filter @empery/save build` в пайплайн `start:all`.

## Почему так
- `@empery/server` импортирует `@empery/save` как workspace-пакет через собранный `dist`.
- В режиме `start:all` нет watch-пересборки server-зависимостей.
- Явная пересборка на старте исключает запуск сервера на устаревшем пакете.

## Проверка
- `bash -n scripts/start-all.sh` — OK
- `pnpm --filter @empery/save build` — OK
