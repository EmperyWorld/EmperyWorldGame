# Именованные навыки: взрывы, добивания, костёр

## Зачем

После контроля/рывка/наводки остались скиллы, у которых имя — AOE, добивание или «в упор», а сервер всё ещё бил одну цель множителем.

`rangeBias` отдельно от `tactic`, как `control`: `pyre_burst` может быть **cleave + close**.

## Что изменилось

Числа: `packages/shared/src/combat-tactics.ts` (`closeRangeMods`).

| YAML | Навыки | Правило |
|---|---|---|
| `tactic: cleave` | war_cry, cataclysm, worldbreaker, storm_call, black_sun, abyss_flare, pyre_burst | До 4 целей, splash 60%. |
| `tactic: execute` | obliterate, final_whisper | Только при HP ≤35%. Иначе CD/MP не тратятся. |
| `tactic: seek` | void_needle, singularity | Гарантированное попадание (магия может резистнуть). |
| `tactic: snipe` | comet_fall | Как болт баллисты; `attackRange` 210, чтобы сладкая дистанция (≥200) была досягаема. |
| `rangeBias: close` | pyre_burst | <90 px: ×1.18 / +8 точн. (≥160: ×0.82 / −6). |

## Как проверить

1. Воин 10+: `боевой крик` в пачку — несколько цифр, SPLASH.
2. Мистик 38+: `костровой взрыв` в упор — «КОСТЁР», дальше слабее.
3. Разбойник 53+: `стирание` по полному HP — «Цель слишком жива».
4. Мистик 42+: `падение кометы` издалека — «ДАЛЬНИЙ».
