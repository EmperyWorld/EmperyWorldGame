# Сводка: Стеллаж снаряжения — натереть доспех

## Дата
2026-09-15

## Цель
Изолированный сервис `apartment_rack`: платная полировка доспеха для владельца квартиры (10 адены, бафф `pDef`). Открытие стойки (`open_storage`) остаётся на клиенте. `housing.ts` не трогали.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/apartment_rack.yaml` | Добавлен `apt_polish`; `open_storage` без смены id |
| `apps/server/src/services/apartment-rack.ts` | `aptPolish` |
| `apps/server/src/services/apartment-rack-dialogue.ts` | `generateApartmentRackDialogue` / `applyApartmentRackChoice` |
| `apps/server/src/services/apartment-rack.test.ts` | Сервис + фильтры диалога |

Не трогались: `dialogue.ts`, `housing.ts`, `quest-hud*`, `dialogue-controller`, `haven-services`, `ally-buffs`, `packages`, catalog, прочие apartment YAML.

## Сигнатуры

```ts
aptPolish(save: PlayerSave, now?: number): ApartmentRackResult

generateApartmentRackDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyApartmentRackChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const apartmentRackPlugin: HavenNpcFeaturePlugin
```

Константы: `APT_POLISH_COST=10`, бафф `apt_polish` / `pDef` / 8 / 20 мин / «Натёртый доспех». Отказ без жилья: `Сначала ключ от квартиры`. Предмет не нужен. Повтор разрешён (таймер баффа перезаписывается).

HUD не требуется.

## Правила механики

- Нет `save.housing` → fail, сейв без изменений.
- Мало адены → fail с суммой.
- Успех: −10 адены, `applyNamedBuff` + `applyStatsToSave`. Инвентарь не трогаем.
- Generate всегда показывает `open_storage` + `apt_polish` (и без ключа — отказ на apply).

Apply **обязан** вернуть `null` для `open_storage` — клиентский intercept стойки снаряжения (`gear`) остаётся рабочим.

## WIRING (интегратор)

`dialogue.ts` и клиент **не** подключены в этом диффе. Сейчас `dialogue-controller` автооткрывает gear-storage при proximity к `apartment_rack`. Parent должен снять auto-open, чтобы игрок увидел меню «Открыть» / «Натереть доспех».

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import {
  generateApartmentRackDialogue,
  applyApartmentRackChoice,
} from './apartment-rack-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, до LLM:

```ts
const rackDialogue = generateApartmentRackDialogue(npc, input.save);
if (rackDialogue) return rackDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, до YAML `nextNode` fallback:

```ts
const rack = applyApartmentRackChoice(npc, save, choiceId);
if (rack) return rack;
```

Поведение apply:

- чужой npc → `null`
- `apt_polish` → `{ save, townMessage, followUp }`
- `open_storage` → `null` (клиент `openHousingStorage('gear')`)

### Клиент

Снять auto-open `apartment_rack` в `dialogue-controller` (proximity). Choice `open_storage` по-прежнему открывает `gear`. `housing.ts` не менять.

Quest HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- apartment-rack
```

Покрыто: нет жилья, бедность, успех (бафф-флаги, без предмета), повтор, generate null на чужом NPC, меню `open_storage` + `apt_polish`, apply null для `open_storage`, apply polish + follow-up, YAML ids.

Интеграция через `DialogueService` **не** гоняется, пока нет WIRING.

## Риски до wiring

Пока `dialogue.ts` не подключён и клиент автооткрывает стойку, кнопка `apt_polish` из YAML не видна в игре. После снятия auto-open YAML-кнопка появится, но `_apt_polish` на applyChoice без плагина тихо закроет диалог без списания адены и баффа. Apply плагина обязан оставлять `open_storage` как `null` — иначе клиентский bag сломается.
