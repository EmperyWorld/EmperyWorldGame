# Сводка: Большой сундук — дорожный набор

## Дата
2026-09-15

## Цель
Изолированный сервис `apartment_chest`: жилец собирает `apt_travel_kit` за 15 адены. Хранилище материалов (`open_storage`) остаётся на клиенте. Повторно, не раз в сутки.

## Файлы

| Путь | Роль |
|---|---|
| `content/npcs/apartment_chest.yaml` | Добавлен `apt_kit`; `open_storage` без смены id |
| `content/items/haven-apt-chest.yaml` | `apt_travel_kit` (material, weight 0.4) |
| `apps/server/src/services/apartment-chest.ts` | `assembleAptKit` |
| `apps/server/src/services/apartment-chest-dialogue.ts` | `generateApartmentChestDialogue` / `applyApartmentChestChoice` |
| `apps/server/src/services/apartment-chest.test.ts` | Сервис + диалог |

Не трогались: `dialogue.ts`, HUD, `dialogue-controller.ts`, `housing.ts`, `packages/*`, catalog, прочие apartment YAML.

## Сигнатуры

```ts
assembleAptKit(save: PlayerSave, now?: number): ApartmentChestResult

generateApartmentChestDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyApartmentChestChoice(npc: HavenNpcLike, save: PlayerSave, choiceId: string): HavenNpcChoiceResult | null

export const apartmentChestPlugin: HavenNpcFeaturePlugin
```

Константы: `APT_KIT_COST=15`, предмет `apt_travel_kit`, иконка `/media/assets/item_apt_travel_kit.webp`. Отказ без жилья: `Сначала ключ от квартиры`.

HUD не требуется.

## Правила механики

- Нет `save.housing` → fail, сейв без изменений.
- Мало адены → fail с суммой, сейв без изменений.
- Успех: −15 адены, `appendItemsToSave` → `apt_travel_kit`. Повторно (не daily).
- Generate меню всегда `open_storage` + `apt_kit`.
- Apply **обязан** вернуть `null` для `open_storage` — клиентский intercept материалов жильца остаётся рабочим.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе. Клиент сейчас **AUTO-OPENS** хранилище материалов при proximity-talk с сундуком. Parent должен **убрать auto-open** и открывать storage только по `open_storage`.

### `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import {
  applyApartmentChestChoice,
  generateApartmentChestDialogue,
} from './apartment-chest-dialogue.js';
```

`DialogueService.generate` — после schedule-gate, до LLM:

```ts
const chestDialogue = generateApartmentChestDialogue(npc, input.save);
if (chestDialogue) return chestDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate, до YAML `nextNode` fallback:

```ts
const chest = applyApartmentChestChoice(npc, save, choiceId);
if (chest) return chest;
```

Поведение apply:

- чужой npc → `null`
- `apt_kit` → `{ save, townMessage, followUp }`
- `open_storage` → `null` (клиент `openHousingStorage('materials')`)

### `apps/client/src/dialogue-controller.ts`

Снять auto-open на talk (proximity):

```ts
if (channel === 'proximity' && npcId === 'apartment_chest') {
  this.close();
  await this.host.openHousingStorage('materials');
  ...
}
```

Оставить intercept выбора:

```ts
if (npcId === 'apartment_chest' && choiceId === 'open_storage') {
  this.close();
  await this.host.openHousingStorage('materials');
  ...
}
```

Quest HUD не нужен.

## Тесты

```bash
pnpm --filter @empery/server test -- apartment-chest
```

Покрыто: нет жилья, бедность, успех предмета, повтор, apply `null` для `open_storage`, `getItem('apt_travel_kit')`.

Интеграция через `DialogueService` **не** гоняется, пока нет WIRING.

## Риски до wiring

Пока `dialogue.ts` не подключён и proximity auto-open жив, меню `open_storage` + `apt_kit` не увидят: разговор сразу открывает материалы. После снятия auto-open generate без wiring уйдёт в LLM/YAML; `apt_kit` без apply не спишет адену и не выдаст предмет. `open_storage` на клиенте уже перехватывается — apply плагина возвращает `null` для этого id.
