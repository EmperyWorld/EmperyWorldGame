# Сводка: Трактирщик Олег — дневной обед

## Дата
2026-09-15

## Цель
Изолированный сервис дневной смены `town_innkeeper_day`: платный бульон + бафф «Дневной обед». Кости, отдых, рыба и питьё не дублируются.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-oleg.yaml` | `oleg_broth` (consumable, nutrition 14) |
| `content/npcs/town_innkeeper_day.yaml` | `oleg_lunch` / `oleg_news`; существующие inn_* сохранены |
| `apps/server/src/services/oleg-lunch.ts` | Механика обеда |
| `apps/server/src/services/oleg-lunch-dialogue.ts` | `generateOlegLunchDialogue` / `applyOlegLunchChoice` |
| `apps/server/src/services/oleg-lunch.test.ts` | Стоимость, item+buff, fallthrough inn_provisions, generate inn_rest |

Не трогались: `dialogue.ts`, HUD, controller, `haven-services.ts`, packages/catalog, `town_innkeeper.yaml` (Марта).

## Сигнатуры

```ts
serveOlegLunch(save: PlayerSave): OlegLunchResult

generateOlegLunchDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyOlegLunchChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const olegLunchPlugin: HavenNpcFeaturePlugin
```

Константы: `OLEG_LUNCH_COST=12`, предмет `oleg_broth`, бафф `oleg_lunch` / `mDef` 5 / 15 мин / «Дневной обед». Повторно.

## Правила механики

- `oleg_lunch`: 12 адены → `oleg_broth` + `applyNamedBuff` (`mDef` 5, 15 мин). Не хватает адены — fail без мутации сейва.
- `oleg_news`: бесплатный followUp про дневную смену; `save` тот же объект.
- `generate` только для `town_innkeeper_day`. Чужой npc → `null`.
- Fallthrough (`null`, дальше YAML / `haven-services`): `inn_fish_delivery`, `inn_provisions`, `inn_rest`, `inn_dice`, `inn_dice_10`, `inn_dice_25`, `inn_dice_50`, `inn_dice_leave`, `inn_day`, `inn_leave`.
- Choice id `marta_stew` не используется.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе — без двух вставок generate Олега падает в LLM, а обед из диалога не применяется.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateOlegLunchDialogue, applyOlegLunchChoice } from './oleg-lunch-dialogue.js';
```

`DialogueService.generate` — после schedule-gate / рядом с другими Haven-плагинами, до LLM:

```ts
const olegLunch = generateOlegLunchDialogue(npc, input.save);
if (olegLunch) return olegLunch;
```

`DialogueService.applyChoice` — сразу после schedule-gate, **до** YAML `nextNode` и inn rest/dice/fish:

```ts
const olegApplied = applyOlegLunchChoice(npc, save, choiceId);
if (olegApplied) return olegApplied;
```

Порядок важен: inn_* вернут `null` и дойдут до существующего inn-блока. Марта (`town_innkeeper`) плагин не перехватывает.

## Риски до wiring
Пока `dialogue.ts` не подключён, дневной обед в YAML виден только если generate YAML/LLM его не затрёт; `apply` не вызывается — покупка из диалога не списывает адену.
