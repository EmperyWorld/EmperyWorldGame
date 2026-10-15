# Сводка: Подмастерье Гавани — обрезки и меха

## Дата
2026-09-15

## Цель
Изолированный сервис `haven_citizen_craft`: повторяемая покупка `craft_scrap` за 4 адены и разовая смена у мехов (−40 stamina, +35 адены). Слухи и советы остаются YAML / `citizen-rumors.ts`.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-citizen-craft.yaml` | предмет `craft_scrap` (material) |
| `content/npcs/haven_citizen_craft.yaml` | выборы `craft_scrap` / `craft_bellows`; nodes rumors/advice без изменений |
| `apps/server/src/services/citizen-craft.ts` | логика обрезков и мехов |
| `apps/server/src/services/citizen-craft-dialogue.ts` | плагин generate/apply |
| `apps/server/src/services/citizen-craft.test.ts` | тесты |

`citizen-rumors.ts` не правили: только `import { formatCitizenGreeting } from './citizen-rumors.js'`.
`town_blacksmith.yaml` / `smith_whetstone` / `forge_*` не трогали.

## Экспорт

```ts
buyCraftScrap(save: PlayerSave): CitizenCraftResult
pumpCraftBellows(save: PlayerSave): CitizenCraftResult
countCraftScrap(save: PlayerSave): number

generateCitizenCraftDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyCitizenCraftChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null
```

- Обрезки: 4 адены → `craft_scrap`, повторяемо.
- Меха: stamina ≥ 40, −40 (`clampPlayerStamina`, 0…`PLAYER_STAMINA_MAX`), +35 адены, флаг `quest_craft_bellows_complete`. После complete выбор скрыт.
- `apply` → `null` для `citizen_rumors` / `citizen_advice` / `citizen_leave` (generic YAML / DialogueService).
- `generate` только при `npc.id === 'haven_citizen_craft'`. Приветствие: `formatCitizenGreeting` + подсказка про меха/обрезки.

Иконка: `/media/assets/item_craft_scrap.webp`. Каталог не правили вручную (хук мог дописать `item_craft_scrap`).

## WIRING

Плагин готов, **DialogueService / HUD / controller не подключены** (запрещено в этом срезе).

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateCitizenCraftDialogue, applyCitizenCraftChoice } from './citizen-craft-dialogue.js';
```

В `generate()`, **до** блока `if (input.npcId.startsWith('haven_citizen_'))` (иначе generic citizen перехватит подмастерье):

```ts
const craftCitizen = generateCitizenCraftDialogue(npc, input.save);
if (craftCitizen) return craftCitizen;
```

В `applyChoice()`, рядом с другими Haven-плагинами (до generic citizen / nextNode):

```ts
const craftCitizen = applyCitizenCraftChoice(npc, save, choiceId);
if (craftCitizen) return craftCitizen;
```

- Механика (`craft_scrap`, `craft_bellows`) → сервис + follow-up с оставшимися выборами.
- Flavor (`citizen_rumors`, `citizen_advice`, `citizen_leave`) → `null` → существующий citizen-handler (`getCitizenRumors` / `getCitizenAdvice`).

HUD не нужен: смена мгновенная, без active-флага.

## Тесты

`pnpm --filter @empery/server test -- citizen-craft`

- покупка обрезков: 4 адены → `craft_scrap`, повтор
- меха один раз: stamina, адена, complete; второй отказ
- `apply` null на `citizen_rumors` / `citizen_advice` / `citizen_leave`
- `generate` только `haven_citizen_craft`; bellows скрыт после complete

## Риски до wiring

Пока `dialogue.ts` не подключён, generate подмастерья идёт в generic `haven_citizen_*` (приветствие без подсказки про обрезки/меха). Выборы YAML `craft_scrap` / `craft_bellows` без apply не тратят адену и не выдают предмет (`flag: _…` тихо закрывает диалог).
