# Сводка: HQ-ореол в порту и жители не в своих кварталах

## Дата
2026-09-15

## Проблема

Синее поле «EmperyWorld HQ» и вывеска сидели **южнее кампуса**, с булыжной дорожкой из порта (y=2912). Ночные стражи с капитанским спрайтом ходили по этой дорожке — выглядело как винтовки HQ у причала.

Параллельно старая сетка: «сквер» и гарнизонные extras стояли на оси форума (tx 40), хотя казарма давно в СЗ (14,11). Бран стоял на (10,25), а лавка — у (8.5, 20.5).

## Правка

| Что | Куда |
|---|---|
| ореол HQ 780×520 | центр кампуса; низ ≤ ty 40 |
| вывеска | двор (4128, 2200), не порт |
| дорожка | ворота → двор, не порт → вывеска |
| снайперы HQ | `sleepTile` = пост; радио не на часовом |
| ночной восток | [74,26], не забор HQ [70,28] |
| гарнизон extras + ночной квадрат | СЗ плац |
| сквер | общинный сад (27,45) |
| Бран | 544,1376 у `prop_butcher` |

`districtFromTile`: Периметр HQ / Гарнизон. Дома ambient: `AMBIENT_HOME_HQ` + гарнизон СЗ.

## Проверка

```bash
pnpm --filter @empery/shared build
pnpm --filter @empery/client test -- src/game/systems/haven-city-placement.test.ts src/game/systems/haven-hq-campus.test.ts
pnpm --filter @empery/server test -- src/services/haven-npc-posts-sync.test.ts src/services/haven-schedule.test.ts
```
