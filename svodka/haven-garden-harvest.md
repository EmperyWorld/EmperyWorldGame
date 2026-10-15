# Сводка: Садовник Илья — второй цикл урожая

## Дата
2026-09-15

## Цель
Одноразовый урожай у `town_gardener` **после** полива грядок: принять → забрать 2× `garden_cabbage` + 50 адены. Первый цикл (`garden_accept` / `garden_water` / `garden_leave`) не трогали.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-garden.yaml` | `garden_cabbage` (consumable, nutrition 28, shelfLifeHours 72) |
| `content/npcs/town_gardener.yaml` | `garden_harvest_accept` / `garden_harvest_claim` + старые garden_* |
| `apps/server/src/services/garden-harvest.ts` | механика урожая |
| `apps/server/src/services/garden-harvest-dialogue.ts` | плагин generate/apply |
| `apps/server/src/services/garden-harvest.test.ts` | сервис + фильтры диалога |
| `apps/server/src/services/garden-quest.ts` | **только import** флагов |

Не трогались: `dialogue.ts`, `quest-hud.ts`, `haven-npc-plugin.ts` (types-only import), media generate, shared, прочие NPC YAML.

## Сигнатуры

```ts
acceptHarvest(save: PlayerSave): GardenHarvestResult
claimHarvest(save: PlayerSave): GardenHarvestResult

generateGardenHarvestDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyGardenHarvestChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const gardenHarvestPlugin: HavenNpcFeaturePlugin
```

Флаги: `quest_garden_harvest_active`, `quest_garden_harvest_complete`.
Предмет: `garden_cabbage` ×2. Награда: 50 adena. Prerequisite: `quest_garden_complete`.
HUD-константа: `GARDEN_HARVEST_HUD`.

Choice ids:
- `garden_accept` / `garden_water` / `garden_leave` — fallthrough (`apply` → `null`)
- `garden_harvest_accept` — `acceptHarvest`
- `garden_harvest_claim` — `claimHarvest`

## Правила generate

Плагин **всегда** отдаёт меню для `town_gardener` (иначе wiring до YAML-блока спрячет полив). Фильтр как в `dialogue.ts`:

- `garden_accept` — скрыт, если watering active **или** complete
- `garden_water` — только если watering active и не complete
- `garden_harvest_accept` — после `quest_garden_complete`, пока урожай не взят и не сдан
- `garden_harvest_claim` — пока `quest_garden_harvest_active`
- `garden_leave` — всегда

Приветствия: watering active / watering complete (как сейчас) → harvest active («Забери урожай») → harvest complete («спасибо»).

## WIRING (интегратор)

`dialogue.ts` и `quest-hud.ts` **не** подключены в этом диффе.

### 1. `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateGardenHarvestDialogue, applyGardenHarvestChoice } from './garden-harvest-dialogue.js';
```

`DialogueService.generate` — в кластере Haven-плагинов **до** `if (input.npcId === 'town_gardener')` (иначе существующий return перехватит):

```ts
const gardenHarvest = generateGardenHarvestDialogue(npc, input.save);
if (gardenHarvest) return gardenHarvest;
```

`DialogueService.applyChoice` — в том же кластере, **до** generic `_` / `nextNode`:

```ts
const gardenHarvestChoice = applyGardenHarvestChoice(npc, save, choiceId);
if (gardenHarvestChoice) return gardenHarvestChoice;
```

Порядок важен: `garden_accept` / `garden_water` / `garden_leave` вернут `null` и дойдут до существующих хендлеров.

### 2. HUD — `apps/client/src/quest-hud.ts`

В блок активных квестов (после `quest_garden_active` или рядом с miller/scribe):

```ts
if (hasFlag(s, 'quest_garden_harvest_active')) {
  return 'Квест: забери урожай у садовника Ильи [E]';
}
```

Плюс кейс в `quest-hud.test.ts`. Константа: `GARDEN_HARVEST_HUD` из `garden-harvest.ts`.

## Тесты

`pnpm --filter @empery/server test -- garden-harvest`

- accept без `quest_garden_complete` → отказ
- accept после полива → active; повтор → напоминание
- accept после harvest complete → отказ
- claim без active → отказ
- claim: 2 капусты + 50 adena, complete, active снят
- второй claim → отказ (one-time)
- generate всегда для Ильи; null для чужого NPC
- фильтр accept/water как в watering-квесте
- apply null на `garden_accept` / `garden_water` / `garden_leave`

## Риски

- Пока `generateGardenHarvestDialogue` не вызван **перед** блоком `town_gardener`, YAML-кнопки урожая видны всегда (`return true` в старом фильтре). Клик по `_garden_harvest_*` — no-op (флаг с `_`).
- Пока HUD не подключён — нет полоски «забери урожай».
- Иконка `item_garden_cabbage.webp` не генерировалась (запрет media). YAML `icon:` указывает путь; хук мог добавить stub в catalog/manifest.
- `appendItemsToSave` всегда дописывает — claim не фейлится по месту в сумке.
- Не пересекается с watering-наградой (`bread_loaf` / 80 adena) — отдельный цикл.
