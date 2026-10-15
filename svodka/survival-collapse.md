# Сводка: обморок от голода / жажды / усталости

## Дата
2026-09-15

## Проблема

`applySurvivalCollapse` ставил HP=0 («Потерял сознание… потребуется лечение»), но:

1. Травму `exhaustion_injury` коллапс не вешал — только `criticalInjury` на тике, и тест это закреплял.
2. `reviveHalfHp` поднимал сытость/гидратацию до 30, но **не резал усталость**. При fatigue ≥ 92 следующий live-тик снова ставил `fatigued: critical` и валил сразу после респауна.

## Почему так чинить

Обморок — тот же recoverable death (экран, −25% XP в Гавани), не permadeath. После подъёма игрок должен успеть поесть / к Сере, а не упасть на следующем тике. Травма должна совпадать с текстом «потребуется лечение».

## Изменения

| Место | Что |
|---|---|
| `survival.ts` | коллапс вешает травму по той же карте, что criticalInjury; `stabilizeSurvivalAfterRevive` (сытость/вода ≥30, усталость ≤55) |
| `respawn.ts` | revive сначала стабилизирует survival, потом stats |
| `death-ui.ts` | экран «Обморок» vs «Поражение» |
| тесты | collapse + injury; respawn не оставляет critical fatigue |

Константы: `REVIVE_SATIETY_FLOOR=30`, `REVIVE_HYDRATION_FLOOR=30`, `REVIVE_FATIGUE_CAP=55` (ниже deficit 65).

Штраф XP не менялся: обморок идёт через тот же `respawnInTown`.
