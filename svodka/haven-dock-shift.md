# Сводка: Грузчик Петр — портовая смена с ящиками

## Дата
2026-09-15

## Цель
Самодостаточная смена у `town_dockhand`: взять 2× `port_crate` (12 кг), пройтись с весом, вернуть Петру за 70 адены. Повторяемая (без complete-замка).

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-dock.yaml` | предмет `port_crate` |
| `content/npcs/town_dockhand.yaml` | выборы смены + `dock_supplies` + flavor |
| `apps/server/src/services/dock-shift.ts` | логика смены |
| `apps/server/src/services/dock-shift-dialogue.ts` | плагин generate/apply |
| `apps/server/src/services/dock-shift.test.ts` | тесты |
| `apps/server/src/services/haven-npc-plugin.ts` | контракт плагина (без правок логики) |

Магазин `haven_supplies.yaml` не трогали — ящики не продаются.

## Сигнатуры

```ts
startDockShift(save: PlayerSave): DockShiftResult
finishDockShift(save: PlayerSave): DockShiftResult
abandonDockShift(save: PlayerSave): DockShiftResult
countPortCrates(save: PlayerSave): number

generateDockDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyDockChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null
```

Флаги: `quest_dock_shift_active` (только active). Счётчик успехов: `haven_dock_shifts`.
Награда: 70 adena. Старт: 2× `port_crate`, stamina −80 (`clampPlayerStamina`, 0…`PLAYER_STAMINA_MAX`).
Choice id `dock_supplies` сохранён (клиент открывает supplies shop).

## WIRING

Плагин готов, **DialogueService / HUD ещё не подключены** (запрещено в этом срезе).

### `apps/server/src/services/dialogue.ts`

`generate()` после `loadNpc` (рядом с `getNpcQuestDialogue` / ветками haven NPC):

```ts
import { generateDockDialogue, applyDockChoice } from './dock-shift-dialogue.js';

const dock = generateDockDialogue(npc, input.save);
if (dock) return dock;
```

`applyChoice()` до generic YAML-handler:

```ts
const dockChoice = applyDockChoice(npc, save, choiceId);
if (dockChoice) return dockChoice;
```

- `applyDockChoice` → `{ save }` для `dock_supplies` (клиент уже открывает магазин).
- Flavor `dock_work` / `dock_warn` / `dock_leave` / `*_bye` → `null` → существующий nextNode/`_` путь.

### HUD — `apps/client/src/quest-hud.ts`

В блок активных квестов (после рыбы Ульфа, до сада), плюс тест в `quest-hud.test.ts`:

```ts
if (hasFlag(s, 'quest_dock_shift_active')) {
  return 'Квест: верни ящики грузчику Петру в порт [E]';
}
```

Клиент `dialogue-controller.ts` / `apps/client/src/game/**` не нужны: `dock_supplies` уже открывает shop.

## Тесты

`pnpm --filter @empery/server test -- dock-shift`

- start: 2 ящика + active + stamina drain
- finish без ящиков: fail, active остаётся
- finish с 2: +70 adena, active снят, `haven_dock_shifts += 1`
- abandon: все `port_crate` сняты, без оплаты
- повторный start при active: напоминание, без лишних ящиков
- `dock_supplies` apply → `{ save }`
- generate: greeting «Ну что, ящики на месте?» при active; abandon только если active

## Риски

- Пока `dialogue.ts` не вызвал плагин, YAML-кнопки смены видны, но `_` flag-handler не выдаёт ящики.
- Пока HUD не подключён — нет полоски квеста.
- Иконка `item_port_crate.webp` не генерировалась (запрет media). YAML `icon:` уже указывает на путь.
- `appendItemsToSave` всегда дописывает (лимита сумки нет) — старт не фейлится по месту.
- Лишние `port_crate` после сдачи двух остаются в сумке (unsellable).
- `staminaAt` пишется при старте, чтобы `refreshPlayerStamina` не откатил −80.
- Не пересекается с квестом рыбы Ульфа (`quest_fish_delivery_*` не трогали).
