# Сводка: Писец Ирина — городской архив и копии грамот

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_scribe`: платная копия путевой грамоты, поиск/выдача описи причалов, бафф «Ясность архива» (+accuracy). Flavor YAML (`scribe_find` / `scribe_rules`) сохранён.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-scribe.yaml` | `scribe_travel_writ`, `scribe_port_folio` (unsellable, material) |
| `content/npcs/town_scribe.yaml` | Новые choices + старые flavor-ноды |
| `apps/server/src/services/scribe-archive.ts` | Механика архива |
| `apps/server/src/services/scribe-archive-dialogue.ts` | `generateScribeDialogue` / `applyScribeChoice` |
| `apps/server/src/services/scribe-archive.test.ts` | Сервис + фильтры диалога |
| `apps/server/src/services/haven-npc-plugin.ts` | Контракт `HavenNpcFeaturePlugin` (types-only) |

Не трогались: `dialogue.ts`, `quest-hud.ts`, priest/healer/teacher YAML, `ally-buffs.ts`.

## Сигнатуры

```ts
copyTravelWrit(save: PlayerSave): ScribeArchiveResult
startArchiveSearch(save: PlayerSave): ScribeArchiveResult
claimArchiveFolio(save: PlayerSave): ScribeArchiveResult
requestArchiveClarity(save: PlayerSave): ScribeArchiveResult

generateScribeDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyScribeChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const scribeArchivePlugin: HavenNpcFeaturePlugin
```

Константы: `SCRIBE_WRIT_COST=20`, `SCRIBE_SEARCH_COST=12`, `SCRIBE_CLARITY_COST=10`, флаги `quest_scribe_folio_active` / `quest_scribe_folio_complete`, HUD `SCRIBE_FOLIO_HUD`.

## Правила механики

- Копия грамоты: 20 адены, предмет `scribe_travel_writ`. Повтор — fail `Грамота уже у тебя`.
- Поиск: 12 адены, ставит `quest_scribe_folio_active`. Если уже active — напоминание без платы. Если complete — отказ.
- Claim: выдаёт `scribe_port_folio`, complete, снимает active, **без** второй адены, бафф `scribe_clarity` (accuracy 12 / 25 мин). Повтор — отказ.
- Ясность: 10 адены, тот же бафф. `applyNamedBuff` + `applyStatsToSave`.
- Flavor ids (`scribe_find`, `scribe_rules`, `scribe_leave`, `*_bye`) → `applyScribeChoice` возвращает `null` (YAML `nextNode`).

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе — без двух вставок Ирина останется flavor-only на LLM/YAML.

### 1. `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateScribeDialogue, applyScribeChoice } from './scribe-archive-dialogue.js';
```

`DialogueService.generate` — сразу после `getNpcQuestDialogue` (до citizen/LLM):

```ts
const scribeDialogue = generateScribeDialogue(npc, input.save);
if (scribeDialogue) return scribeDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate / `walk_bye`, **до** YAML `nextNode` fallback:

```ts
const scribeApplied = applyScribeChoice(npc, save, choiceId);
if (scribeApplied) return scribeApplied;
```

Порядок важен: flavor ids вернут `null` и дойдут до существующего YAML-блока (`flag.startsWith('_')` + `nextNode`).

### 2. `apps/client/src/quest-hud.ts`

В блок активных квестов (рядом с `quest_fish_delivery_active` / `quest_garden_active`):

```ts
if (hasFlag(s, 'quest_scribe_folio_active')) {
  return 'Квест: забери опись у писца Ирины [E]';
}
```

Тест в `quest-hud.test.ts`: флаг `quest_scribe_folio_active` → та же строка.

Константа для копипасты: `SCRIBE_FOLIO_HUD` из `scribe-archive.ts` (клиент не импортирует сервер — дублировать строку).

## Тесты

```bash
pnpm --filter @empery/server test -- scribe-archive
```

Покрыто: бедность (writ/search/clarity), дубль грамоты, search→claim + бафф, double claim / search after complete, флаги clarity, generate-фильтры (hide search, show claim), greeting по предметам, apply null для flavor / чужого NPC.

Интеграция через `DialogueService` (как в `haven-services.test.ts`) **не** гоняется, пока нет WIRING в `dialogue.ts`.

## Риски

- Без WIRING в `dialogue.ts` новые choices видны только если LLM/YAML fallback покажет YAML-меню; механика не сработает (choice ids уйдут в `_flag` без сервиса, либо flavor nextNode). После вставки — ок.
- Без `quest-hud.ts` HUD не покажет «забери опись», флаг на сейве всё равно ставится.
- Иконки: хук мог дописать `packages/media` / manifest. Медиа в этом задании не генерировалось вручную; если каталог изменился — проверить diff.
- Flavor `scribe_find` по-прежнему текст «вот опись» без предмета — намеренно (lore). Реальная опись только через search/claim.
- Бафф claim и платная ясность делят `buffId: scribe_clarity` — повтор перезаписывает таймер.
