# Сводка: Конюх Борис — уход за скакуном

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_stable`: чистка копыт, кормление, продажа сена через диалог (не shop UI). Лошади по-прежнему через `/api/mounts`. Flavor YAML (`stable_mount`, `stable_charge`, `stable_puppy`, `stable_leave`) сохранён.

## Файлы
- `content/items/haven-stable.yaml` — `stable_hay` (material, корм)
- `content/npcs/town_stable.yaml` — `stable_groom` / `stable_feed` / `stable_buy_hay` + старые реплики
- `apps/server/src/services/stable-care.ts`
- `apps/server/src/services/stable-care-dialogue.ts`
- `apps/server/src/services/stable-care.test.ts`

Shop YAML не трогали: `haven_stable.yaml` offers пустой.

## Экспорт
```ts
stableGroomMount(save: PlayerSave): StableCareResult
stableFeedMount(save: PlayerSave): StableCareResult
stableBuyHay(save: PlayerSave): StableCareResult

generateStableDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyStableChoice(save: PlayerSave, npc: HavenNpcLike, choiceId: string): HavenNpcChoiceResult | null
```

Цены: чистка 15 адены, корм 8 адены (или 1 `stable_hay`), охапка сена 6 адены.
Корм: +400 stamina (clamp 0–1000). Чистка: stamina → max, `staminaAt` = now.

## Флаги
Quest HUD не нужен. Бафф чистки пишет named-buff флаги (через `applyNamedBuff`, не квест):

- `buff_sup_stable_groom_val` = 18
- `buff_sup_stable_groom_stat` = `speed`
- `buff_sup_stable_groom_name` = «Свежие копыта»
- `buff_sup_stable_groom_until` = ISO +20 мин

Отдельных `quest_*` флагов нет.

## WIRING

HUD не требуется.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateStableDialogue, applyStableChoice } from './stable-care-dialogue.js';
```

В `generate`, после schedule-gate / до LLM (рядом с `town_priest` / `town_bathkeeper`):

```ts
    if (input.npcId === 'town_stable' && !input.playerMessage) {
      const stableDialogue = generateStableDialogue(npc, input.save);
      if (stableDialogue) return stableDialogue;
    }
```

В `applyChoice`, сразу после schedule-gate (до generic `nextNode`):

```ts
    const stableCare = applyStableChoice(save, npc, choiceId);
    if (stableCare) return stableCare;
```

- Механика (`stable_groom`, `stable_feed`, `stable_buy_hay`) → сервис + follow-up.
- YAML flavor (`stable_mount`, `stable_charge`, `stable_puppy`, `stable_leave`, `*_bye`) → `null`, дальше generic nextNode.
- Клиентского shop intercept для сена нет: сено только через `stable_buy_hay`. Кони — `/api/mounts`.

## Риски до wiring
Пока `dialogue.ts` не подключён, generate Бориса падает в LLM, а `_stable_groom` / `_stable_feed` / `_stable_buy_hay` на applyChoice тихо закрывают диалог без списания адены (flag с `_`, без nextNode). Иконка `item_stable_hay.webp` может отсутствовать до generate:media.
