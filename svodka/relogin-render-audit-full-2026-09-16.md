# Relogin render audit (ESC -> menu -> re-enter)

## Что проверено
- Цепочка world media: `manifest -> world atlas -> BootScene preload -> placeWorldProp`.
- Поведение при новом `Phaser.Game` после `ESC` и повторного входа.
- Полнота prop preload для `empery_haven` и runtime-placed пропов.

## Найденные риски и фиксы
- Исправлен пропуск повторной загрузки world atlas при новом пустом `TextureManager`:
  - `apps/client/src/sprites/texture-loader.ts`.
- Добавлен fallback-догрузчик недостающих `prop_*` прямо в Boot:
  - `apps/client/src/game/systems/ResourceCache.ts`
  - `apps/client/src/game/scenes/BootScene.ts`
  - если atlas неполный/кэш отдал невалидный набор frames, BootScene догружает missing standalone-текстуры до старта `GameScene`.
- Авто-аудит preload-покрытия выявил недостающие ID в Haven:
  - `prop_training_dummy`, `prop_coal_pile`, `prop_flour_sacks`
  - добавлены в `apps/client/src/sprites/location-prop-ids.ts`.

## Тесты
- Новый тест atlas-relogin регрессии:
  - `apps/client/src/sprites/texture-loader.test.ts`
- Обновлен тест покрытия Haven runtime props:
  - `apps/client/src/sprites/location-prop-ids.test.ts`
- Прогон:
  - `pnpm --filter @empery/client typecheck`
  - `pnpm --filter @empery/client test -- texture-loader.test.ts location-prop-ids.test.ts realtime-gateway.test.ts`
  - все успешно.
