/**
 * Grand thematic landmarks north of each Haven town NPC (tenement-class scale).
 * Positions follow district redesign in scripts/layouts/empery_haven.mjs.
 * Smoke/plaza drive zoning in location-decor; NPC names come from [E] labels only.
 */
export type HavenNpcBuilding = {
  prop: string;
  x: number;
  y: number;
  size: number;
  /** Soft chimney smoke (forge, brewery, butcher, etc.) */
  smoke?: boolean;
  /** Wider cobble apron at the door */
  plaza?: boolean;
};

/** Approximate visual footprint for overlap tests (matches placeWorldProp silhouette). */
export function havenLandmarkFootprint(
  x: number,
  y: number,
  size: number,
): { L: number; R: number; T: number; B: number } {
  const w = size * 0.72;
  const h = size * 0.62;
  const cy = y - size * 0.08;
  return { L: x - w / 2, R: x + w / 2, T: cy - h / 2, B: cy + h / 2 };
}

function footprintsOverlap(
  a: { L: number; R: number; T: number; B: number },
  b: { L: number; R: number; T: number; B: number },
  pad = 12,
): boolean {
  return a.R > b.L + pad && a.L < b.R - pad && a.B > b.T + pad && a.T < b.B - pad;
}

export const HAVEN_NPC_BUILDINGS: readonly HavenNpcBuilding[] = [
  // ——— Рынок (запад) ———
  { prop: 'prop_trade_hall', x: 800, y: 1312, size: 300, plaza: true },
  { prop: 'prop_butcher', x: 480, y: 1312, size: 260, smoke: true, plaza: true },
  { prop: 'prop_radio_booth', x: 1184, y: 1568, size: 240, plaza: true },

  // ——— Ремёсла ———
  { prop: 'prop_blacksmith', x: 800, y: 2080, size: 300, smoke: true, plaza: true },
  { prop: 'prop_windmill', x: 1440, y: 2208, size: 300, plaza: true },
  { prop: 'prop_stable', x: 1952, y: 2464, size: 300, plaza: true },

  // ——— Сервисный двор (восток) ———
  { prop: 'prop_inn', x: 3744, y: 1184, size: 340, smoke: true, plaza: true },
  { prop: 'prop_bathhouse', x: 3488, y: 1440, size: 280, smoke: true, plaza: true },
  { prop: 'prop_brewery', x: 4128, y: 1440, size: 280, smoke: true, plaza: true },
  { prop: 'prop_healer_hall', x: 3104, y: 928, size: 280, plaza: true },

  // ——— Муниципальный / храмовый ———
  { prop: 'prop_cathedral', x: 3488, y: 608, size: 360, plaza: true },
  { prop: 'prop_library', x: 3872, y: 416, size: 260, plaza: true },
  { prop: 'prop_schoolhouse', x: 2848, y: 2336, size: 300, plaza: true },

  // ——— Гарнизон ———
  { prop: 'prop_barracks', x: 928, y: 544, size: 320, plaza: true },

  // ——— Порт ———
  { prop: 'prop_fishmonger', x: 4256, y: 2784, size: 260, plaza: true },
  { prop: 'prop_warehouse', x: 3744, y: 2720, size: 300, plaza: true },
];

/** Soft district zones: tinted ground + entry sign + connector road. */
export type HavenDistrict = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  alpha: number;
  label: string;
  bannerColor: string;
  signX: number;
  signY: number;
  path?: ReadonlyArray<readonly [number, number, number, number]>;
};

export const HAVEN_DISTRICTS: readonly HavenDistrict[] = [
  {
    x: 900,
    y: 640,
    w: 720,
    h: 480,
    color: 0x8890a0,
    alpha: 0.12,
    label: 'Гарнизон',
    bannerColor: '#a09890',
    signX: 1200,
    signY: 900,
    path: [
      [1600, 1200, 1200, 900],
      [1200, 900, 928, 640],
    ],
  },
  {
    x: 2560,
    y: 1180,
    w: 900,
    h: 520,
    color: 0xd4c090,
    alpha: 0.12,
    label: 'Форум',
    bannerColor: '#e8d8a8',
    signX: 2200,
    signY: 1300,
    path: [
      [2000, 1440, 2200, 1300],
      [2200, 1300, 2560, 1180],
    ],
  },
  {
    x: 2680,
    y: 1960,
    w: 720,
    h: 520,
    color: 0xc890a0,
    alpha: 0.14,
    label: 'Городской театр',
    bannerColor: '#e8c0d0',
    signX: 2400,
    signY: 1760,
    path: [
      [2560, 1440, 2400, 1760],
      [2400, 1760, 2680, 1920],
    ],
  },
  {
    x: 900,
    y: 1400,
    w: 820,
    h: 480,
    color: 0xd4a050,
    alpha: 0.14,
    label: 'Рыночный ряд',
    bannerColor: '#e8c878',
    signX: 1400,
    signY: 1400,
    path: [
      [1800, 1440, 1400, 1400],
      [1400, 1400, 800, 1312],
    ],
  },
  {
    x: 1100,
    y: 2750,
    w: 980,
    h: 620,
    color: 0xb89878,
    alpha: 0.13,
    label: 'Спальный квартал',
    bannerColor: '#d4b898',
    signX: 1500,
    signY: 2480,
    path: [
      [1800, 2200, 1500, 2480],
      [1500, 2480, 1056, 2720],
      [1056, 2720, 800, 2752],
      [1056, 2720, 1312, 2752],
      [800, 2752, 544, 3008],
      [1312, 2752, 1600, 3008],
      [1056, 2720, 1056, 2912],
    ],
  },
  {
    x: 3600,
    y: 700,
    w: 820,
    h: 480,
    color: 0x6a88bb,
    alpha: 0.12,
    label: 'Муниципальный холм',
    bannerColor: '#a8c0e0',
    signX: 3100,
    signY: 1000,
    path: [
      [2800, 1200, 3100, 1000],
      [3100, 1000, 3488, 700],
    ],
  },
  {
    x: 3800,
    y: 1320,
    w: 860,
    h: 460,
    color: 0xc89050,
    alpha: 0.12,
    label: 'Сервисный двор',
    bannerColor: '#e0b878',
    signX: 3200,
    signY: 1360,
    path: [
      [2900, 1400, 3200, 1360],
      [3200, 1360, 3744, 1184],
    ],
  },
  {
    x: 1200,
    y: 2140,
    w: 700,
    h: 460,
    color: 0xcc5520,
    alpha: 0.12,
    label: 'Квартал ремёсел',
    bannerColor: '#e07840',
    signX: 1500,
    signY: 1900,
    path: [
      [1800, 1700, 1500, 1900],
      [1500, 1900, 800, 2080],
    ],
  },
  {
    x: 4000,
    y: 2920,
    w: 780,
    h: 420,
    color: 0x4a6078,
    alpha: 0.16,
    label: 'Портовые склады',
    bannerColor: '#78a8c8',
    signX: 3520,
    signY: 2680,
    path: [
      [3200, 2400, 3520, 2680],
      [3520, 2680, 3744, 2848],
    ],
  },
  {
    // Кампус 58–70 × 31–39 (центр 64,35 = 4128,2272). Не тянуть эллипс в порт (ty≥45).
    x: 4128,
    y: 2272,
    w: 780,
    h: 520,
    color: 0x1a4058,
    alpha: 0.22,
    label: 'EmperyWorld HQ',
    bannerColor: '#4ec5e8',
    signX: 4128,
    signY: 2200,
    path: [[4128, 2528, 4128, 2336]],
  },
];

/**
 * Skip city-decor props that would stack on an NPC landmark footprint.
 * Same-id nearby replacements + any mid/large prop whose box intersects.
 */
export function havenCityPropReplacedByNpcLandmark(
  propId: string,
  x: number,
  y: number,
  size = 120,
): boolean {
  const tenement = havenLandmarkFootprint(1056, 2720, 400);
  const propBox = havenLandmarkFootprint(x, y, size);

  if (size >= 64 && footprintsOverlap(propBox, tenement, 6)) {
    if (propId !== 'prop_tenement_block') {
      if (!/street_lamp|banner_pole|chimney_smoke|string_lights|signpost/.test(propId)) return true;
    }
  }

  for (const b of HAVEN_NPC_BUILDINGS) {
    const land = havenLandmarkFootprint(b.x, b.y, b.size);
    if (size >= 64 && footprintsOverlap(propBox, land, 6)) {
      if (!/street_lamp|banner_pole|chimney_smoke|string_lights|signpost/.test(propId)) return true;
    }

    const sameFamily =
      propId === b.prop ||
      (propId === 'prop_shop_front' && b.prop === 'prop_trade_hall') ||
      (propId === 'prop_trade_hall' && b.prop === 'prop_shop_front');
    if (!sameFamily) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    if (dx * dx + dy * dy < 320 * 320) return true;
  }
  return false;
}
