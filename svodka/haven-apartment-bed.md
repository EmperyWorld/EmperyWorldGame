# Сводка: Кровать в квартире — чистые простыни

## Дата
2026-09-15

## Цель
Изолированный сервис `apartment_bed`: бесплатный повторный отдых с баффом «Чистые простыни». Обычный `rest_here` остаётся на клиентском `restAtHousing` → `restAtApartment`. Нового предмета нет.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/apartment_bed.yaml` | Добавлен `apt_linen` («Перестелить и отдохнуть»); `rest_here` без смены id |
| `apps/server/src/services/apartment-bed.ts` | `apartmentLinenRest` |
| `apps/server/src/services/apartment-bed-dialogue.ts` | `generateApartmentBedDialogue` / `applyApartmentBedChoice` |
| `apps/server/src/services/apartment-bed.test.ts` | Нет жилья / rest+buff / apply null для `rest_here` / generate оба выбора |

Не трогались: `dialogue.ts`, `housing.ts` (только import `restAtApartment`), HUD, `dialogue-controller`, `steward-rest.ts`, `packages/*`, каталог, прочие `apartment_*.yaml`.

## Сигнатуры

```ts
apartmentLinenRest(save: PlayerSave, now?: number): ApartmentBedResult

generateApartmentBedDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyApartmentBedChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const apartmentBedPlugin: HavenNpcFeaturePlugin
```

Константы: бафф `apt_linen` / `mpRegen` / 5 / 30 мин / «Чистые простыни». Отказ без жилья: `Сначала нужна квартира у Эдмунда.` Бесплатно, повторяемо.

HUD не требуется.

## Правила механики

- Нет `save.housing` → fail, сейв без изменений.
- Иначе `restAtApartment(save)` (нужны жильё и локация `haven_apartment`).
- Успех: HP/MP как у домашнего сна, `applyNamedBuff` + `applyStatsToSave`. Адена не списывается.
- Generate **всегда** меню с `rest_here` + `apt_linen` (родитель отключит auto-open по proximity).
- Apply **обязан** вернуть `null` для `rest_here` — текущий rest API клиента остаётся рабочим.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Клиентский auto-rest по `apartment_bed` **не** снимался.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateApartmentBedDialogue, applyApartmentBedChoice } from './apartment-bed-dialogue.js';
```

`DialogueService.generate` — после schedule-gate / до LLM:

```ts
const apartmentBedDialogue = generateApartmentBedDialogue(npc, input.save);
if (apartmentBedDialogue) return apartmentBedDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, до YAML `nextNode` fallback:

```ts
const apartmentBed = applyApartmentBedChoice(npc, save, choiceId);
if (apartmentBed) return apartmentBed;
```

Поведение apply:

- чужой npc → `null`
- `apt_linen` → `{ save, townMessage, followUp }`
- `rest_here` → `null` (клиент `restAtHousing` / YAML `_apt_rest`)

### Клиент

Сейчас `dialogue-controller` на proximity `apartment_bed` сразу зовёт `restAtHousing` и не открывает меню. После wiring generate родитель должен **убрать auto-open**, чтобы игрок видел `Отдохнуть` и `Перестелить и отдохнуть`.

Quest HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- apartment-bed
```

Покрыто: нет жилья, успех (HP/MP/бафф, адена 0, повтор), generate null на чужом NPC, generate оба выбора, apply null для `rest_here`, apply linen + follow-up, YAML ids.

Интеграция через `DialogueService` **не** гоняется, пока нет WIRING.

## Риски до wiring

Пока `dialogue.ts` не подключён и клиент auto-restит, меню кровати не видно: `apt_linen` из YAML не вызывается. После generate + снятия auto-open — ок. `rest_here` не ломается, потому что apply плагина возвращает `null` для этого id.
