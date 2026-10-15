# Сводка: волна городских сервисов (5 NPC) + связка

## Дата
2026-09-15

## Что вошло
Пять изолированных сервисов Гавани, затем общая связка `DialogueService` + HUD.

| NPC | Механика |
|---|---|
| Фаддей | помол / выпечка / заказ на 3 муки |
| Борис | уход за скакуном (стамина + «Свежие копыта») |
| Хольм | дегустация (`critRate`) и тост (`mDef` + стаут) |
| Ирина | грамота, поиск описи, «Ясность архива» |
| Петр | repeatable смена с ящиками |

## Связка
- `apps/server/src/services/dialogue.ts` — generate/apply плагинов после schedule-gate
- `apps/client/src/quest-hud.ts` — мука Фаддея, опись Ирины, ящики Петра
- `apps/server/src/services/haven-city-plugins-dialogue.test.ts` — интеграция через DialogueService

## Приёмка
- `finishDockShift` снимает все `port_crate`, не оставляя unsellable хвост
- Flavor-нода писца `found` больше не выдаёт опись бесплатно (YAML quoted)
- Иконки в каталоге/manifest есть, WebP ещё не гоняли через ComfyUI
