# Harbor cobble floor + clear pier junk (2026-09-17)

Не коммит. Флот / шкиперы / расписание / посадка не трогались.

## Исследование
Средневековая набережная — не деревянный спортзал и не склад ящиков на каждом тайле.

- Фасад причала: деревянные реветы, потом каменная стенка (Дублин Wood Quay, XIII в.). Ходовая поверхность — гравий, булыжник, брусчатка; доски — скорее сходни/boardwalk, не вся палуба.
- Груз сразу уносят носильщики в клети/склады **за** кромкой (porterage, quayage). На кромке — кнехты/кольца, канаты, иногда **один** стационарный кран (Utrecht 1244 → Dublin crane-house 1406; типичная нагрузка 2–3 т). В Средиземноморье краны часто не ставили.
- Мол — камень/засыпка, маяк у входа. Рыбный прилавок у своего берта — уместен; решётка ящиков — нет.

Источники: [Dublin Wood Quay](https://portspastpresent.cawcs.wales/items/show/704), [Grimsby 1986–7 cobble track](https://www.nelincs.gov.uk/assets/uploads/2016/02/Excavations-in-Grimsby-1986-7.pdf), [Sett (paving)](https://en.wikipedia.org/wiki/Sett_(paving)), [Treadwheel crane](https://en.wikipedia.org/wiki/Treadwheel_crane), [Florilegium porterage](http://users.trytel.com/tristan/towns/florilegium/economy/eccom19.html).

## Пол сейчас
Не GID. В тайлах причал по-прежнему plaza (walkable). Жёлтые доски были **оверлеем** `paintHavenDockSurfaces` (procedural planks, depth 2).

Теперь тот же оверлей штампует WebP `tile_haven_dock_a|b|c` (64×64 брусчатка). `dock_a` уже был камнем (промпт врал «wood»). Сгенерены `dock_b`, `dock_c`. Ночной wash — холодный камень, не охра.

## Пропы
Снято с камня: 112 crates, 70 barrels, 34 nets, 21 fishboxes, 15 лишних stall, 65/68 rope.

Оставлено: 31 кнехт по кромке, 1 кран (cargo 55,56), 1 маяк (mole 85,67), 1 рыбный прилавок (66,55), 3 каната на кромке, 7 корпусов.

Override 793 → 476. `generate:maps` 120×84. Harbor/census green. Occupancy не ослабляли.

## Кадры
- `svodka/harbor-cobble-quay-2026-09-17.png`
- `svodka/harbor-cobble-cargo-2026-09-17.png`
- `svodka/harbor-cobble-fish-2026-09-17.png`
- `svodka/harbor-cobble-mole-2026-09-17.png`

## Осталось
Пальцы пустые — так и задумано после сноса решётки. Три сетт-тайла всё ещё wallpaper. Кран на северном конце cargo, в среднем кадре его нет.
