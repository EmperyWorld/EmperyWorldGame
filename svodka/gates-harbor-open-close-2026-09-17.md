# Сводка: ворота open/close + портовая арка + флот

Дата: 2026-09-17

## Цель

1. Городские ворота Haven открываются днём и закрываются ночью (визуал + коллизия).
2. Портовый проём — сторожевая арка с охраной (не городские ворота).
3. Масштабный порт: несколько причалов и корабли разных размеров/ролей.

## Что сделано

### Механика ворот
- `haven-city-gates.ts` — регистрация N/S/E ворот, swap текстуры по `!restActive`, refresh коллайдеров.
- `prop-colliders.ts` — closed = 3 бокса (стойки + створка), open/arch = 2 бокса (щель дороги).
- Портовая `prop_harbor_guard_arch` всегда arch, не участвует в day/night swap.
- Wire в `location-decor.ts` (`registerHavenCityGate` / `bindHavenCityGates`).

### Ассеты (ComfyUI → WebP)
- `prop_city_gate_open`, `prop_city_gate_s_open`, `prop_city_gate_e_open`
- `prop_harbor_guard_arch`
- `prop_ship_brig`, `prop_ship_barge`, `prop_ship_ferry`
- В атласе `world-empery_haven` (фреймы `prop-prop_*`).

### Порт
- Арка @ tx62 + башни 59/65 + `prop_guard_post` ×2 + баннеры.
- Причалы: `prop_pier_long` ×2, `prop_pier` ×2, bollards.
- Флот: brig / galley / cog / barge / ferry / fishing×2 / rowboat×2.
- Ambient: капитан у арки («Арка под охраной.»).

### Verify
- vitest: `prop-colliders` + `haven-city-gates` — 16/16.
- `pnpm generate:maps` → 457 props, stamp `054cf3a003ed`.
- `pnpm --filter @empery/client build` OK; preview `:5180`, API `:3000`, media 200.

## Как проверить в клиенте

1. http://localhost:5180/ → Empery Haven.
2. День: пройти через N/S/E ворота; ночь (`restActive`): створка закрыта.
3. Юг tx≈62: арка + посты/башни, проход открыт всегда.
4. У воды: разнокалиберный флот на нескольких пирсах.
