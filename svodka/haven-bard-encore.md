# Сводка: Бард Кай — бис («Бис Кая»)

## Дата
2026-09-15

## Цель
Изолированный городской сервис `stage_bard`: платный повторный бис (+critRate «Бис Кая»). Существующие `bard_buff` / кастомные песни остаются в `haven-services.ts` / `dialogue.ts`. Flavor `bard_stories` → `node_stories` сохранён. Предмет не нужен. HUD нет.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/stage_bard.yaml` | `bard_encore` + старые `bard_buff` / `bard_stories` / `bard_song_custom` / `bard_leave`; `node_stories` без изменений |
| `apps/server/src/services/bard-encore.ts` | механика биса |
| `apps/server/src/services/bard-encore-dialogue.ts` | `generateBardEncoreDialogue` / `applyBardEncoreChoice` |
| `apps/server/src/services/bard-encore.test.ts` | стоимость, флаги баффа, fallthrough `bard_buff` |

Не трогались: `dialogue.ts`, `haven-services.ts`, HUD, controller, packages, catalog, другие NPC YAML, `ally-buffs.ts`.

## Сигнатуры

```ts
requestBardEncore(save: PlayerSave): BardEncoreResult

generateBardEncoreDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyBardEncoreChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const bardEncorePlugin: HavenNpcFeaturePlugin
```

Константы: `BARD_ENCORE_COST=8`, `buffId kai_encore`, `buffStat critRate`, amount 6, 15 мин, имя «Бис Кая».

Choice ids:
- `bard_encore` — механика биса
- `bard_buff`, `bard_stories`, `bard_song_custom`, `bard_leave` — apply → `null` (родитель: inspiration / YAML `node_stories` / кастом / закрытие)

Бафф отделён от `bard_inspiration` / `bard_tempo` / `bard_harmony`.

## Правила механики

- Бис: 8 адены, `applyNamedBuff` + `applyStatsToSave`. Повтор разрешён — перезаписывает свой таймер. Чужие named-buff ids не трогает.
- Бедность: fail, сейв не меняется.
- Generate только для `stage_bard`; меню включает `bard_buff` и `bard_encore`.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Без двух вставок кнопка YAML видна, но `_bard_encore` без nextNode тихо закроет диалог без баффа. `bard_buff` пока работает через существующий блок `stage_bard`.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateBardEncoreDialogue, applyBardEncoreChoice } from './bard-encore-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, **до** существующего `if (input.npcId === 'stage_bard')` и до LLM:

```ts
const bardEncoreDialogue = generateBardEncoreDialogue(npc, input.save);
if (bardEncoreDialogue) return bardEncoreDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, **до** существующего `if (npcId === 'stage_bard')` / YAML `nextNode`:

```ts
const bardEncore = applyBardEncoreChoice(npc, save, choiceId);
if (bardEncore) return bardEncore;
```

Порядок важен: `bard_buff` / `bard_song_custom` / `bard_leave` / `bard_stories` вернут `null` и дойдут до текущего кода (`requestBardInspiration` / YAML `node_stories`).

HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- bard-encore
```

Покрыто: бедность биса; успех (adena, `buff_sup_kai_encore_*`); повтор; generate null на чужом NPC; generate содержит `bard_buff` и `bard_encore`; apply null для `bard_buff` / flavor.

Интеграция через `DialogueService` **не** гоняется, пока нет WIRING в `dialogue.ts`.

## Риски

- **dialogue.ts не подключён** — YAML-кнопка `bard_encore` видна, но без apply плагина бафф не ставится.
- Generate плагина, если воткнуть **после** текущего блока `stage_bard`, никогда не вызовется — ставить **выше**.
- Бафф `kai_encore` делит слот `critRate` с другими named-buff ids той же статы (суммируется в `getAllyBuffBonuses`), но не перезаписывает `bard_inspiration`.
