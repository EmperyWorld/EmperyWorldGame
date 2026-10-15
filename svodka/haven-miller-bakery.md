# Сводка: Мельник Фаддей — помол зерна и выпечка

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_miller`: рожь → мука → хлеб дешевле лавки, разовый заказ на 3 муки.

## Файлы
- `content/items/haven-miller.yaml` — `mill_grain`, `mill_flour`
- `content/shops/haven_bakery.yaml` — оффер `mill_grain` (4 адены)
- `content/npcs/town_miller.yaml` — `miller_mill` / `miller_bake` / заказ; `miller_shop` без смены id
- `apps/server/src/services/miller-bakery.ts`
- `apps/server/src/services/miller-bakery-dialogue.ts`
- `apps/server/src/services/miller-bakery.test.ts`

## Экспорт
```ts
millerMillGrain(save: PlayerSave): MillerBakeryResult
millerBakeBread(save: PlayerSave): MillerBakeryResult
acceptMillerOrder(save: PlayerSave): MillerBakeryResult
claimMillerOrder(save: PlayerSave): MillerBakeryResult
countMillFlour(save: PlayerSave): number

generateMillerDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyMillerChoice(save: PlayerSave, npc: HavenNpcLike, choiceId: string): HavenNpcChoiceResult | null
```

Флаги: `quest_miller_order_active`, `quest_miller_order_complete`. Награда: 90 адены. Бафф после выпечки: `miller_fresh` / `mpRegen` 6 / 15 мин / «Свежий каравай».

## WIRING

### HUD
Пока `quest_miller_order_active`, считать `mill_flour` в инвентаре (не отдельный флаг `quest_miller_order_flour`):

`Квест: мука для Фаддея (есть X/3) · мельница [E]`

```ts
import { MILLER_ORDER_ACTIVE_FLAG, MILLER_ORDER_FLOUR_NEEDED, countMillFlour } from './miller-bakery.js';

if (save.questFlags[MILLER_ORDER_ACTIVE_FLAG]) {
  const x = countMillFlour(save);
  // `Квест: мука для Фаддея (есть ${x}/${MILLER_ORDER_FLOUR_NEEDED}) · мельница [E]`
}
```

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateMillerDialogue, applyMillerChoice } from './miller-bakery-dialogue.js';
```

В `generate`, после schedule-gate / до LLM (рядом с `town_gardener`):

```ts
const millerDialogue = generateMillerDialogue(npc, input.save);
if (millerDialogue) return millerDialogue;
```

В `applyChoice`, сразу после schedule-gate (до generic `nextNode`):

```ts
const miller = applyMillerChoice(save, npc, choiceId);
if (miller) return miller;
```

- `miller_shop` → `{ save }` без follow-up (клиент открывает `haven_bakery`).
- YAML flavor (`miller_grain`, `miller_storm`, `miller_leave`, `*_bye`) → `null`, дальше generic nextNode.
- Механика (`miller_mill`, `miller_bake`, `miller_order_accept`, `miller_order_claim`) → сервис + follow-up с оставшимися выборами.

## Риски до wiring
Пока `dialogue.ts` не подключён, generate Фаддея падает в LLM, а помол/заказ из диалога не применяются. `miller_shop` на клиенте уже перехватывается.
