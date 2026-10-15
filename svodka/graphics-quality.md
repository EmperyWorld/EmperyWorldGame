# Сводка: шкала графики / FPS

## Дата
2026-09-15

## Проблема

На слабом GPU кадр упирался в fillrate canvas 1:1 + Haven (147 ambient, ADD-фонари, тени) и лишние тики (расписание дважды, overlay @60, gamepad rAF без пада). Arcade 60 fps оставляли — это защита dash, не GPU.

## Что сделано

| Место | Зачем |
|---|---|
| `graphics-quality.ts` | `high` / `balanced` (дефолт) / `performance` в `localStorage['empery-graphics']` |
| Phaser FIT + `setGameSize` × scale, zoom = scale | меньше пикселей, тот же FOV, клики через Scale Manager |
| `fps.limit` 0/0/30, arcade **60** | кадры режем, физика dash нет |
| stride толпы 1/2/3 + night-patrol всегда | меньше спрайтов без ломания named NPC |
| свет/звёзды/particles/тени/куры | выключаются на performance |
| один `havenSchedule` в registry | citizens не пересчитывают clock |
| overlay ~8 Гц, gamepad rAF только с падом | меньше JS вне кадра |
| `?perf=1` | FPS / tex / displayList |
| панель состояния «Графика: …» | цикл качества; толпа — после смены карты |

## Волна 3 — «плывёт / slow-mo»

Средний профиль рендерил canvas ×0.8, зумил камеру и растягивал `pixelated` — картинка мылила. `decorTweenScale: 2` тормозил весь городской FX. `minFps: 24` при реальных 12–20 fps зажимал `delta`, мир шёл slow-mo, а часы (`Date.now`) тикали нормально.

| Правка | Зачем |
|---|---|
| balanced: scale 1, tween ×1 | нативный буфер, FX в реальном времени |
| `minFps: 8` | кадры могут падать, скорость мира нет |
| `pixelated` только high/balanced | performance не nearest-neighbor на дробном scale |

## Волна 2 — Haven FX

| Место | Зачем |
|---|---|
| `loopDecorCounter` | 45+ `Graphics.clear` циклов: performance — один кадр, balanced — ×2 duration |
| `havenVignettes` | двор/коты/дети не спавнятся на performance |
| `havenDistrictHalos` | лишние ореолы и булыжник — только high |
| NPC soft-sep каждые 4 кадра | меньше O(n²) у named NPC |
| dialogue pad rAF | только если пад уже есть |
