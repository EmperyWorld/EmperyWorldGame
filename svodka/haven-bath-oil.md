# Сводка: Банщица Ника — банное масло

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_bathkeeper`: повторная продажа флакона `nika_oil` (18 адены) + уникальный бафф скорости `nika_oil`. Парная и взвар остаются в `haven-services.ts`.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-bath.yaml` | `nika_oil` (material, common, 0.2 кг) |
| `content/npcs/town_bathkeeper.yaml` | выбор `bath_oil`; узлы `steam` / `rules` без изменений |
| `apps/server/src/services/bath-oil.ts` | Механика масла |
| `apps/server/src/services/bath-oil-dialogue.ts` | `generateBathOilDialogue` / `applyBathOilChoice` |
| `apps/server/src/services/bath-oil.test.ts` | Стоимость, предмет+speed-флаги, apply null, generate `bath_tea` |

Не трогались: `dialogue.ts`, HUD, controller, `haven-services.ts`, `packages/*`, catalog, другие NPC YAML.

## Сигнатуры

```ts
buyNikaOil(save: PlayerSave): BathOilResult

generateBathOilDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyBathOilChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const bathOilPlugin: HavenNpcFeaturePlugin
```

Константы: `BATH_OIL_COST=18`, `NIKA_OIL_ITEM='nika_oil'`, бафф `nika_oil` / `speed` / 12 / 15 мин / «Банное масло».

## Правила механики

- 18 адены → `appendItemsToSave` `nika_oil` + `applyNamedBuff` `nika_oil` (`speed` 12, 15 мин, имя «Банное масло»). Повторно, без квестовых флагов.
- Не хватает адены — сейв не меняется.
- Бафф **не** `bath_steam` (парная / `pAtk` 10). Отдельный `buffId`.
- Flavor / session / tea / `*_bye` → `applyBathOilChoice` возвращает `null` (парная и взвар остаются у родителя).

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Без двух вставок Ника останется YAML/LLM + существующие `bath_session` / `bath_tea`.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateBathOilDialogue, applyBathOilChoice } from './bath-oil-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, рядом с другими Haven NPC, **до** LLM:

```ts
const bathOilDialogue = generateBathOilDialogue(npc, input.save);
if (bathOilDialogue) return bathOilDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, **до** существующих `bath_session` / `bath_tea` / YAML `nextNode`:

```ts
const bathOil = applyBathOilChoice(npc, save, choiceId);
if (bathOil) return bathOil;
```

Порядок важен: `bath_session`, `bath_tea`, `bath_rest`, `bath_rules`, `bath_leave`, `bath_steam_bye` вернут `null` и дойдут до текущего кода (`takeBathSession` / `buyBathTea` / YAML steam/rules).

HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- bath-oil
```

Покрыто: бедность (18 адены), предмет + флаги `buff_sup_nika_oil_*` (speed / 12 / «Банное масло»), повторная покупка, generate включает `bath_tea`, apply null для `bath_session` и YAML flavor.

## Риски

- Без WIRING в `dialogue.ts` кнопка `bath_oil` видна из YAML, но на applyChoice тихо закроет диалог (`_bath_oil` без nextNode) без списания адены.
- Иконка `item_nika_oil.webp` может отсутствовать: catalog / packages не трогали. Хук generate-item-icon мог бы дописать каталог — откатили.
- Парная (`bath_steam`) и масло (`nika_oil`) могут висеть одновременно — разные `buffId`.
