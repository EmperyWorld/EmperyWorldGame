# Драка в порту: экшен, реплики, удар, без ворот между башнями

Репорт `mu55f1kx-4tpv91` (haven, час ~4.5, save `37c994fb-…`, keysray) + устный «слишком быстро / нет экшина / нужны фразы, звук, убрать ворота между башнями».

## Почему

`bindBrawl` крутил синус на 520 мс (смазь). Потом был медленный цикл, но одна петля «Получай!» и без удара по ушам. Между портовыми башнями (tx 59/65, стена S) стояла `prop_harbor_guard_arch` — створки в проёме.

## Что

- Каденс боксёрского раунда: wind-up → lunge → hold 360 мс → recoil → pause. Обмен **3000 мс**, раунд 6000 мс. Кейфреймы с lean/hop, один бьёт — второй отлетает. Масштаб 1.12, клетка `[58, 53]`.
- **20** русских реплик (`HAVEN_HARBOR_BRAWL_BARKS`). Смена только на удар (`havenHarborBrawlHitEdge`), не каждый кадр, без повтора подряд.
- Хит-SFX `harbor_brawl_hit`: процедурный Web Audio (гул + шум), как овация сцены (`stageHearGain` + `unlockUiAudio`). Не петля. Ассетов в репо нет — generate:media не трогали.
- Убрана только `prop_harbor_guard_arch` (override + `empery_haven.mjs` + `generate:maps`). Сухопутные `prop_city_gate` / `_s` / `_e` на месте. Башни порта остались.

## Тесты

`haven-harbor.test.ts`: камень не кран; обмен ≥2000 мс; 16+ фраз; hit-edge; нет портовой арки, 3 городских ворот. Census + city-gates зелёные (19).

## Preview

`:5180` после `pnpm --filter @empery/client build` — `index-BBUSiyH0.js` / `create-game-DxqPl7-4.js`.

## Кадры

- `svodka/harbor-brawl-sfx-day-14-2026-09-17.png` — «Грр!»
- `svodka/harbor-brawl-sfx-day-14b-2026-09-17.png` — «Ха!»
- `svodka/harbor-brawl-sfx-night-21-2026-09-17.png` / `21b` — ночь, «Ах ты крыса!»
- `svodka/harbor-port-no-gate-2026-09-17.png` — проём у стены

## Вердикт

Zebra 3744/3424, час 14 и 21, zoom 2. `__EMPERY_HARBOR__`: `brawlHitCount` 1→3, `hitSfx=harbor_brawl_hit`, реплики меняются. Не 2 Гц-смазь. Арки в props нет. Headless CDP не рисует WebGL-текстуры — силуэты упрощены; в живом Chromium спрайты combat-atlas.

## Риски

- Headless не равен GPU-кадру пользователя.
- `generate:maps` переписал `empery_haven.yaml` (шкиперы + сдвиг части landmarks) из layout-скрипта.
- SFX молчит, если `uiAudioMuted` или AudioContext не unlocked.
- Performance-профиль (`havenDecorFx: false`) замораживает твин на первом кадре.
- MCP cursor-ide-browser в этом агенте не держал вкладки — проверка через CDP Chrome.
