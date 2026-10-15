# Сводка: Моряк Гавани — узел и снасти

## Дата
2026-09-15

## Цель
Изолированный сервис `haven_citizen_harbor`: платный узел-оберег с баффом скорости и повторная переноска снастей за адену. Слухи/советы не трогаем — fall through в `citizen-rumors`.

## Почему
Портовый горожанин должен давать короткую механику района (скорость + подработка), не пересекаясь с грузчиком Петром (`port_crate` / `dock-shift`). Плагин `apply(npc, save, choiceId)` совпадает с контрактом `HavenNpcFeaturePlugin`, поэтому wiring в `dialogue.ts` не ломает generic `haven_citizen_*`.

## Файлы
- `content/items/haven-citizen-harbor.yaml` — `harbor_charm` (material), иконка `/media/assets/item_harbor_charm.webp` (хук `generate-item-icon` записал каталог и WebP; пакеты руками не трогал)
- Портреты моряка остаются `dialogue_town_dockhand_*` — отдельный `npc_haven_citizen_harbor` в каталог не добавлялся
- `content/npcs/haven_citizen_harbor.yaml` — `harbor_knot` / `harbor_haul` + прежние слухи
- `apps/server/src/services/citizen-harbor.ts`
- `apps/server/src/services/citizen-harbor-dialogue.ts`
- `apps/server/src/services/citizen-harbor.test.ts`

## Экспорт
```ts
harborKnot(save: PlayerSave): CitizenHarborResult
harborHaul(save: PlayerSave): CitizenHarborResult

generateCitizenHarborDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyCitizenHarborChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null
```

Механика (оба выбора повторные, без квестовых флагов):

| id | цена | эффект |
|---|---|---|
| `harbor_knot` | 6 адены | предмет `harbor_charm` + бафф `harbor_knot` / `speed` 8 / 12 мин / «Узел моряка» |
| `harbor_haul` | 60 выносливости (`>= 60`) | +55 адены, `clampPlayerStamina` |

`generate` берёт приветствие из `formatCitizenGreeting` (`citizen-rumors.js`). `apply` для `citizen_rumors` / `citizen_advice` / `citizen_leave` возвращает `null`.

## WIRING

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateCitizenHarborDialogue, applyCitizenHarborChoice } from './citizen-harbor-dialogue.js';
```

В `generate`, **до** generic `haven_citizen_*` (иначе generic перехватит меню без узла/снастей):

```ts
const harborCitizen = generateCitizenHarborDialogue(npc, input.save);
if (harborCitizen) return harborCitizen;
```

В `applyChoice`, **до** generic `haven_citizen_*` (слухи должны остаться в parent):

```ts
const harborCitizen = applyCitizenHarborChoice(npc, save, choiceId);
if (harborCitizen) return harborCitizen;
```

- `harbor_knot` / `harbor_haul` → сервис + follow-up с оставшимися выборами.
- YAML flavor (`citizen_rumors`, `citizen_advice`, `citizen_leave`) → `null`, дальше generic rumors/advice.

## Риски до wiring
Пока `dialogue.ts` не подключён, generate моряка идёт в generic `haven_citizen_*` (узел/снасти из YAML-choices видны, но `apply` generic не обрабатывает `harbor_*` — механика из диалога не применится).
