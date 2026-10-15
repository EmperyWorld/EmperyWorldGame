# Сводка: Связист Рен — городской эфир

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_radio`: платная настройка эфира Гавани (бафф «Ритм эфира», +attackSpeed) и бесплатная проверка сигнала полевой рации. Flavor YAML (`radio_howto` / `radio_static` / `radio_shop_done`) сохранён. HUD не нужен.

Клиент сейчас **автооткрывает** радиолавку при разговоре (`dialogue-controller`). Этот дифф контроллер **не** трогает: parent должен добавить choice `radio_shop` и снять auto-open.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/town_radio.yaml` | `radio_shop` / `radio_broadcast` / `radio_signal` + старые flavor-ноды |
| `apps/server/src/services/radio-broadcast.ts` | эфир + проверка сигнала |
| `apps/server/src/services/radio-broadcast-dialogue.ts` | `generateRadioBroadcastDialogue` / `applyRadioBroadcastChoice` |
| `apps/server/src/services/radio-broadcast.test.ts` | сервис + фильтры диалога |

Не трогались: `radio.ts` (только import), `dialogue.ts`, `dialogue-controller.ts`, `quest-hud*`, `haven-services.ts`, `ally-buffs.ts`, `content/shops/haven_radio.yaml`.

## Сигнатуры

```ts
tuneHavenBroadcast(save: PlayerSave): RadioBroadcastResult
radioSignalCheck(save: PlayerSave): RadioBroadcastResult
havenBroadcastNews(now?: Date): string
roughRadioChargeLabel(sessionExpiresAt: string, now?: number): string

generateRadioBroadcastDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyRadioBroadcastChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const radioBroadcastPlugin: HavenNpcFeaturePlugin
```

Константы: `HAVEN_BROADCAST_COST=6`, `buffId haven_broadcast`, `buffStat attackSpeed`, amount 8, 15 мин, имя «Ритм эфира».

Choice ids:
- `radio_shop` — «Купить батареи»; apply → `{ save }` (без followUp)
- `radio_broadcast` — эфир + бафф
- `radio_signal` — проверка сигнала
- `radio_howto`, `radio_static`, `radio_shop_done`, `*_bye` → `null` (YAML `nextNode`)

## Правила механики

- Эфир: 6 адены, `applyNamedBuff` + `applyStatsToSave`. Повтор перезаписывает таймер. Новость — одна из трёх статических строк (`Date.getUTCHours() % 3`). Рация в инвентаре **не** требуется (эфир с мачты Рена).
- Сигнал: бесплатно, сейв не меняется. `save.radio?.broken` → ремонт `RADIO_REPAIR_COST` (100000). Иначе при `sessionExpiresAt` — powerOn + грубый остаток заряда. Иначе «Рация в порядке» / «Рации нет — купи у меня».
- Greeting упоминает батарею/заряд через `emptyRadioState` / `normalizeRadioState` (без lifecycle `radio.ts`).

## WIRING (интегратор)

Плагин готов, **DialogueService и клиент ещё не подключены**. Без двух серверных вставок Рен останется flavor/LLM; без правки клиента лавка по-прежнему откроется сразу при talk.

### 1. `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import {
  generateRadioBroadcastDialogue,
  applyRadioBroadcastChoice,
} from './radio-broadcast-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, рядом с другими Haven NPC, **до** LLM:

```ts
const radioDialogue = generateRadioBroadcastDialogue(npc, input.save);
if (radioDialogue) return radioDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate / `walk_bye`, **до** YAML `nextNode` fallback:

```ts
const radioApplied = applyRadioBroadcastChoice(npc, save, choiceId);
if (radioApplied) return radioApplied;
```

Поведение apply:
- чужой npc → `null`
- `radio_broadcast` / `radio_signal` → `{ save, townMessage, followUp }`
- `radio_shop` → `{ save }` (без followUp — клиент закрывает диалог и зовёт `openRadioShop`)
- `radio_howto` / `radio_static` / `radio_shop_done` / `*_bye` → `null` (YAML `nextNode`)

### 2. `apps/client/src/dialogue-controller.ts` — обязательно

Сейчас proximity-talk с `town_radio` **сразу** зовёт `openRadioShop()` и не показывает диалог. Parent должен:

1. Убрать auto-open блок `if (npcId === 'town_radio') { close; openRadioShop; return; }`.
2. Добавить choice intercept по образцу `miller_shop` / `brew_shop`:

```ts
if (npcId === 'town_radio' && choiceId === 'radio_shop') {
  this.close();
  await this.host.openRadioShop();
  this.host.syncUiBlocked();
  return;
}
```

Без (1) generate Рена игрок никогда не увидит. Без (2) кнопка «Купить батареи» не откроет лавку.

HUD не требуется.

## Тесты

```bash
pnpm --filter @empery/server test -- radio-broadcast
```

Покрыто: бедность эфира; успех (adena, buff flags, новость из ротации); UTC hour % 3; broken → 100000; sessionExpiresAt + powerOn/off; нет рации / рация без сессии; `radio_shop` → `{ save }` без followUp; generate null на чужом NPC; flavor fallthrough; greeting про батареи.

Интеграция через `DialogueService` **не** гоняется, пока нет WIRING в `dialogue.ts`.

## Риски

- **dialogue.ts не подключён** — YAML-кнопки видны, но `_radio_broadcast` / `_radio_signal` без nextNode тихо закроют диалог без баффа.
- **dialogue-controller auto-open** — пока parent не снимет перехват talk, меню эфира недоступно даже после wiring generate.
- `radio.ts` lifecycle (`expireRadioSession`) не вызывается: просроченный `sessionExpiresAt` в проверке сигнала даст «заряд сел», а не автоочистку сессии.
- Бафф эфира делит `attackSpeed` с бардом; повтор `haven_broadcast` перезаписывает свой таймер, чужие named-buff ids не трогает.
- Ремонт корпуса по-прежнему только через существующий radio shop / `repairFieldRadio`, не через этот плагин.
