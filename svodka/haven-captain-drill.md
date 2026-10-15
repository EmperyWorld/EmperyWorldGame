# Сводка: Капитан Гаррет — строевая подготовка

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_captain`: платная строевая (выносливость + `pAtk`). YAML-хинты рощи/путешествия и квест пещер **не трогали** — depths logic остаётся в `dialogue.ts`.

## Файлы
- `content/npcs/town_captain.yaml` — `captain_drill`; `captain_grove` / `captain_travel` / `captain_depths` / `captain_bye` / `depths_go` на месте
- `apps/server/src/services/captain-drill.ts`
- `apps/server/src/services/captain-drill-dialogue.ts`
- `apps/server/src/services/captain-drill.test.ts`

HUD не нужен. `ally-buffs.ts` не меняли.

## Сигнатуры

```ts
captainDrill(save: PlayerSave): CaptainDrillResult

generateCaptainDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyCaptainChoice(save: PlayerSave, npc: HavenNpcLike, choiceId: string): HavenNpcChoiceResult | null
```

Константы: `CAPTAIN_DRILL_COST=12`, `CAPTAIN_DRILL_STAMINA_RESTORE=250`.
Бафф (через `applyNamedBuff`): `captain_drill` / `pAtk` / 12 / 20 мин / «Строевая выправка».
Стамина: `clampPlayerStamina(current + 250)` к `PLAYER_STAMINA_MAX` (drain нет). Бедность → fail, save без изменений.

`captainBrief` не делали: travel/grove уже в YAML (`hint_travel` / `hint_grove`).

Choice ids:
- `captain_drill` — механика (non-null apply)
- `captain_grove`, `captain_travel`, `captain_depths`, `captain_bye`, `depths_go`, `*_bye` → `null` (YAML `nextNode`)

Generate: `null` если не `town_captain`. Все YAML-кнопки + `captain_drill`. `captain_depths` скрывается как в `dialogue.ts`: нет `quest_grove_complete` и нет `quest_betrayal_complete`; плюс `blocks` из YAML.

## WIRING (`dialogue.ts`) — не сделано в этом диффе

Импорт:

```ts
import { generateCaptainDialogue, applyCaptainChoice } from './captain-drill-dialogue.js';
```

`DialogueService.generate` — **после** `getNpcQuestDialogue` (depths-сцены Гаррета должны выигрывать), до LLM:

```ts
const captainDialogue = generateCaptainDialogue(npc, input.save);
if (captainDialogue) return captainDialogue;
```

`DialogueService.applyChoice` — после schedule-gate, до generic `nextNode`:

```ts
const captain = applyCaptainChoice(save, npc, choiceId);
if (captain) return captain;
```

Поведение apply:
- чужой npc → `null`
- `captain_drill` → `{ save, townMessage, followUp }`
- grove / travel / depths / bye / `depths_go` / `*_bye` → `null`

HUD не требуется.

## Тесты
`pnpm --filter @empery/server test -- captain-drill`

- бедная строевая: adena/stamina/buff без изменений
- успех: −12 адены, stamina +250, `buff_sup_captain_drill_*`
- clamp до `PLAYER_STAMINA_MAX`
- generate null на чужом npc; depths скрыт до grove/betrayal; blocks YAML
- flavor fallthrough; drill через apply + оставшиеся choices

## Риски до wiring
- Пока `dialogue.ts` не подключён, generate Гаррета идёт в LLM/`getCaptainDepthsDialogue`. Кнопка `captain_drill` появится в LLM-меню (YAML), но `_captain_drill` на applyChoice тихо закроет диалог без списания адены.
- **Порядок generate обязателен:** plugin **после** `getNpcQuestDialogue`. Иначе меню строевой перебьёт активные/завершённые сцены Пещер теней.
- Пока depths-квест активен/закрыт, `getCaptainDepthsDialogue` возвращает свою сцену без `captain_drill` — строевая недоступна до idle-меню. Менять depths-логику в этом срезе нельзя.
- Бафф `pAtk` не пересекается id с Никой: другой `buffId` (`captain_drill`).
