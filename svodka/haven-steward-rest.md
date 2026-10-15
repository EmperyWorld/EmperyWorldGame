# Сводка: Дворецкий Эдмунд — отдых жильца

## Дата
2026-09-15

## Цель
Изолированный сервис `town_steward`: платный отдых у печи для владельца квартиры (8 адены, дешевле трактира 25). Покупка ключа и вход в квартиру остаются на клиенте. Flavor/YAML (`steward_buy_1/2/3`, `steward_enter`, `steward_leave`) сохранены.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/town_steward.yaml` | Добавлен `steward_rest`; buy/enter/leave без смены id |
| `apps/server/src/services/steward-rest.ts` | `tenantRest` |
| `apps/server/src/services/steward-rest-dialogue.ts` | `generateStewardDialogue` / `applyStewardChoice` |
| `apps/server/src/services/steward-rest.test.ts` | Сервис + фильтры диалога |

Не трогались: `dialogue.ts`, `housing.ts` (только import `loadHousingConfig` / `emptyHousingStorages`), `quest-hud*`, `dialogue-controller`, `haven-services`, `ally-buffs`, `town-services`, прочие NPC YAML.

## Сигнатуры

```ts
tenantRest(save: PlayerSave, now?: number): StewardRestResult

generateStewardDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyStewardChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const stewardRestPlugin: HavenNpcFeaturePlugin
```

Константы: `TENANT_REST_COST=8`, `TENANT_REST_FATIGUE_RELIEF=40`, `TENANT_REST_MINUTES=20`, бафф `tenant_rest` / `mpRegen` / 8 / 20 мин / «Тепло печи». Отказ без жилья: `Сначала ключ от квартиры`.

HUD не требуется.

## Правила механики

- Нет `save.housing` → fail, сейв без изменений.
- Мало адены → fail с суммой.
- Успех: −8 адены, `hp=maxHp`, `mp=maxMp`, `applyRestRecovery` (усталость −40, 20 мин), `applyNamedBuff` + `applyStatsToSave`.
- Generate фильтрует как текущий `dialogue.ts`:
  - `steward_enter` только если `save.housing`
  - `steward_buy_1` если `tier<1`, `buy_2` если `tier<2`, `buy_3` если `tier<3`
- Apply **обязан** вернуть `null` для `steward_buy_1/2/3`, `steward_enter`, `steward_leave` — клиентский intercept покупки/входа и YAML `_steward_done` остаются рабочими.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateStewardDialogue, applyStewardChoice } from './steward-rest-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, **вместо** (или сразу перед) блока `if (input.npcId === 'town_steward')`:

```ts
const stewardDialogue = generateStewardDialogue(npc, input.save);
if (stewardDialogue) return stewardDialogue;
```

Плагин уже повторяет фильтры buy/enter и суффикс приветствия (`N-комнатная` / «Квартиры пока нет»). Старый hardcoded-блок Эдмунда можно удалить после вставки, иначе generate плагина не дойдёт.

`DialogueService.applyChoice` — сразу после schedule-gate, до YAML `nextNode` fallback:

```ts
const stewardRest = applyStewardChoice(npc, save, choiceId);
if (stewardRest) return stewardRest;
```

Поведение apply:

- чужой npc → `null`
- `steward_rest` → `{ save, townMessage, followUp }`
- `steward_buy_1/2/3`, `steward_enter`, `steward_leave` → `null` (клиент `buyHousing`/`enterHousing`, YAML leave)

Quest HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- steward-rest
```

Покрыто: нет ключа, бедность, успех (HP/MP/fatigue/бафф, cost < 25), generate null на чужом NPC, фильтры tier 0/1/2/3, apply null для buy/enter/leave, apply rest + follow-up, YAML ids.

Интеграция через `DialogueService` **не** гоняется, пока нет WIRING.

## Риски до wiring

Пока `dialogue.ts` не подключён, `generate` Эдмунда идёт через существующий hardcoded-блок: `steward_rest` из YAML уже виден (фильтр пропускает неизвестные id), но `applyChoice` на `_steward_rest` без `nextNode` тихо закроет диалог без списания адены и баффа. После вставки apply — ок. Клиентский buy/enter не ломается, потому что apply плагина возвращает `null` для этих id.
