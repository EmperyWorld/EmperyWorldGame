# Сводка: Часовой HQ — брифинг кампуса и гостевой жетон

## Дата
2026-09-15

## Цель
Изолированный плагин `town_hq_sentry`: повторить inline-generate из `dialogue.ts` (допуск / грамоты), затем extras — бесплатный брифинг кампуса и разовый гостевой жетон. Грант `hq_verify_credentials` остаётся у родителя.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-hq.yaml` | `hq_visitor_badge` (material, unsellable) |
| `content/npcs/town_hq_sentry.yaml` | `hq_briefing` + YAML flavor `hq_ask` / `hq_leave` |
| `apps/server/src/services/hq-gate.ts` | Квалификация, брифинг, покупка жетона |
| `apps/server/src/services/hq-gate-dialogue.ts` | `generateHqGateDialogue` / `applyHqGateChoice` |
| `apps/server/src/services/hq-gate.test.ts` | Сервис + generate/apply |

Не трогались: `dialogue.ts`, HUD, controller, `packages/*`, catalog, `empery_hq.yaml`, YAML ресепшена / исследователя / терминала, другие NPC.

## Сигнатуры

```ts
hqGateBriefing(save: PlayerSave): HqGateResult
buyHqVisitorBadge(save: PlayerSave): HqGateResult
isHqGateQualified(save: PlayerSave): boolean
hasHqAccess(save: PlayerSave): boolean

generateHqGateDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyHqGateChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const hqGatePlugin: HavenNpcFeaturePlugin
```

Константы: `HQ_BADGE_COST=20`, `HQ_VISITOR_BADGE_ID`, флаги `quest_empery_hq_access` (существующий) / `haven_hq_badge`. Greeting доступа — копия `dialogue.ts`: «Допуск подтверждён. Ворота открыты…».

## Правила generate

- Есть `quest_empery_hq_access`: greeting доступа, choices = `hq_leave` («Иду.») + `hq_briefing` + `hq_badge` (пока нет `haven_hq_badge`). Без `hq_ask_access` / `hq_verify_credentials`.
- Иначе: YAML choices; если grove **или** depths boss **или** level ≥ 5 — `unshift hq_verify_credentials`. Extra `hq_briefing` (в YAML). `hq_badge` только при допуске.

## Правила apply

- `hq_verify_credentials` / `hq_leave` / `hq_ask_access` / `*_bye` → `null` (грант и YAML-ноды остаются в `dialogue.ts`).
- `hq_briefing`: бесплатный followUp про кампус / лаборатории / антенны. Без флага. Повторно.
- `hq_badge`: 20 адены → `hq_visitor_badge`, флаг `haven_hq_badge`. Без допуска / без адены / повтор — отказ, сейв не меняется.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Пока плагин не вставлен, inline-блок часового работает как раньше; YAML `hq_briefing` виден только без допуска (через текущий generate YAML). Жетон не появится, пока generate плагина не стоит **перед** inline `town_hq_sentry`.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateHqGateDialogue, applyHqGateChoice } from './hq-gate-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, **до** существующего `if (input.npcId === 'town_hq_sentry')` и до LLM:

```ts
const hqGateDialogue = generateHqGateDialogue(npc, input.save);
if (hqGateDialogue) return hqGateDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, **до** блока `town_hq_sentry` + `hq_verify_credentials` и YAML `nextNode`:

```ts
const hqGate = applyHqGateChoice(npc, save, choiceId);
if (hqGate) return hqGate;
```

Порядок важен: `hq_verify_credentials` вернёт `null` и дойдёт до текущего гранта допуска. После wiring inline-generate часового можно удалить — плагин его копирует.

HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- hq-gate
```

- без допуска: briefing есть, badge нет
- квалифицированный: `hq_verify_credentials`
- с допуском: покупка жетона один раз
- `applyHqGateChoice` → `null` для `hq_verify_credentials`
