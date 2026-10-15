# Сводка: Паломник Собора — молитвенная лента и милостыня

## Дата
2026-09-15

## Цель
Изолированный сервис `haven_citizen_cathedral`: продажа `prayer_ribbon` и повторяемый бафф милостыни. Отец Кассий / `cassius_candle` / `priest_*` не трогались.

## Файлы
- `content/items/haven-citizen-cathedral.yaml` — `prayer_ribbon` (material)
- `content/npcs/haven_citizen_cathedral.yaml` — `cathedral_ribbon` / `cathedral_pilgrim_alms`; YAML-слухи без RNG
- `apps/server/src/services/citizen-cathedral.ts`
- `apps/server/src/services/citizen-cathedral-dialogue.ts`
- `apps/server/src/services/citizen-cathedral.test.ts`

Не трогались: `dialogue.ts`, HUD, controller, `citizen-rumors.ts` (только импорт `.js`), `town_priest.yaml`, `haven-services.ts`, другие citizen YAML, packages/catalog (хук generate-item-icon мог дописать `item_prayer_ribbon`).

## Экспорт
```ts
buyPrayerRibbon(save: PlayerSave): CitizenCathedralResult
givePilgrimAlms(save: PlayerSave): CitizenCathedralResult
countPrayerRibbons(save: PlayerSave): number

generateCitizenCathedralDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyCitizenCathedralChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const citizenCathedralPlugin: HavenNpcFeaturePlugin
```

`apply` — порядок аргументов плагина: `(npc, save, choiceId)`.

Предмет: `prayer_ribbon`. Цена ленты: 7 адены (повторно). Милостыня: 10 адены (повторно). Бафф: `pilgrim_alms` / `mDef` 5 / 15 мин / «Лента паломника».

Приветствие через `formatCitizenGreeting` из `citizen-rumors.js` (файл `.ts` не менять). Слухи/советы/уход не трогать в apply — `null`, дальше YAML/generic citizen. `generate` только для `haven_citizen_cathedral`.

## WIRING

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateCitizenCathedralDialogue, applyCitizenCathedralChoice } from './citizen-cathedral-dialogue.js';
```

В `generate`, **до** общего `haven_citizen_` (иначе generic greeting перехватит паломника):

```ts
const cathedralCitizen = generateCitizenCathedralDialogue(npc, input.save);
if (cathedralCitizen) return cathedralCitizen;
```

В `applyChoice`, сразу после schedule-gate, **до** generic `haven_citizen_` / `nextNode`:

```ts
const cathedralCitizen = applyCitizenCathedralChoice(npc, save, choiceId);
if (cathedralCitizen) return cathedralCitizen;
```

- YAML flavor (`citizen_rumors`, `citizen_advice`, `citizen_leave`) → `null`, дальше generic citizen.
- Механика (`cathedral_ribbon`, `cathedral_pilgrim_alms`) → сервис + follow-up с оставшимися выборами.
- Только `haven_citizen_cathedral`; чужие NPC → `null`.

HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- citizen-cathedral
```

Покрыто: загрузка `prayer_ribbon`, лента 7 адены / повтор, милостыня 10 адены / флаги `pilgrim_alms`, бедность, generate только этот NPC, extras при дырявом YAML, `formatCitizenGreeting`, apply null для rumors/advice/leave.

## Риски до wiring
Пока `dialogue.ts` не подключён, generate паломника падает в общий citizen/LLM путь, а лента/милостыня из диалога не применяются (`_cathedral_*` без nextNode закроют реплику без списания адены).
