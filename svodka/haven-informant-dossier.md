# Сводка: Информатор — платное досье и доля за имя

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_informant`: платное unsellable-досье, разовый контракт на имя, claim доли после доказательства клинка. Flavor-слухи `rumor_latest` / `rumor_shady` / `rumor_leave` не трогались — их по-прежнему крутит `dialogue.ts`.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-informant.yaml` | `whisper_dossier` (unsellable, material) |
| `content/npcs/town_informant.yaml` | Новые mechanic-choices + старые rumor-ноды |
| `apps/server/src/services/informant-dossier.ts` | Механика досье / контракта |
| `apps/server/src/services/informant-dossier-dialogue.ts` | `generateInformantDialogue` / `applyInformantChoice` |
| `apps/server/src/services/informant-dossier.test.ts` | Сервис + фильтры диалога |

Не трогались: `dialogue.ts`, `quest-hud.ts`, `rumors.ts` (только import), `haven-services`, `haven-npc-plugin` (types-only import), media, shared, другие NPC YAML.

## Сигнатуры

```ts
buyDossier(save: PlayerSave): InformantDossierResult
buyShadyContract(save: PlayerSave): InformantDossierResult
claimShadyContract(save: PlayerSave): InformantDossierResult
dossierHintFromFlags(save: PlayerSave): string

generateInformantDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyInformantChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const informantDossierPlugin: HavenNpcFeaturePlugin
```

Константы: `DOSSIER_COST=18`, `CONTRACT_COST=25`, `CONTRACT_REWARD_ADENA=55`, флаги `quest_informant_contract_active` / `quest_informant_contract_complete`, HUD `INFORMANT_CONTRACT_HUD`.

## Правила механики

- Досье: 18 адены, предмет `whisper_dossier`. Повтор — fail `Досье уже у тебя`. Сообщение содержит конкретный hint по флагам (`quest_hq_lab_complete` / `quest_hq_lab_active` / `quest_board_bounty_complete` / `quest_grove_complete`) + улицу/тень из `getLatestRumors` / `getShadyRumors`.
- Контракт: 25 адены, ставит `quest_informant_contract_active`. Если уже active — напоминание без платы. Если complete — отказ.
- Claim: +55 адены, complete, снимает active. Требует `quest_board_bounty_complete` **или** `quest_grove_complete`, иначе `Сначала докажи клинок — зачистка или роща`. Повтор — отказ. Боя в этом сервисе нет: клинок доказывается существующими квестами.
- `applyInformantChoice` для `rumor_latest` / `rumor_shady` / `rumor_leave` → `null` (существующий блок в `dialogue.ts`).

## WIRING (интегратор)

`dialogue.ts` и `quest-hud.ts` **не** подключены в этом диффе.

### 1. `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateInformantDialogue, applyInformantChoice } from './informant-dossier-dialogue.js';
```

`DialogueService.generate` — сразу после `getNpcQuestDialogue` (до citizen/LLM), рядом с другими Haven-плагинами:

```ts
const informantDialogue = generateInformantDialogue(npc, input.save);
if (informantDialogue) return informantDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate / `walk_bye`, **до** YAML `nextNode` fallback и **до** существующего блока `town_informant` + `rumor_*`:

```ts
const informantApplied = applyInformantChoice(npc, save, choiceId);
if (informantApplied) return informantApplied;
```

Порядок важен: rumor ids вернут `null` и дойдут до текущего `getLatestRumors` / `getShadyRumors` блока.

### 2. `apps/client/src/quest-hud.ts`

В блок активных квестов (рядом с `quest_scribe_folio_active` / `quest_dock_shift_active`):

```ts
if (hasFlag(s, 'quest_informant_contract_active')) {
  return 'Квест: забери долю у информатора [E]';
}
```

Тест в `quest-hud.test.ts`: флаг `quest_informant_contract_active` → та же строка.

Константа для копипасты: `INFORMANT_CONTRACT_HUD` из `informant-dossier.ts` (клиент не импортирует сервер — дублировать строку).

## Тесты

```bash
pnpm --filter @empery/server test -- informant-dossier
pnpm --filter @empery/server typecheck
```

Покрыто: бедность (dossier/contract), дубль досье, hint по grove/bounty/hq lab, contract→claim после рощи или доски, отказ claim без клинка, double claim / buy after complete, generate-фильтры (hide contract, show claim, keep rumors), greeting по предмету, apply null для rumor_* / чужого NPC.

Интеграция через `DialogueService` **не** гоняется, пока нет WIRING в `dialogue.ts`.

## Риски

- Без WIRING в `dialogue.ts` новые choices видны в YAML-меню, но механика не сработает (choice ids уйдут в `_flag` без сервиса). После вставки — ок; rumor_* останутся на старом блоке.
- Без `quest-hud.ts` HUD не покажет «забери долю», флаг на сейве всё равно ставится. Пока контракт active, HUD будет врать «забери долю» даже до доказательства клинка — claim тогда вернёт фразу про зачистку/рощу.
- Иконка: хук каталога откатан (media в задании запрещена). YAML `icon:` указывает на `/media/assets/item_whisper_dossier.webp`; WebP/каталог не генерировались. После разрешения media — catalog + `pnpm generate:media -- --only=item_whisper_dossier`.
- HQ lab hint не открывает claim: только bounty complete или grove complete.
