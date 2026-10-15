# Сводка: Завсегдатай таверны — застолье во дворе

## Дата
2026-09-15

## Цель
Изолированный сервис `haven_citizen_tavern`: платный круг (бафф «Застолье», +attackSpeed). Слухи/советы остаются YAML + `citizen-rumors`. Предмета нет. Повторно.

Не трогались: `citizen-rumors.ts` (только import `formatCitizenGreeting`), `dialogue.ts`, HUD, controller, inn YAML, `brewery-tasting.ts`, пакеты, каталог, другие citizen YAML.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/haven_citizen_tavern.yaml` | choice `tavern_round` — «Поставить круг (9 адены)» |
| `apps/server/src/services/citizen-tavern.ts` | списание адены + named buff |
| `apps/server/src/services/citizen-tavern-dialogue.ts` | `generateCitizenTavernDialogue` / `applyCitizenTavernChoice` |
| `apps/server/src/services/citizen-tavern.test.ts` | стоимость, флаги баффа, fallthrough слухов |

## Сигнатуры

```ts
tavernRound(save: PlayerSave): CitizenTavernResult

generateCitizenTavernDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyCitizenTavernChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const citizenTavernPlugin: HavenNpcFeaturePlugin
```

Константы: `TAVERN_ROUND_COST=9`, `buffId tavern_cheer`, `buffStat attackSpeed`, amount 6, 12 мин, имя «Застолье».

Choice ids:
- `tavern_round` — механика (non-null apply)
- `citizen_rumors`, `citizen_advice`, `citizen_leave`, `*_bye` → `null` (generic citizen / YAML)

Generate: `null` если не `haven_citizen_tavern`. Greeting через `formatCitizenGreeting`. Меню: круг, слухи, совет, уйти.

## WIRING (`dialogue.ts`) — не сделано в этом диффе

Импорт:

```ts
import {
  generateCitizenTavernDialogue,
  applyCitizenTavernChoice,
} from './citizen-tavern-dialogue.js';
```

`DialogueService.generate` — **до** generic `haven_citizen_`:

```ts
const tavernCitizen = generateCitizenTavernDialogue(npc, input.save);
if (tavernCitizen) return tavernCitizen;
```

`DialogueService.applyChoice` — после schedule-gate, **до** generic `nextNode` (рядом с `haven_citizen_`):

```ts
const tavernCitizen = applyCitizenTavernChoice(npc, save, choiceId);
if (tavernCitizen) return tavernCitizen;
```

Поведение apply:
- чужой npc → `null`
- `tavern_round` → `{ save, townMessage, followUp }`
- `citizen_rumors` / `citizen_advice` / `citizen_leave` → `null` (generic `getCitizenRumors` / `getCitizenAdvice`)

HUD не требуется. Клиент не трогаем.

## Тесты

```bash
pnpm --filter @empery/server test -- citizen-tavern
```

- бедность: adena/buff без изменений
- успех: −9 адены, `buff_sup_tavern_cheer_*` (`attackSpeed` / 6 / «Застолье»), инвентарь пуст
- повтор перезаписывает таймер
- generate null на чужом npc; меню содержит `tavern_round`
- apply null на `citizen_rumors` / `citizen_advice` / `citizen_leave`

## Риски до wiring

- YAML-кнопка круга видна в generic citizen generate (choices из YAML), но `_cit_round` без nextNode тихо закроет диалог без списания адены, пока `applyCitizenTavernChoice` не подключён.
- Generic `haven_citizen_` generate тоже показывает YAML-choices, поэтому generate-plugin нужен для порядка меню и follow-up после круга. Подключать **до** generic citizen-блока.
- Бафф `attackSpeed` делит стат с бардом / эфиром Рена; другой `buffId` (`tavern_cheer`) — чужие таймеры не затирает.
