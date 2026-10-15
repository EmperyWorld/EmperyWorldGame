# Сводка: Отец Кассий — храмовая свеча и милостыня

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_priest`: продажа свечи Кассия (+`mpRegen` «Храмовая свеча») и повторяемая милостыня (`haven_priest_alms`). Благословение и исповедь остаются в `haven-services.ts`. HUD нет.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-priest.yaml` | `cassius_candle` (material, common, 0.05 кг) |
| `content/npcs/town_priest.yaml` | `priest_candle` / `priest_alms` + старые bless/confess/lore |
| `apps/server/src/services/priest-votive.ts` | Механика свечи и милостыни |
| `apps/server/src/services/priest-votive-dialogue.ts` | `generatePriestVotiveDialogue` / `applyPriestVotiveChoice` |
| `apps/server/src/services/priest-votive.test.ts` | Сервис + generate/apply |

Не трогались: `dialogue.ts`, `haven-services.ts` (кроме чтения контракта bless/confess), `quest-hud*`, `dialogue-controller`, `ally-buffs`, packages, catalog, media.

## Сигнатуры

```ts
buyCassiusCandle(save: PlayerSave): PriestVotiveResult
givePriestAlms(save: PlayerSave): PriestVotiveResult
priestAlmsCount(save: PlayerSave): number

generatePriestVotiveDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyPriestVotiveChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const priestVotivePlugin: HavenNpcFeaturePlugin
```

Контракт `HavenNpcFeaturePlugin`: `generate(npc, save)` / `apply(npc, save, choiceId)` — тот же порядок аргументов.

Константы: `PRIEST_CANDLE_COST=8`, `PRIEST_ALMS_COST=20`, предмет `cassius_candle`, флаг `haven_priest_alms`.

Бафф (через `applyNamedBuff` + `applyStatsToSave`):
- `cassius_votive` / `mpRegen` / 4 / 20 мин / «Храмовая свеча»

## Правила механики

- Свеча: 8 адены, `appendItemsToSave` → `cassius_candle`, бафф `cassius_votive`. Повтор разрешён.
- Милостыня: 20 адены, `haven_priest_alms += 1`, без предмета. Повтор разрешён.
- `generate` прячет `priest_confess`, пока `(save.karma ?? 0) > 0` (L2 PK). Не использовать `karma < 0`.
- `apply` возвращает `null` для `priest_bless`, `priest_confess`, `priest_lore`, `priest_leave`, `priest_lore_bye` — родитель (`haven-services` / YAML `nextNode`) не ломается.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Без двух вставок Кассий останется YAML/LLM + существующие bless/confess.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generatePriestVotiveDialogue, applyPriestVotiveChoice } from './priest-votive-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, **вместо или до** текущего блока `town_priest` (фильтр confess уже есть в плагине):

```ts
const priestDialogue = generatePriestVotiveDialogue(npc, input.save);
if (priestDialogue) return priestDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, **до** существующего `priest_bless` / `priest_confess` в haven-services:

```ts
const priestVotive = applyPriestVotiveChoice(npc, save, choiceId);
if (priestVotive) return priestVotive;
```

Порядок важен: `priest_bless` / `priest_confess` / lore вернут `null` и дойдут до текущего кода.

HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- priest-votive
```

Покрыто: отказ свечи без адены, предмет + флаги `cassius_votive`, счётчик милостыни без предмета, confess скрыт при karma 0 и виден при karma 5, apply `null` для `priest_bless`.

## Риски

- Без WIRING в `dialogue.ts` новые кнопки видны из YAML, но candle/alms на applyChoice тихо закроют диалог (`_priest_*` без nextNode) без списания адены.
- `priest_bless` / `priest_confess` по-прежнему только в `haven-services`; плагин их не вызывает.
- Иконка `item_cassius_candle.webp` может отсутствовать: media/catalog не трогали специально.
