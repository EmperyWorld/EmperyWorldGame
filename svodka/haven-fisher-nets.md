# Сводка: Рыбак Ульф — наживка и сети

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_fisher`: повторяемая продажа `ulf_bait` (6 адены) и разовая починка сетей (−40 stamina, +45 адены). Доставка рыбы Марте **не трогали** — остаётся в `haven-services.ts`.

## Файлы
- `content/items/haven-fisher.yaml` — `ulf_bait` (material, «Наживка Ульфа»)
- `content/npcs/town_fisher.yaml` — `fisher_bait` / `fisher_nets`; `fisher_shop` и flavor `catch`/`tide` без смены id
- `apps/server/src/services/fisher-nets.ts`
- `apps/server/src/services/fisher-nets-dialogue.ts`
- `apps/server/src/services/fisher-nets.test.ts`

Магазин `haven_fish.yaml` не трогали: `raw_fish` / `cooked_fish` / `dried_fish`.

## Экспорт

```ts
fisherBuyBait(save: PlayerSave): FisherNetsResult
fisherMendNets(save: PlayerSave): FisherNetsResult

generateFisherNetsDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyFisherNetsChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null
```

Константы: `FISHER_BAIT_COST=6`, `ULF_BAIT_ITEM='ulf_bait'`, `FISHER_NETS_STAMINA_COST=40`, `FISHER_NETS_REWARD_ADENA=45`.
Флаг: `quest_ulf_nets_complete` (только complete, без `quest_ulf_nets_active`).
Стамина: `typeof stamina === 'number' ? stamina : PLAYER_STAMINA_MAX`, drain через `clampPlayerStamina`.

## WIRING

### HUD
Complete-only — **активной строки нет**. Не заводить `quest_ulf_nets_active`. Если понадобится пометка после факта:

```ts
import { ULF_NETS_COMPLETE_FLAG } from './fisher-nets.js';
// save.questFlags[ULF_NETS_COMPLETE_FLAG] — сети уже починены, кнопку не показывать
```

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateFisherNetsDialogue, applyFisherNetsChoice } from './fisher-nets-dialogue.js';
```

В `generate`, **после** текущего inline `town_fisher` (доставка рыбы) нельзя ставить plugin первым, пока inline не снят. Когда заменяете блок `town_fisher` в generate:

```ts
const fisherNets = generateFisherNetsDialogue(npc, input.save);
if (fisherNets) return fisherNets;
```

Плагин копирует фильтр/greeting доставки (`quest_fish_delivery_*`), поэтому inline generate Ульфа можно снять целиком.

В `applyChoice`, сразу после schedule-gate (до generic `nextNode`), **до** или рядом с вызовами `haven-services` для `fisher_quest_*`:

```ts
const fisherNets = applyFisherNetsChoice(npc, save, choiceId);
if (fisherNets) return fisherNets;
```

Поведение apply:
- чужой npc → `null`
- `fisher_bait` / `fisher_nets` → `{ save, townMessage, followUp }`
- `fisher_shop`, `fisher_quest_start`, `fisher_quest_claim`, `fisher_catch`, `fisher_tide`, `fisher_leave`, `fisher_catch_bye`, `*_bye` → `null` (shop на клиенте, доставка в `haven-services` / `dialogue.ts`, flavor `nextNode`)

`dialogue-controller.ts`: `fisher_shop` уже открывает `haven_fish`. Не менять.

## Тесты
`pnpm --filter @empery/server test -- fisher-nets`

- покупка наживки: −6 адены, `ulf_bait`, повтор
- сети: stamina < 40 → fail, save без изменений
- сети: −40 stamina, +45 адены, `quest_ulf_nets_complete`
- вторые сети скрыты в generate
- apply `null` для `fisher_shop` и `fisher_quest_start`
- generate содержит `fisher_shop`
- undefined stamina = `PLAYER_STAMINA_MAX`

## Риски до wiring
Пока `dialogue.ts` не подключён, generate Ульфа идёт в текущий inline (без `fisher_bait`/`fisher_nets` в меню, хотя YAML уже содержит кнопки). Apply YAML `_fisher_bait` / `_fisher_nets` тихо закроет диалог без механики. Доставка рыбы не ломается: apply плагина возвращает `null` на `fisher_quest_*` / `fisher_shop`.
