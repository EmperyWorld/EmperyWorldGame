# Сводка: Кузнец Гарольд — заточка и оселок

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_blacksmith`: платная заточка (`smith_edge` / pAtk) и продажа оселка. `forge_armor` / `forge_open` / `forge_leave` остаются у родителя (клиентский магазин доспехов и кузня). HUD нет.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-smith.yaml` | `smith_whetstone` (material, common, 0.15) |
| `content/npcs/town_blacksmith.yaml` | `forge_sharpen` / `forge_whetstone` + старые armor/open/leave |
| `apps/server/src/services/smith-sharpen.ts` | Механика горна |
| `apps/server/src/services/smith-sharpen-dialogue.ts` | `generateSmithDialogue` / `applySmithChoice` |
| `apps/server/src/services/smith-sharpen.test.ts` | Сервис + generate/apply |

Не трогались: `dialogue.ts`, `quest-hud*`, `dialogue-controller`, `haven-npc-plugin.ts`, `haven-services`, `packages/**`, `catalog.ts`, media generate.

## Сигнатуры

```ts
smithSharpen(save: PlayerSave): SmithSharpenResult
smithBuyWhetstone(save: PlayerSave): SmithSharpenResult

generateSmithDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applySmithChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const smithSharpenPlugin: HavenNpcFeaturePlugin
```

Константы: `FORGE_SHARPEN_COST=15`, `FORGE_WHETSTONE_COST=12`, `SMITH_WHETSTONE_ITEM`, бафф `smith_edge` / `pAtk` / 8 / 20 мин / «Острая кромка».

`apply` — `(npc, save, choiceId)`, не `(save, npc, id)`.

## Правила механики

- Заточка: 15 адены, `applyNamedBuff` `smith_edge` (`pAtk` 8, 20 мин), `applyStatsToSave`. Повторно.
- Оселок: 12 адены, `appendItemsToSave` → `smith_whetstone`. Повторно.
- Нет адены → `ok: false`, сейв без списания.
- Greeting: при `quest_board_bounty_complete` — реплика про охоту из `dialogue.ts` (happy), иначе `defaultGreeting`.
- `forge_armor` / `forge_open` / `forge_leave` / `*_bye` → `applySmithChoice` возвращает `null`.
- `generate` только для `town_blacksmith`, иначе `null`. Полное меню (YAML + extras).

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Без двух вставок Гарольд останется YAML/LLM + клиентский shop/forge.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateSmithDialogue, applySmithChoice } from './smith-sharpen-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, рядом с другими Haven NPC, **до** существующего блока `town_blacksmith` и до LLM:

```ts
const smithDialogue = generateSmithDialogue(npc, input.save);
if (smithDialogue) return smithDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, **до** YAML `nextNode` / клиентского forge:

```ts
const smithForge = applySmithChoice(npc, save, choiceId);
if (smithForge) return smithForge;
```

Порядок важен: `forge_armor`, `forge_open`, `forge_leave` вернут `null` и дойдут до текущего кода (магазин доспехов / кузня / закрытие).

HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- smith-sharpen
```

Покрыто: бедность sharpen/whetstone, флаги `smith_edge`, оселок в сумке (повторно), generate содержит `forge_armor`, apply null для `forge_open`, `getItem` грузит `smith_whetstone`.

## Риски

- Без WIRING в `dialogue.ts` новые кнопки видны из YAML, но sharpen/whetstone на applyChoice тихо закроют диалог (`_forge_*` без nextNode) без списания адены.
- Иконка `item_smith_whetstone.webp` может отсутствовать: media/catalog не трогали. Хук generate-item-icon мог бы дописать каталог — откатили.
- Бафф `smith_edge` / pAtk отделён от бани (`bath_steam`) другим `buffId`.
