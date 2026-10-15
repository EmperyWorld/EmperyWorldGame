# Сводка: Торговец Лорен — сделка дня

## Дата
2026-09-15

## Цель
Изолированный диалоговый лот у `town_merchant`: один ротирующийся предмет со скидкой (`appendItemsToSave` + адены). Лавка `haven_merchant.yaml` и `town-services.ts` не тронуты. HUD нет.

## Файлы
- `content/npcs/town_merchant.yaml` — `merchant_shop` / `merchant_deal`; `browse_done` сохранён
- `apps/server/src/services/merchant-deal.ts`
- `apps/server/src/services/merchant-deal-dialogue.ts`
- `apps/server/src/services/merchant-deal.test.ts`

Не трогались: `haven_merchant.yaml`, `town-services.ts`, `dialogue.ts`, `dialogue-controller.ts`, HUD, media, shared.

## Сигнатуры

```ts
currentMerchantDeal(now?: Date): { itemId: string; price: number; label: string }
buyDailyDeal(save: PlayerSave, now?: Date): MerchantDealResult
generateMerchantDialogue(npc: HavenNpcLike, save: PlayerSave, now?: Date): DialogueResponse | null
applyMerchantChoice(save: PlayerSave, npc: HavenNpcLike, choiceId: string, now?: Date): HavenNpcChoiceResult | null
```

Константы: `HAVEN_MERCHANT_DEAL_DAY_FLAG='haven_merchant_deal_day'`, слоты:

| itemId | label | цена сделки | лавка (не меняли) |
|---|---|---|---|
| `bread_loaf` | Свежий хлеб | 8 | bakery 14 |
| `travel_biscuit` | Дорожный сухарь | 6 | bakery 10 |
| `haven_ale` | Эль Гавани | 10 | brew 16 |

Ротация: UTC day-of-year `% 3` (1 янв → хлеб). Час не меняет лот в пределах суток — флаг once-per-day = `YYYY-MM-DD` UTC. Альтернатива `now.getUTCHours() % 3` в комментарии сервиса, не используется.

Choice ids:
- `merchant_shop` — `{ save }` без followUp (клиент должен открыть `haven_merchant`)
- `merchant_deal` — покупка + followUp с оставшимися выборами
- `browse_done` / `merchant_leave` — `{ save }` (не `null`)
- чужой npc / неизвестный id → `null`

Повтор в тот же UTC-день: fail «На сегодня сделка закрыта». Бедный: fail, save без изменений.

## WIRING — не сделано в этом диффе

Клиент сейчас **AUTO-OPENS** лавку при разговоре с Лореном (`dialogue-controller.ts`). Parent должен **убрать auto-open** и открывать шоп только по `merchant_shop`, по образцу `miller_shop`.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { applyMerchantChoice, generateMerchantDialogue } from './merchant-deal-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, до LLM:

```ts
const merchantScene = generateMerchantDialogue(npc, input.save);
if (merchantScene) return merchantScene;
```

`DialogueService.applyChoice` — после schedule-gate, **до** generic `buyFromMerchant` / старого `browse_done`:

```ts
const merchant = applyMerchantChoice(save, npc, choiceId);
if (merchant) return merchant;
```

Старый `if (npcId === 'town_merchant' && choiceId === 'browse_done') return { save }` можно оставить: плагин уже возвращает `{ save }` и не дойдёт до него.

### `apps/client/src/dialogue-controller.ts`

Снять auto-open на talk:

```ts
if (npcId === 'town_merchant') {
  this.close();
  await this.host.openMerchantShop();
  ...
}
```

Добавить intercept выбора (рядом с `miller_shop`):

```ts
if (npcId === 'town_merchant' && choiceId === 'merchant_shop') {
  this.close();
  await this.host.openMerchantShop();
  this.host.syncUiBlocked();
  return;
}
```

Без этой правки generate Лорена никогда не покажется: клиент сразу зовёт `openMerchantShop`.

## Тесты
`pnpm --filter @empery/server test -- merchant-deal`

- ротация 3 лотов по UTC day-of-year
- бедная покупка
- успех: −адены, +1 предмет, флаг даты
- второй buy в тот же день → «На сегодня сделка закрыта»
- следующий UTC-день снова ок
- generate null на чужом npc; greeting содержит сделку
- `merchant_shop` / `browse_done` → `{ save }` без followUp
- `merchant_deal` через apply + оставшиеся choices

## Риски
- **dialogue.ts не подключён** — YAML-кнопки появятся только если generate пойдёт через плагин; иначе LLM/дефолтный YAML. `merchant_deal` без apply — no-op (`_merchant_deal` без nextNode).
- **Клиент auto-open** — даже после wiring сервера диалог сделки не виден, пока parent не снимет auto-open и не повесит `merchant_shop`.
- Сделка не в офферах `haven_merchant` (оружие). Это намеренно: лот только из диалога.
- Флаг UTC: у игрока вечером по локали может смениться день раньше/позже местного календаря.
- Нет HUD.
