# Сводка: spatial + graphics + settings + HUD (rollup)

## Дата
2026-09-16

## Почему

Нужно было зафиксировать в одном месте весь цикл работ: от устранения конфликтов размещения NPC/объектов до переработки графических пресетов, настроек и компактного HUD с новым поведением чата.

## Объём работ (по шагам)

1. Пространственный аудит Haven:
   - устранены пересечения NPC с solid footprint;
   - `solidBoxes()` заменён на `solidSnapshot()` с `blockedTiles`;
   - `snapTile()` и проверки занятости переведены на tile-aware логику.
2. Оптимизация графики:
   - добавлены профили `ultra_sane` и `ultra_sane_90`;
   - сохранение графики/overlay переведено в unified settings store;
   - закрыт кейс тестов без `localStorage` через явный mock.
3. Раздел настроек в игре:
   - добавлена отдельная панель `#settings`;
   - внедрены вкладки `Graphics / Interface / Controls`;
   - добавлен `Reset to Default`.
4. Централизация настроек:
   - введён `settings-store.ts` с schema version + migration;
   - миграция legacy ключей в единый blob;
   - единая typed API: `getClientSetting` / `setClientSetting`.
5. HUD/chat редизайн:
   - удалены blur-полосы и лишние текстовые подсказки;
   - action/survival иконки переведены на WebP ассеты;
   - чат по умолчанию свёрнут, докнут к нижней панели, разворачивается и тянется по высоте;
   - добавлены режимы прозрачности чата (transparent/semi/opaque).

## Ключевые изменения по файлам

| Файл | Что сделано |
|---|---|
| `apps/client/src/sprites/haven-ambient-defs.ts` | Tile-aware snap/occupancy через `SolidSnapshot` |
| `apps/client/src/game/systems/haven-aabb-occupancy.test.ts` | Проверки конфликтов named NPC/ambient vs solid tiles |
| `apps/client/src/game/systems/haven-city-placement.test.ts` | Обновлены ожидания по bbox после snap-правок |
| `apps/client/src/game/systems/graphics-quality.ts` | `ultra_sane`, `ultra_sane_90`, интеграция со settings store |
| `apps/client/src/game/systems/graphics-quality.test.ts` | Тесты новых профилей + mock `localStorage` |
| `apps/client/src/settings-store.ts` | Новый unified store, schema/migration/defaults |
| `apps/client/src/settings-store.test.ts` | Тесты default/migration/normalization |
| `apps/client/src/settings-ui.ts` | Вкладки, reset defaults, UI toggles, chat opacity |
| `apps/client/index.html` | CSS/DOM для settings, компактного HUD и docked chat |
| `apps/client/src/chat-ui.ts` | Persist collapsed state + toggle разворота |
| `packages/media/src/catalog.ts` | Спеки ComfyUI для `ui_action_*` и `ui_need_*` |

## Ошибки, которые закрыты

- `ReferenceError: localStorage is not defined` в тесте `wantPerfOverlay`:
  - исправлено через локальный mock `window`/`localStorage` с cleanup в `finally`.
- Конфликты patch-context в крупных правках CSS/HTML:
  - исправлялось дроблением изменений на узкие hunks.
- Конфликты patch-context при замене emoji на `<img>` в HUD-кнопках:
  - исправлялось поэтапными узкими патчами по отдельным блокам.

## Коммиты цикла

- `566f602` — `feat(client): unify settings store and compact gameplay HUD`
- `f8509f6` — `feat(client): add comfy HUD icons and chat opacity modes`
- `1c3d214` — `feat(client): dock collapsible chat and remove hud blur bands`

## Текущее состояние

- Запрошенные пользователем изменения по этому циклу внесены и закоммичены.
- Рабочее дерево после цикла было чистым.

## Следующий логичный шаг

Второй проход по HUD:
- заменить мини-лейблы ресурсов на связку «иконка + тонкая шкала» для `HP/MP/Stamina/XP`;
- сохранить читаемость в бою и ещё уменьшить визуальный шум.
