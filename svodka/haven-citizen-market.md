# Сводка: Торговец Гавани — пирог и смена у прилавка

## Дата
2026-09-15

## Цель
Изолированный сервис `haven_citizen_market`: повторяемая покупка `market_pie` за 8 адены и разовая помощь у прилавка (−50 stamina, +40 адены). Слухи и советы остаются YAML / `citizen-rumors.ts`.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-citizen-market.yaml` | предмет `market_pie` (consumable, nutrition 10) |
| `content/npcs/haven_citizen_market.yaml` | выборы `citizen_market_pie` / `citizen_market_shift`; nodes rumors/advice без изменений |
| `apps/server/src/services/citizen-market.ts` | логика пирога и смены |
| `apps/server/src/services/citizen-market-dialogue.ts` | плагин generate/apply |
| `apps/server/src/services/citizen-market.test.ts` | тесты |

`citizen-rumors.ts` не правили: только `import { formatCitizenGreeting } from './citizen-rumors.js'`.

## Экспорт

```ts
buyMarketPie(save: PlayerSave): CitizenMarketResult
helpMarketShift(save: PlayerSave): CitizenMarketResult

generateCitizenMarketDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyCitizenMarketChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null
```

- Пирог: 8 адены → `market_pie`, повторяемо.
- Смена: stamina ≥ 50, −50 (`clampPlayerStamina`, 0…`PLAYER_STAMINA_MAX`), +40 адены, флаг `quest_market_shift_complete`. После complete выбор скрыт.
- `apply` → `null` для `citizen_rumors` / `citizen_advice` / `citizen_leave` (generic YAML / DialogueService).
- `generate` только при `npc.id === 'haven_citizen_market'`. Приветствие: `formatCitizenGreeting` + подсказка про смену/пирог.

Чужих предметов (нет `mill_flour`) и квестов других NPC не требуется.

## WIRING

Плагин готов, **DialogueService / HUD / controller не подключены** (запрещено в этом срезе).

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateCitizenMarketDialogue, applyCitizenMarketChoice } from './citizen-market-dialogue.js';
```

В `generate()`, **до** блока `if (input.npcId.startsWith('haven_citizen_'))` (иначе generic citizen перехватит рынок):

```ts
const marketCitizen = generateCitizenMarketDialogue(npc, input.save);
if (marketCitizen) return marketCitizen;
```

В `applyChoice()`, рядом с другими Haven-плагинами (до generic citizen / nextNode):

```ts
const marketCitizen = applyCitizenMarketChoice(npc, save, choiceId);
if (marketCitizen) return marketCitizen;
```

- Механика (`citizen_market_pie`, `citizen_market_shift`) → сервис + follow-up с оставшимися выборами.
- Flavor (`citizen_rumors`, `citizen_advice`, `citizen_leave`) → `null` → существующий citizen-handler (`getCitizenRumors` / `getCitizenAdvice`).

HUD не нужен: смена мгновенная, без active-флага.

## Тесты

`pnpm --filter @empery/server test -- citizen-market`

- покупка пирога: 8 адены → `market_pie`, повтор
- смена один раз: stamina, адена, complete; второй отказ
- `apply` null на `citizen_rumors` / `citizen_advice` / `citizen_leave`
- `generate` содержит `citizen_advice` и `citizen_market_pie`; shift скрыт после complete

## Риски до wiring

Пока `dialogue.ts` не подключён, generate рынка идёт в generic `haven_citizen_*` (приветствие без подсказки про пирог/смену). Выборы YAML `citizen_market_pie` / `citizen_market_shift` без apply не тратят адену и не выдают предмет.
