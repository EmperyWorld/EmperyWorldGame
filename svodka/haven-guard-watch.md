# Сводка: Страж Леон — городской штраф и дозорный рапорт

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_guard`: частичный штраф за карму греха (дешевле собора) и разовый дозорный рапорт с баффом меткости. Flavor YAML (`guard_rules` / `guard_trouble` / `guard_leave`) сохранён.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/town_guard.yaml` | Новые mechanic-choices + старые flavor-ноды |
| `apps/server/src/services/guard-watch.ts` | Штраф и рапорт |
| `apps/server/src/services/guard-watch-dialogue.ts` | `generateGuardDialogue` / `applyGuardChoice` |
| `apps/server/src/services/guard-watch.test.ts` | Сервис + фильтры диалога |
| `apps/server/src/services/haven-npc-plugin.ts` | Контракт (import-only, без правок) |

Не трогались: `dialogue.ts`, `quest-hud.ts`, `haven-services.ts`, `ally-buffs.ts`, media/shared, прочие NPC YAML.

## Сигнатуры

```ts
payCityFine(save: PlayerSave): GuardWatchResult
acceptWatchReport(save: PlayerSave): GuardWatchResult
claimGuardReport(save: PlayerSave): GuardWatchResult

generateGuardDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyGuardChoice(save: PlayerSave, npc: HavenNpcLike, choiceId: string): HavenNpcChoiceResult | null

export const guardWatchPlugin: HavenNpcFeaturePlugin
```

Константы: `GUARD_FINE_COST=30`, `GUARD_FINE_KARMA_CUT=25`, `GUARD_REPORT_REWARD_ADENA=40`.
Флаги: `quest_guard_report_active` / `quest_guard_report_complete`.
Бафф: `guard_watch` / `accuracy` 8 / 15 мин / «Глаз дозора» (`buffStat` не `pDef` — собор уже даёт pDef).
HUD: `GUARD_REPORT_HUD`.

## Правила механики

- Штраф: `karma <= 0` → fail «Кармы греха нет — штраф не за что». Иначе 30 адены, карма −min(karma, 25), не ниже 0. Собор (`confessAtCathedral`) по-прежнему полный сброс за 50.
- Accept: ставит `quest_guard_report_active`. Повтор при active — напоминание. После complete — отказ (разовый квест).
- Claim: требует active, +40 адены, complete, снимает active, бафф accuracy 8 / 15 мин. Double claim — отказ.
- Flavor ids (`guard_rules`, `guard_trouble`, `guard_leave`, `*_bye`) → `applyGuardChoice` возвращает `null` (YAML `nextNode`).

Greeting в `generateGuardDialogue` — копия inline-блока `dialogue.ts` (`town_guard`): `karma < 0` → угроза; иначе `quest_board_bounty_complete` → привет герою. Родитель может заменить inline-блок вызовом плагина.

## WIRING (интегратор)

`dialogue.ts` / `quest-hud.ts` **не** подключены в этом диффе.

### 1. `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateGuardDialogue, applyGuardChoice } from './guard-watch-dialogue.js';
```

`DialogueService.generate` — сразу после `getNpcQuestDialogue` (до citizen/LLM), **вместо** inline `if (input.npcId === 'town_guard') { ... }`:

```ts
const guardDialogue = generateGuardDialogue(npc, input.save);
if (guardDialogue) return guardDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate / `walk_bye`, **до** YAML `nextNode` fallback (рядом с miller):

```ts
const guard = applyGuardChoice(save, npc, choiceId);
if (guard) return guard;
```

Порядок важен: flavor ids вернут `null` и дойдут до существующего YAML-блока (`flag.startsWith('_')` + `nextNode`).

### 2. `apps/client/src/quest-hud.ts`

В блок активных квестов (рядом с `quest_miller_order_active` / `quest_scribe_folio_active`):

```ts
if (hasFlag(s, 'quest_guard_report_active')) {
  return 'Квест: доложи стражу Леону у ворот [E]';
}
```

Тест в `quest-hud.test.ts`: флаг `quest_guard_report_active` → та же строка.

Константа для копипасты: `GUARD_REPORT_HUD` из `guard-watch.ts` (клиент не импортирует сервер — дублировать строку).

## Тесты

```bash
pnpm --filter @empery/server test -- guard-watch
pnpm --filter @empery/server typecheck
```

Покрыто: штраф при karma 0 / отрицательной / бедности; cut 10→0, 25→0, 40→15; leftover vs собор; accept / remind / complete-lock; claim +40 + buff accuracy; double claim; generate-фильтры (fine только при karma>0, hide accept, show claim); greeting PK/bounty копия; apply null для flavor / чужого NPC.

Интеграция через `DialogueService` **не** гоняется, пока нет WIRING в `dialogue.ts`. Существующий `citizen-rumors.test.ts` (Леон + karma/bounty) продолжит бить в inline-блок, пока тот не заменён.

## Риски

- Без WIRING в `dialogue.ts` YAML-кнопки штрафа/рапорта уже видны в inline-меню Леона, но `_` flag-handler не режет карму и не ставит квест. Flavor-ноды работают как раньше.
- Без `quest-hud.ts` HUD не покажет «доложи стражу Леону», флаг на сейве всё равно ставится после apply.
- Greeting PK (`karma < 0`) скопирован 1:1; `save-normalize` клампит карму к ≥0, поэтому в живом сейве ветка почти мёртвая — как в текущем `dialogue.ts`.
- Штраф и собор ортогональны: 30 адены / −25 кармы vs 50 / полный сброс. Игрок может сначала заплатить Леону, потом добить остаток у Кассия.
- Бафф `guard_watch` (accuracy) не пересекается с `cathedral_bless` (pDef) и делит accuracy-слот с `scribe_clarity` только по сумме статов (разные `buffId`).
