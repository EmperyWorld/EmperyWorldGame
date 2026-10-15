# Сводка: Доска объявлений — копия листовки и прошение

## Дата
2026-09-15

## Цель
Изолированные extras для `town_notice_board`: повторная копия бюллетеня (6 адены) и разовое прошение магистрату (15 адены + печать). Grove-bounty остаётся в `notice-board.ts` / `dialogue.ts`.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-notice.yaml` | `forum_bulletin`, `forum_seal` (unsellable, material) |
| `content/npcs/town_notice_board.yaml` | `board_copy` / `board_petition` (blocks), `node_guide` сохранён |
| `apps/server/src/services/notice-petition.ts` | Механика копии / прошения |
| `apps/server/src/services/notice-petition-dialogue.ts` | `generateNoticePetitionDialogue` / `applyNoticePetitionChoice` |
| `apps/server/src/services/notice-petition.test.ts` | Сервис + фильтры bounty + extras |

Не трогались: `dialogue.ts`, `combat.ts`, `notice-board.ts`, `haven-notice-dialogue.test.ts`, HUD, controller, `packages/*`, media catalog.

## Сигнатуры

```ts
copyBoardBulletin(save: PlayerSave): NoticePetitionResult
fileBoardPetition(save: PlayerSave): NoticePetitionResult

generateNoticePetitionDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyNoticePetitionChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const noticePetitionPlugin: HavenNpcFeaturePlugin
```

Константы: `BOARD_COPY_COST=6`, `BOARD_PETITION_COST=15`, предметы `forum_bulletin` / `forum_seal`, флаг `quest_forum_petition_complete`.

Импорт bounty (read-only): `BOARD_BOUNTY_ACTIVE_FLAG`, `BOARD_BOUNTY_COMPLETE_FLAG`, `BOARD_BOUNTY_KILLS_FLAG`, `BOARD_BOUNTY_TARGET_KILLS` из `notice-board.js`.

## Правила механики

- `board_copy`: 6 адены → `forum_bulletin`. Повторяемо (несколько копий). Недостаток адены — отказ без предмета.
- `board_petition`: 15 адены, разово. Ставит `quest_forum_petition_complete`, выдаёт `forum_seal`. Повтор — отказ без платы. YAML `blocks: [quest_forum_petition_complete]`.
- `applyNoticePetitionChoice` возвращает `null` для `board_bounty_accept`, `board_bounty_claim`, `board_news`, `board_guide`, `board_leave` — существующий блок в `dialogue.ts`.
- `generate` повторяет фильтры bounty из `dialogue.ts`:
  - скрыть `board_bounty_accept`, если active или complete;
  - показать `board_bounty_claim` только если active и не complete;
  - greeting: complete / active (`kills/target`) / `defaultGreeting`.
- Затем extras: `board_copy` всегда, `board_petition` пока флаг не complete.

## WIRING (интегратор)

`dialogue.ts` **не** подключён. Без двух вставок extras видны из YAML-меню, но `board_copy` / `board_petition` не применятся (уйдут в `_flag`). Bounty/news/guide продолжают работать как сейчас.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateNoticePetitionDialogue, applyNoticePetitionChoice } from './notice-petition-dialogue.js';
```

`DialogueService.generate` — **вместо** текущего блока `if (input.npcId === 'town_notice_board')` (плагин уже повторяет bounty-фильтры и greeting):

```ts
const noticePetition = generateNoticePetitionDialogue(npc, input.save);
if (noticePetition) return noticePetition;
```

`DialogueService.applyChoice` — **до** существующих `town_notice_board` + `board_bounty_*` / `board_news` / `board_guide` / `board_leave`:

```ts
const noticeApplied = applyNoticePetitionChoice(npc, save, choiceId);
if (noticeApplied) return noticeApplied;
```

Порядок важен: bounty/news/guide/leave вернут `null` и дойдут до текущего `acceptBoardBounty` / `claimBoardBounty` / `formatBoardNews` / `node_guide`.

HUD для прошения не нужен (разовый расход без active-фазы).

## Тесты

```bash
pnpm --filter @empery/server test -- notice-petition
```

Покрыто: загрузка предметов, копия (бедность / повтор), прошение один раз / второй fail, generate показывает `board_bounty_accept` при пустых флагах, скрывает accept при active, скрывает petition после complete, apply `null` для `board_bounty_accept` и YAML-ids.

Интеграция через `DialogueService` (как `haven-notice-dialogue.test.ts`) **не** гоняется, пока нет WIRING.

## Риски

- Без WIRING клик по `board_copy` / `board_petition` в текущем generate доски поставит `_flag`, предмет не выдастся. После вставки — ок.
- Hook generate-item-icon мог дописать catalog/manifest; эти правки откатил — `icon:` в YAML достаточны. Генерация WebP: `pnpm generate:media -- --only=item_forum_bulletin --force` (и `item_forum_seal`) после записи в catalog.
- `node_guide` не тронут. Контракт bounty в `notice-board.ts` не дублируется.
