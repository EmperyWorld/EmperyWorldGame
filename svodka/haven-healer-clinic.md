# Сводка: Лекарь Сера — полевая клиника

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_healer`: продажа полевого бинта, долгий уход (HP/MP + усталость + `mDef`), осмотр хворей. `healer_shop` остаётся клиентской аптекой, `healer_treat` — у родителя через `treatAtNpc`. HUD нет.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-healer.yaml` | `sera_bandage` (consumable, `survival.tool: bandage`) |
| `content/npcs/town_healer.yaml` | `healer_kit` / `healer_long` / `healer_diagnose` + старые shop/treat/flavor |
| `apps/server/src/services/healer-clinic.ts` | Механика клиники |
| `apps/server/src/services/healer-clinic-dialogue.ts` | `generateHealerDialogue` / `applyHealerChoice` |
| `apps/server/src/services/healer-clinic.test.ts` | Сервис + generate/apply |

Не трогались: `dialogue.ts`, `medical.ts` (только импорт), `quest-hud*`, `dialogue-controller`, `haven-services`, `ally-buffs`, `haven_apothecary.yaml`, media/manifest.

## Сигнатуры

```ts
healerFieldKit(save: PlayerSave): HealerClinicResult
healerLongCare(save: PlayerSave): HealerClinicResult
healerDiagnose(save: PlayerSave): HealerClinicResult
healerTreat(save: PlayerSave): HealerClinicResult  // обёртка treatAtNpc; apply не вызывает

generateHealerDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyHealerChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const healerClinicPlugin: HavenNpcFeaturePlugin
```

Константы: `HEALER_KIT_COST=20`, `HEALER_LONG_COST=60` (> treat 45), `SERA_BANDAGE_ID`, бафф `sera_care` / `mDef` / 8 / 20 мин / «Спокойный пульс».

## Правила механики

- Полевой набор: 20 адены, `appendItemsToSave` → `sera_bandage`. Уже 3+ бинта — всё равно продаём.
- Долгий уход: 60 адены, полное HP/MP, `applyRestRecovery` (усталость −40, если safeZone), `applyNamedBuff` `sera_care`. Болезни/травмы не снимает — это `healer_treat`.
- Осмотр: без платы, `survivalOf` + `listActiveConditionHints`. Нет хворей → `Ран и хворей не вижу`. Сейв не меняется.
- Flavor / shop / treat / `*_bye` → `applyHealerChoice` возвращает `null`.

Бафф отделён от бани (`bath_steam` / pAtk), собора (`cathedral_bless` / pDef), тоста Хольма (`holm_toast` / mDef) другим `buffId`.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Без двух вставок Сера останется YAML/LLM + существующий `healer_treat`.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateHealerDialogue, applyHealerChoice } from './healer-clinic-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, рядом с другими Haven NPC, **до** LLM:

```ts
const healerDialogue = generateHealerDialogue(npc, input.save);
if (healerDialogue) return healerDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, **до** существующего `healer_treat` / YAML `nextNode`:

```ts
const healerClinic = applyHealerChoice(npc, save, choiceId);
if (healerClinic) return healerClinic;
```

Порядок важен: `healer_treat` и `healer_shop` вернут `null` и дойдут до текущего кода (treatAtNpc / клиент аптека / YAML).

HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- healer-clinic
```

Покрыто: бедность kit/long, покупка при 3+ бинтах, long > treat + HP/MP + fatigue + флаги `sera_care`, diagnose read-only / список хворей, обёртка treatAtNpc, generate extras при дырявом YAML, apply null для shop/treat/flavor/`*_bye`.

## Риски

- Без WIRING в `dialogue.ts` новые кнопки видны из YAML, но kit/long/diagnose на applyChoice тихо закроют диалог (`_healer_*` без nextNode) без списания адены.
- `healer_treat` по-прежнему только в родителе; обёртка `healerTreat` есть для тестов/будущего, apply её не зовёт.
- Иконка `item_sera_bandage.webp` может отсутствовать: media/catalog не трогали. Хук generate-item-icon мог бы дописать каталог — откатили.
- `applyRestRecovery` требует safeZone; в Гавани ок. Вне города long care всё равно даст HP/MP и бафф, без снятия усталости.
