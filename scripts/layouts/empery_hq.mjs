/**
 * EmperyWorld HQ interior — чёткая ось юг→север.
 *
 *   N  [LAB] —— [MAIN HQ] —— [SERVERS]
 *              [HOLO / lobby]
 *              [LANDING PAD]
 *         [КПП]  GATE  [КПП]     ← выход в Гавань (юг)
 *
 * Grid 40×32 @ 64px — компактнее и читаемее.
 */
export const HQ_TW = 64;
export const HQ_W = 40;
export const HQ_H = 32;

const c = (tx, ty) => [tx * HQ_TW + HQ_TW / 2, ty * HQ_TW + HQ_TW / 2];

export function buildEmperyHqTiles(rect, border, base) {
  const d = base(1);
  border(d, 4);

  // Периметр
  rect(d, 2, 2, HQ_W - 4, 1, 4);
  rect(d, 2, HQ_H - 3, HQ_W - 4, 1, 4);
  rect(d, 2, 2, 1, HQ_H - 4, 4);
  rect(d, HQ_W - 3, 2, 1, HQ_H - 4, 4);

  // Южные ворота (выход)
  rect(d, 18, HQ_H - 3, 4, 2, 2);

  // Осевая дорога С–Ю + поперечная
  rect(d, 4, 4, HQ_W - 8, HQ_H - 8, 1);
  rect(d, 18, 4, 4, HQ_H - 6, 2); // главная ось
  rect(d, 6, 14, HQ_W - 12, 3, 2); // поперечный двор
  rect(d, 8, 21, 25, 2, 2); // courtyard promenade
  // Северные крылья
  rect(d, 6, 6, 10, 7, 2); // labs
  rect(d, 24, 6, 10, 7, 2); // servers
  // Южный двор / pad
  rect(d, 12, 18, 16, 8, 2);

  return d;
}

function fenceRing(props) {
  for (let tx = 3; tx <= HQ_W - 4; tx += 2) {
    if (tx >= 18 && tx <= 21) continue; // gate gap south
    props.push(['prop_hq_fence', ...c(tx, 2), 78]);
    props.push(['prop_hq_fence', ...c(tx, HQ_H - 3), 78]);
  }
  for (let ty = 4; ty <= HQ_H - 5; ty += 2) {
    props.push(['prop_hq_fence', ...c(2, ty), 78]);
    props.push(['prop_hq_fence', ...c(HQ_W - 3, ty), 78]);
  }
  props.push(['prop_hq_fence_corner', ...c(2, 2), 88]);
  props.push(['prop_hq_fence_corner', ...c(HQ_W - 3, 2), 88]);
  props.push(['prop_hq_fence_corner', ...c(2, HQ_H - 3), 88]);
  props.push(['prop_hq_fence_corner', ...c(HQ_W - 3, HQ_H - 3), 88]);
}

export const EMPERY_HQ = {
  id: 'empery_hq',
  name: 'EmperyWorld HQ',
  subtitle: 'Кампус корпорации · главный корпус и лаборатории',
  spawn: c(20, 26),
  npcs: [
    {
      id: 'town_hq_researcher',
      x: c(10, 11)[0],
      y: c(10, 11)[1],
      label: 'Д-р Вейн [E]',
    },
    {
      id: 'town_hq_terminal',
      x: c(30, 11)[0],
      y: c(30, 11)[1],
      label: 'Терминал [E]',
    },
  ],
  zones: [
    {x: 1312, y: 688, label: 'Главный корпус · Приёмная', color: '#d8c69c', travelTo: 'empery_hq_lobby', radius: 96, arrival: {x:1312,y:800}},
    {
      x: c(20, 28)[0],
      y: c(20, 28)[1],
      label: '↓ Выход · Гавань',
      color: '#c9a66b',
      travelTo: 'empery_haven',
      radius: 110,
    },
    {
      x: c(10, 9)[0],
      y: c(10, 9)[1],
      label: 'Лаборатории',
      color: '#88dde8',
    },
    {
      x: c(30, 9)[0],
      y: c(30, 9)[1],
      label: 'Серверы',
      color: '#66aacc',
    },

  ],
  props: (() => {
    /** @type {Array<[string, number, number, number]>} */
    const props = [
      // —— Северный ряд: LAB | MAIN | SERVER ——
      ['prop_hq_lab', ...c(10, 8), 170],
      ['prop_hq_building', ...c(20, 8), 280],
      ['prop_hq_lab', ...c(30, 8), 160], // east wing look
      // Антенны только у серверного крыла (восток)
      ['prop_hq_antenna', ...c(33, 6), 120],
      ['prop_hq_antenna', ...c(28, 6), 100],
      // Серверные стойки — аккуратный ряд на востоке
      ['prop_hq_server_rack', ...c(28, 11), 90],
      ['prop_hq_server_rack', ...c(31, 11), 90],
      ['prop_hq_server_rack', ...c(34, 11), 90],
      // Южный двор остаётся проходом от КПП к главному корпусу.
      ['prop_hq_barrier', ...c(16, 24), 65],
      ['prop_hq_barrier', ...c(24, 24), 65],
      ['prop_hq_checkpoint', ...c(17, 27), 95],
      ['prop_hq_checkpoint', ...c(23, 27), 95],
      ['prop_hq_gate_open', ...c(20, 28), 190],
      // —— Угловые вышки ——
      ['prop_hq_sniper_tower', ...c(3, 3), 150],
      ['prop_hq_sniper_tower', ...c(36, 3), 150],
      ['prop_hq_sniper_tower', ...c(3, 28), 150],
      ['prop_hq_sniper_tower', ...c(36, 28), 150],
      // —— Прожекторы у вышек ——
      ['prop_hq_floodlight', ...c(5, 5), 64],
      ['prop_hq_floodlight', ...c(34, 5), 64],
      ['prop_hq_floodlight', ...c(5, 26), 64],
      ['prop_hq_floodlight', ...c(34, 26), 64],
    ];
    fenceRing(props);
    return props;
  })(),
};
