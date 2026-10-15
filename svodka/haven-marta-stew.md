# Сводка: Марта — ночной горшок

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_innkeeper` (ночная Марта): повторная продажа ночного горшка за 14 адены (предмет + бафф `pDef`). Кости, отдых, доставка рыбы и питьё остаются у родителя (`dialogue.ts` / `haven-services.ts`). Олег (`town_innkeeper_day`) не затронут.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-marta.yaml` | `marta_stew` (consumable, `survival.nutrition: 18`) |
| `content/npcs/town_innkeeper.yaml` | Добавлен `marta_stew`; fish/provisions/rest/dice/night/leave без смены id |
| `apps/server/src/services/marta-stew.ts` | `buyMartaStew` |
| `apps/server/src/services/marta-stew-dialogue.ts` | `generateMartaStewDialogue` / `applyMartaStewChoice` |
| `apps/server/src/services/marta-stew.test.ts` | Сервис + generate/apply |

Не трогались: `dialogue.ts`, `haven-services.ts`, `quest-hud*`, `dialogue-controller`, `ally-buffs`, `packages/*`, media/catalog, `town_innkeeper_day.yaml`, прочие NPC YAML.

## Сигнатуры

```ts
buyMartaStew(save: PlayerSave): MartaStewResult

generateMartaStewDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyMartaStewChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const martaStewPlugin: HavenNpcFeaturePlugin
```

Константы: `MARTA_STEW_COST=14`, `MARTA_STEW_ITEM='marta_stew'`, бафф `marta_hearth` / `pDef` / 6 / 20 мин / «Ночной очаг». Generate только при `npc.id === 'town_innkeeper'`.

HUD не требуется.

## Правила механики

- Мало адены → fail, сейв без изменений.
- Успех: −14 адены, `appendItemsToSave` → `marta_stew`, `applyNamedBuff` `marta_hearth`, `applyStatsToSave`. Повторно.
- Flavor / dice / rest / fish / provisions / `*_bye` → `applyMartaStewChoice` возвращает `null`.

Apply **обязан** вернуть `null` для: `inn_fish_delivery`, `inn_provisions`, `inn_rest`, `inn_dice`, `inn_dice_10`, `inn_dice_25`, `inn_dice_50`, `inn_dice_leave`, `inn_night`, `inn_leave`.

Бафф отделён от бани (`bath_steam` / pAtk), собора (`cathedral_bless` / pDef), тоста Хольма (`holm_toast` / mDef), клиники (`sera_care` / mDef) другим `buffId`.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Без двух вставок Марта останется YAML/LLM + существующие inn_rest / inn_dice / inn_fish_delivery.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateMartaStewDialogue, applyMartaStewChoice } from './marta-stew-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, рядом с другими Haven NPC, **до** LLM:

```ts
const martaStew = generateMartaStewDialogue(npc, input.save);
if (martaStew) return martaStew;
```

`DialogueService.applyChoice` — сразу после schedule-gate, **до** существующего inn_rest / inn_dice / inn_fish_delivery:

```ts
const marta = applyMartaStewChoice(npc, save, choiceId);
if (marta) return marta;
```

Порядок важен: `inn_rest`, `inn_dice*`, `inn_fish_delivery`, `inn_provisions` вернут `null` и дойдут до текущего кода (haven-services / клиент лавка / YAML nextNode).

HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- marta-stew
```

Покрыто: бедность, предмет + флаги `marta_hearth`, повторная покупка, generate extras при дырявом YAML, generate содержит `inn_dice` и `marta_stew`, apply null для `inn_rest` / `inn_dice` и остальных inn_*.

## Риски

- Без WIRING в `dialogue.ts` кнопка видна из YAML, но `marta_stew` на applyChoice тихо закроет диалог (`_marta_stew` без nextNode) без списания адены.
- Кости / отдых / рыба не дублируются: apply их не трогает.
- Хук generate-item-icon мог дописать `packages/media/src/catalog.ts` — откатили. Иконка `item_marta_stew.webp` может быть в manifest с диска; каталог не трогали.
