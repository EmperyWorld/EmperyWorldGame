# Сводка: геймпад / джойстик

## Дата
2026-09-15

## Цель
Один контур ввода: Standard Gamepad (W3C) накладывается на существующие keyboard consume* / Esc-стек. Клавиатура не ломается. Без Phaser gamepad plugin.

## Раскладка

| Пэд | Действие |
|---|---|
| Левый стик + D-pad | WASD |
| A (south) | Разговор / в диалоге: пропуск текста, затем выбор |
| B (east) | Рывок в мире / Esc в оверлеях и диалоге |
| X (west) | Атака (Space) |
| Y (north) | Инвентарь (I) |
| LB / RB / LT / RT | Скиллы 1–4 |
| Back / Select | Путешествие (T) |
| Start | Esc |
| L3 | Автоатака (F) |
| R3 | Конь (H) |
| Смерть: A | Респавн |
| Смерть: B / Start | В меню |

Скиллы 5–9 — только клавиатура.

## Почему так

`InputManager` уже работает через `KeyboardEvent.code`. Геймпад читается нативно (`navigator.getGamepads`).

**Баг F310 (и любой пад):** стик — уровень осей, кнопки — фронт `justPressed`. Overlay rAF зовёт `poll()` каждый кадр дисплея и **затирал** фронт, если Phaser не успел `consume`. Ходить можно, A/B/X/Y — нет.

Фронт держится до `consume()` или отпускания. Linux xpad без `mapping: "standard"` (F310 XInput `046d:c21d`): Back/Start на 6/7, крестовина — hat оси 6/7.

## Файлы

| Путь | Роль |
|---|---|
| `apps/client/src/game/systems/gamepad-input.ts` | deadzone, snapshot, coalesced poll |
| `apps/client/src/game/systems/gamepad-input.test.ts` | deadzone, edge, coalesce, D-pad axis |
| `apps/client/src/game/systems/InputManager.ts` | стик+D-pad, A/B/X, плечи, L3 |
| `apps/client/src/overlay-controller.ts` | Start/B = Esc, Y сумка, Back travel, R3 конь |
| `apps/client/src/dialogue-controller.ts` | A / D-pad по репликам |
| `apps/client/index.html` | `.pad-focus`, подсказки |
| `apps/client/src/session-lifecycle.ts` | HUD hint |

## Разрешение браузера

Нет. Gamepad API не показывает диалог как камера/микрофон. Chrome/Firefox **прячут** пад до нажатия любой кнопки (анти-fingerprinting). Нужен фокус вкладки, затем кнопка на геймпаде. `gamepadconnected` ≠ permission prompt.

Chrome на Linux часто отдаёт гироскоп DualSense первым слотом — берём `mapping: "standard"`.

`tsc`: `Boolean(p) && p.connected` не сужает `p` (TS18047). Нужно `p != null && p.connected !== false`.

## Проверка

```bash
pnpm --filter @empery/client test
pnpm --filter @empery/client typecheck
```
