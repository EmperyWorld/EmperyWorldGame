# Сводка: Ледник-холодильник — паёк жильца

## Дата
2026-09-15

## Цель
Изолированный сервис `apartment_fridge`: один `apt_ration` в UTC-сутки для владельца квартиры. Хранилище еды (`open_storage`) остаётся на клиенте.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/apartment_fridge.yaml` | Добавлен `apt_ration`; `open_storage` без смены id |
| `content/items/haven-apt-fridge.yaml` | `apt_ration` (consumable, nutrition 12) |
| `apps/server/src/services/apartment-fridge.ts` | `takeAptRation` |
| `apps/server/src/services/apartment-fridge-dialogue.ts` | `generateApartmentFridgeDialogue` / `applyApartmentFridgeChoice` |
| `apps/server/src/services/apartment-fridge.test.ts` | Сервис + диалог |

Не трогались: `dialogue.ts`, HUD, `dialogue-controller.ts`, `housing.ts` (только import `emptyHousingStorages`), `merchant-deal.ts`, `packages/*`, catalog, прочие apartment YAML.

## Сигнатуры

```ts
takeAptRation(save: PlayerSave, now?: Date): AptFridgeResult

generateApartmentFridgeDialogue(npc: HavenNpcLike, save: PlayerSave, now?: Date): DialogueResponse | null
applyApartmentFridgeChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string, now?: Date): HavenNpcChoiceResult | null

export const apartmentFridgePlugin: HavenNpcFeaturePlugin
```

Константы: `HAVEN_APT_RATION_DAY_FLAG='haven_apt_ration_day'` (число UTC day-of-year 1..366, как `utcDayOfYear` в merchant-deal.ts), предмет `apt_ration`, иконка `/media/assets/item_apt_ration.webp`. Отказ без жилья: `Сначала ключ от квартиры`. Повтор в тот же UTC-день: `Паёк на сегодня уже брали. Завтра после полуночи по UTC — новый.`

HUD не требуется.

## Правила механики

- Нет `save.housing` → fail, сейв без изменений.
- Первый забор в UTC-сутки → `appendItemsToSave` + флаг `haven_apt_ration_day = utcDayOfYear(now)`.
- Тот же UTC-день снова → fail, сейв без второго предмета.
- Следующий UTC-день (передать `Date`) → снова ok.
- Generate меню всегда `open_storage` + `apt_ration`.
- Apply **обязан** вернуть `null` для `open_storage` — клиентский intercept еды жильца остаётся рабочим.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Клиент сейчас **AUTO-OPENS** хранилище еды при proximity-talk с холодильником. Parent должен **убрать auto-open** и открывать storage только по `open_storage`.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import {
  applyApartmentFridgeChoice,
  generateApartmentFridgeDialogue,
} from './apartment-fridge-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, до LLM:

```ts
const fridgeDialogue = generateApartmentFridgeDialogue(npc, input.save);
if (fridgeDialogue) return fridgeDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, до YAML `nextNode` fallback:

```ts
const fridge = applyApartmentFridgeChoice(npc, save, choiceId);
if (fridge) return fridge;
```

Поведение apply:

- чужой npc → `null`
- `apt_ration` → `{ save, townMessage, followUp }`
- `open_storage` → `null` (клиент `openHousingStorage('food')`)

### `apps/client/src/dialogue-controller.ts`

Снять auto-open на talk (proximity):

```ts
if (channel === 'proximity' && npcId === 'apartment_fridge') {
  this.close();
  await this.host.openHousingStorage('food');
  ...
}
```

Оставить intercept выбора:

```ts
if (npcId === 'apartment_fridge' && choiceId === 'open_storage') {
  this.close();
  await this.host.openHousingStorage('food');
  ...
}
```

Quest HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- apartment-fridge
```

Покрыто: нет жилья, первый паёк, повтор в тот же UTC-день, следующий день (передаём `Date`), apply `null` для `open_storage`, `getItem('apt_ration')`.

Интеграция через `DialogueService` **не** гоняется, пока нет WIRING.

## Риски до wiring

Пока `dialogue.ts` не подключён и proximity auto-open жив, меню `open_storage` + `apt_ration` не увидят: разговор сразу открывает еду. После снятия auto-open generate без wiring уйдёт в LLM/YAML; `apt_ration` без apply не выдаст предмет. `open_storage` на клиенте уже перехватывается — apply плагина возвращает `null` для этого id.

## tsc

`followUpFromResult(..., now)` — `now` не читался (TS6133). Параметр снят; дата остаётся в `takeAptRation(save, now)`.
