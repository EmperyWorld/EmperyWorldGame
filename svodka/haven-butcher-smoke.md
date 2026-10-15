# Сводка: Мясник Бран — копчение мяса и заказ на сырое

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_butcher`: сырое мясо → копчёная грудинка; разовый заказ на 2 `raw_meat` (70 адены). Лавка `haven_butcher.yaml` не трогата — копчение только через диалог.

## Файлы
- `content/items/haven-butcher.yaml` — `smoked_brisket` (consumable, nutrition 36, warming 0.2, shelfLifeHours 96)
- `content/npcs/town_butcher.yaml` — `butcher_smoke` / `butcher_jerky_accept` / `butcher_jerky_claim`; `butcher_shop` / `butcher_tip` / `butcher_leave` сохранены
- `apps/server/src/services/butcher-smoke.ts`
- `apps/server/src/services/butcher-smoke-dialogue.ts`
- `apps/server/src/services/butcher-smoke.test.ts`

## Сигнатуры

```ts
butcherSmokeMeat(save: PlayerSave): ButcherSmokeResult
butcherOrderJerky(save: PlayerSave): ButcherSmokeResult
claimButcherJerky(save: PlayerSave): ButcherSmokeResult
countRawMeat(save: PlayerSave): number

generateButcherDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyButcherChoice(save: PlayerSave, npc: HavenNpcLike, choiceId: string): HavenNpcChoiceResult | null
```

Флаги: `quest_butcher_jerky_active`, `quest_butcher_jerky_complete`. Награда: 70 адены. Нужно 2× `raw_meat`.

Choice ids:
- `butcher_shop` — как было, клиент открывает `haven_butcher`
- `butcher_smoke` — копчение
- `butcher_jerky_accept` / `butcher_jerky_claim` — разовый заказ
- `butcher_tip`, `butcher_leave`, `*_bye` — YAML fallthrough

## WIRING

Плагин готов, **DialogueService / HUD ещё не подключены** (запрещено в этом срезе).

### HUD — `apps/client/src/quest-hud.ts`

Пока `quest_butcher_jerky_active`, считать `raw_meat` в инвентаре (не отдельный флаг):

`Квест: принеси сырое мясо Брану (есть X/2) · рынок [E]`

```ts
if (hasFlag(s, 'quest_butcher_jerky_active')) {
  const meat = (s.inventory ?? []).filter((id) => id === 'raw_meat').length;
  return `Квест: принеси сырое мясо Брану (есть ${meat}/2) · рынок [E]`;
}
```

Серверная сверка:

```ts
import { BUTCHER_JERKY_ACTIVE_FLAG, BUTCHER_JERKY_NEEDED, countRawMeat } from './butcher-smoke.js';

if (save.questFlags[BUTCHER_JERKY_ACTIVE_FLAG]) {
  const x = countRawMeat(save);
  // `Квест: принеси сырое мясо Брану (есть ${x}/${BUTCHER_JERKY_NEEDED}) · рынок [E]`
}
```

Тест HUD (`quest-hud.test.ts`): active + 1 `raw_meat` → строка с `(есть 1/2)`.

### `apps/server/src/services/dialogue.ts`

Импорт (рядом с miller/dock):

```ts
import { generateButcherDialogue, applyButcherChoice } from './butcher-smoke-dialogue.js';
```

В `generate`, после schedule-gate / до LLM (после `generateDockDialogue`):

```ts
const butcherDialogue = generateButcherDialogue(npc, input.save);
if (butcherDialogue) return butcherDialogue;
```

В `applyChoice`, сразу после schedule-gate (после dock, до generic `nextNode`):

```ts
const butcher = applyButcherChoice(save, npc, choiceId);
if (butcher) return butcher;
```

- `butcher_shop` → `{ save }` без follow-up (клиент открывает `haven_butcher`).
- YAML flavor (`butcher_tip`, `butcher_leave`, `*_bye`) → `null`, дальше generic nextNode.
- Механика (`butcher_smoke`, `butcher_jerky_accept`, `butcher_jerky_claim`) → сервис + follow-up с оставшимися выборами.

Клиент `dialogue-controller.ts` не нужен: `butcher_shop` уже открывает shop.

## Тесты
`pnpm --filter @empery/server test -- butcher-smoke`

- item YAML: nutrition / warming / shelfLife
- копчение без сырого — fail
- копчение: −1 raw_meat, +1 smoked_brisket
- accept ставит `quest_butcher_jerky_active`
- claim 2 сырых → +70 адены, complete, active снят
- claim без мяса / повтор после complete — fail
- generate null на чужом npc
- `butcher_shop` возвращает `{ save }` без followUp
- flavor fallthrough; accept скрыт после complete

## Риски
- **dialogue.ts не подключён** — основной: generate Брана падает в LLM, копчение/заказ из диалога не применяются. `butcher_shop` на клиенте уже перехватывается.
- **HUD не подключён** — полоска квеста не покажет «принеси сырое мясо Брану», пока parent не вставит ветку в `quest-hud.ts`.
- Иконка `item_smoked_brisket.webp` не генерировалась (`packages/media` не трогали). В инвентаре может быть пустой слот, пока не прогонят `generate:media -- --only=item_smoked_brisket`.
- Копчёное не добавлено в лавку: купить можно только через `butcher_smoke` (сырое → грудинка).
