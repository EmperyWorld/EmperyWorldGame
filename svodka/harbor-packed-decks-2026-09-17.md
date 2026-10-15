# Haven — packed dock decks (2026-09-17)

## Почему
Деревянные пирсы читались как пустой спортзал. Нужно было заполнить палубу грузом, не трогая свет/ширину.

## Что сделано
- Surgical override: 523 dock-gear rows (crates/barrels/rope/nets/fishboxes/stalls/bollards). Итого 971 props.
- Дорожки ~2 тайла: quay ty 52–53 + арка 60–64; cargo 54–55; fish 69–70 + fisher tiles; mole 84–85.
- Новые WebP уже в atlas: `prop_dock_barrels`, `prop_dock_rope`, `prop_dock_fishboxes`.
- `generate:maps` 120×84. Harbor/census green. Occupancy: city cobbler/colonnade/NPC posts (не harbor) — тесты не ослабляли.
- Preview `index-Bqa8FK6d.js` / `create-game-h6CMi3so.js`. Walk `setPos` 14:00 и 23:00.

## Покрытие тайлов
| зона | packed | доля |
|---|---|---|
| quay | 86/160 | 54% (2 из 4 рядов — lane) |
| cargo | 116/153 | 76% |
| fish | 102/135 | 76% |
| mole | 161/200 | 80% |

Дома южнее стены: 0.

## Кадры
- `/tmp/haven-walk/10-quay-packed-day.png`
- `/tmp/haven-walk/11-quay-packed-night.png`
- `/tmp/haven-walk/12-cargo-packed.png`
- `/tmp/haven-walk/13-fish-packed.png`
- `/tmp/haven-walk/16-mole-packed.png`
- night extras: `12n-cargo-packed-night.png`, `13n-fish-packed-night.png`, `16n-mole-packed-night.png`

## Вердикт
День: палубы заполнены, не plaza. Ночь: груз виден, но wash делает его бледным. Сетка спрайтов слишком регулярная.
