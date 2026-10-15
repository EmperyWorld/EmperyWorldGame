# Сводка: Горожанин площади — монета в фонтан и талисман

## Дата
2026-09-15

## Цель
Изолированный сервис `haven_citizen_plaza`: повторяемый бафф за монету в фонтан и разовый талисман форума.

## Файлы
- `content/items/haven-citizen-plaza.yaml` — `plaza_charm` (material)
- `content/npcs/haven_citizen_plaza.yaml` — `plaza_coin` / `plaza_charm`; YAML-слухи без RNG
- `apps/server/src/services/citizen-plaza.ts`
- `apps/server/src/services/citizen-plaza-dialogue.ts`
- `apps/server/src/services/citizen-plaza.test.ts`

## Экспорт
```ts
tossPlazaCoin(save: PlayerSave): CitizenPlazaResult
buyPlazaCharm(save: PlayerSave): CitizenPlazaResult

generateCitizenPlazaDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyCitizenPlazaChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null
```

`apply` — порядок аргументов плагина: `(npc, save, choiceId)`.

Флаг: `quest_plaza_charm_complete`. Предмет: `plaza_charm`. Бафф: `plaza_fountain` / `mDef` 4 / 10 мин / «Монета в фонтан». Цена монеты: 3 адены (повторно). Цена талисмана: 12 адены (один раз, затем скрыть).

Приветствие через `formatCitizenGreeting` из `citizen-rumors.js` (файл `.ts` не менять). Слухи/советы/уход не трогать в apply — `null`, дальше YAML. RNG нет.

## WIRING

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateCitizenPlazaDialogue, applyCitizenPlazaChoice } from './citizen-plaza-dialogue.js';
```

В `generate`, рядом с другими haven-citizen плагинами:

```ts
const plazaDialogue = generateCitizenPlazaDialogue(npc, input.save);
if (plazaDialogue) return plazaDialogue;
```

В `applyChoice`, сразу после schedule-gate (до generic `nextNode`):

```ts
const plaza = applyCitizenPlazaChoice(npc, save, choiceId);
if (plaza) return plaza;
```

- YAML flavor (`citizen_rumors`, `citizen_advice`, `citizen_leave`) → `null`, дальше generic nextNode.
- Механика (`plaza_coin`, `plaza_charm`) → сервис + follow-up с оставшимися выборами.
- Только `haven_citizen_plaza`; чужие NPC → `null`.

## Риски до wiring
Пока `dialogue.ts` не подключён, generate горожанина площади падает в общий citizen/LLM путь, а монета/талисман из диалога не применяются.
