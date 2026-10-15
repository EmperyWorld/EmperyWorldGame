# Сводка: Городской стражник — муштра ополчения и добровольная стена

## Дата
2026-09-15

## Цель
Изолированный сервис **амбиентного** стражника квартала гарнизона `haven_citizen_guard` (не Леон `town_guard`, не Гаррет `town_captain`): бесплатная муштра за выносливость и разовое дежурство на стене.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/haven_citizen_guard.yaml` | `militia_drill` / `militia_watch` + слухи/совет/уход |
| `apps/server/src/services/citizen-militia.ts` | Муштра и стена |
| `apps/server/src/services/citizen-militia-dialogue.ts` | `generateCitizenMilitiaDialogue` / `applyCitizenMilitiaChoice` |
| `apps/server/src/services/citizen-militia.test.ts` | Сервис + диалог |

Не трогались: `dialogue.ts`, HUD, controller, `citizen-rumors.ts` (только import `formatCitizenGreeting`), `town_guard.yaml`, `town_captain.yaml`, `captain-drill*`, `guard-watch*`, packages/catalog, прочие citizen YAML.

## Экспорт

```ts
militiaDrill(save: PlayerSave): CitizenMilitiaResult
militiaWatch(save: PlayerSave): CitizenMilitiaResult

generateCitizenMilitiaDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyCitizenMilitiaChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const citizenMilitiaPlugin: HavenNpcFeaturePlugin
```

Константы: `MILITIA_DRILL_STAMINA_COST=70`, `MILITIA_WATCH_REWARD_ADENA=40`.
Флаг: `quest_militia_watch_complete` (не `quest_guard_report_*`).
Бафф: `militia_drill` / `pDef` 7 / 15 мин / «Ополчение» (не `captain_drill`, не `guard_watch`).
Предмет не нужен.

## Правила механики

- `militia_drill`: бесплатно, нужно ≥70 выносливости, −70 (`clampPlayerStamina` / `PLAYER_STAMINA_MAX` если поле пустое), бафф «Ополчение». Повторяемая.
- `militia_watch`: разово, +40 адены, ставит `quest_militia_watch_complete`, скрывается после complete. Выносливость не тратит.
- `citizen_rumors` / `citizen_advice` / `citizen_leave` → `apply` возвращает `null` (generic citizen-handler в `dialogue.ts`).
- `generate` только для `haven_citizen_guard`; приветствие через `formatCitizenGreeting`.

## WIRING (интегратор)

`dialogue.ts` / HUD **не** подключены в этом диффе.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import {
  generateCitizenMilitiaDialogue,
  applyCitizenMilitiaChoice,
} from './citizen-militia-dialogue.js';
```

`DialogueService.generate` — **до** generic-блока `haven_citizen_`:

```ts
const militiaDialogue = generateCitizenMilitiaDialogue(npc, input.save);
if (militiaDialogue) return militiaDialogue;
```

`DialogueService.applyChoice` — до generic `haven_citizen_` / YAML `nextNode`:

```ts
const militia = applyCitizenMilitiaChoice(npc, save, choiceId);
if (militia) return militia;
```

Порядок: flavor ids вернут `null` и дойдут до существующего citizen-rumors handler.

## Тесты

```bash
pnpm --filter @empery/server test -- citizen-militia
```

Покрыто: drill stamina fail / buff pDef; watch once + hide; apply null rumors; generate includes `militia_drill`.

## Риски

- Без WIRING в `dialogue.ts` кнопки YAML уже видны (generic citizen generate + `blocks`), но клик муштры/стены не снимет выносливость и не выдаст адену.
- Слухи/совет продолжают работать через существующий citizen-handler, пока apply возвращает `null`.
