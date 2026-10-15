# Сводка: Пивовар Хольм — дегустация и фирменный эль

## Дата
2026-09-15

## Цель
Изолированный сервис пивоварни: дегустация (`critRate`) + тост (`mDef` + `holm_stout`). Без HUD квестов. Клиентский шоп по `brew_shop` не трогаем.

## Файлы
- `content/items/haven-brewery.yaml` — `holm_stout` («Стаут Хольма»), consumable, uncommon
- `content/shops/haven_brew.yaml` — оффер `holm_stout` (22), `haven_ale` сохранён
- `content/npcs/town_brewer.yaml` — `brew_tasting`, `brew_toast`; flavor `brew_taste` / `brew_craft` и `brew_shop` на месте
- `apps/server/src/services/brewery-tasting.ts`
- `apps/server/src/services/brewery-tasting-dialogue.ts`
- `apps/server/src/services/brewery-tasting.test.ts`

## Сигнатуры

```ts
tasteHolmAle(save: PlayerSave): BreweryTastingResult
buyHolmToast(save: PlayerSave): BreweryTastingResult
brewTastingCount(save: PlayerSave): number
isHolmToastFree(save: PlayerSave): boolean
holmToastCost(save: PlayerSave): number

generateBrewerDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyBrewerChoice(save: PlayerSave, npc: HavenNpcLike, choiceId: string): HavenNpcChoiceResult | null
```

Константы: `HOLM_TASTE_COST=8`, `HOLM_TOAST_COST=20`, `HOLM_TASTE_THRESHOLD=3`, `HOLM_STOUT_ITEM_ID`, `HAVEN_BREW_TASTINGS_FLAG`, `HAVEN_BREW_TOAST_CLAIMED_FLAG`.

Баффы (через `applyNamedBuff`, ally-buffs не меняли):
- `holm_taste` / `critRate` / 8 / 20 мин / «Хмельной задор»
- `holm_toast` / `mDef` / 10 / 15 мин / «Тост за Гавань»

Choice ids:
- `brew_shop` — как было, клиент открывает `haven_brew`
- `brew_tasting` — механика дегустации (не путать с YAML flavor `brew_taste`)
- `brew_toast` — тост
- `brew_taste`, `brew_craft`, `brew_leave`, `*_bye` — YAML fallthrough

## WIRING (`dialogue.ts`) — не сделано в этом диффе

Импорт:

```ts
import { applyBrewerChoice, generateBrewerDialogue } from './brewery-tasting-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, рядом с другими Haven NPC, **до** LLM fallback:

```ts
const brewerScene = generateBrewerDialogue(npc, input.save);
if (brewerScene) return brewerScene;
```

`DialogueService.applyChoice` — после schedule-gate, до YAML `nextNode` fallback:

```ts
const brewer = applyBrewerChoice(save, npc, choiceId);
if (brewer) return brewer;
```

Поведение apply:
- чужой npc → `null`
- `brew_tasting` / `brew_toast` → `{ save, townMessage, followUp }`
- `brew_shop` → `{ save }` (без followUp — клиент закрывает диалог и зовёт `openBrewShop`)
- `brew_taste` / `brew_craft` / `brew_leave` / `*_bye` → `null` (YAML `nextNode`)

Без wiring: YAML-кнопки появятся (choices в npc yaml), но дегустация/тост будут no-op (`_brew_*` без nextNode). Магазин `brew_shop` уже работает на клиенте.

## Тесты
`pnpm --filter @empery/server test -- brewery-tasting`

- бедная дегустация
- успех: buff flags + счётчик
- инкремент `haven_brew_tastings`
- тост за 20 до порога; бесплатный после 3; повтор платный
- `brew_shop` возвращает `{ save }` без followUp
- generate null на чужом npc; flavor fallthrough

## Риски
- **dialogue.ts не подключён** — основной: механика жива только через прямые вызовы / тесты, пока parent не вставит wiring.
- Иконка `item_holm_stout.webp` не генерировалась (`packages/media` не трогали). В лавке может быть пустой слот, пока не прогонят `generate:media -- --only=item_holm_stout`.
- Survival/hydration на дегустации не применяли (consume path слишком связан с инвентарём).
- Не пересекается с Мартой (кости), Никой (`pAtk`), Кассием (`pDef`), бардом (`speed`/`attackSpeed`/`mpRegen`).
