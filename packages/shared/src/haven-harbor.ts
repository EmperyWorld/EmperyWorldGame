/**
 * Haven harbor geometry — keep in sync with scripts/layouts/empery_haven.mjs
 * `buildHavenTiles` water/quay/pier rects.
 */
import { HAVEN_MAP_TILES_H, HAVEN_MAP_TILES_W, havenWorldFromTile } from './haven-coords.js';
import { HAVEN_TILE_SIZE, type HavenTile } from './haven-npc-homes.js';
export const HAVEN_SHIP_DISPLAY_SCALE = 1.55;

export type HavenTileRect = { readonly tx: number; readonly ty: number; readonly w: number; readonly h: number };

/** South seaward wall (layout WALL_S_TY). */
export const HAVEN_WALL_S_TY = 50;
/** Harbor guard arch on the seaward wall (not a city gate). */
export const HAVEN_HARBOR_ARCH_TX = 62;
export const HAVEN_HARBOR_ARCH_TY = HAVEN_WALL_S_TY;
export const HAVEN_HARBOR_ARCH_TX0 = 60;
export const HAVEN_HARBOR_ARCH_TX1 = 64;

/** Main basin south of the wall (tx 44–119, ty 51–83). West pocket for cargo hulls. */
export const HAVEN_WATER_BASIN: HavenTileRect = { tx: 44, ty: 51, w: 76, h: 33 };
/** East bay outside the east wall. */
export const HAVEN_WATER_EAST_BAY: HavenTileRect = { tx: 78, ty: 40, w: 42, h: 11 };

/** Walkable cobble quay south of the wall, then water or a pier. */
export const HAVEN_QUAY: HavenTileRect = { tx: 50, ty: 51, w: 40, h: 4 };
/** Cargo pier (warehouse / crane / barge). */
export const HAVEN_PIER_CARGO: HavenTileRect = { tx: 51, ty: 55, w: 9, h: 17 };
/** Fishing pier (stalls, nets, fishermen). */
export const HAVEN_PIER_FISH: HavenTileRect = { tx: 66, ty: 55, w: 9, h: 15 };
/** Lighthouse breakwater — wide working mole. */
export const HAVEN_PIER_MOLE: HavenTileRect = { tx: 80, ty: 51, w: 10, h: 20 };

/** Sailor brawl on the quay walk — not under `prop_harbor_crane` (55,56). Cadence in haven-harbor-brawl.ts. */
export const HAVEN_HARBOR_BRAWL_TILE = [58, 53] as const;

export const HAVEN_HARBOR_STONE: readonly HavenTileRect[] = [
  HAVEN_QUAY,
  HAVEN_PIER_CARGO,
  HAVEN_PIER_FISH,
  HAVEN_PIER_MOLE,
];

/**
 * Compass headings for fleet art. Screen space: +x east, +y south.
 * Asset suffix: `prop_ship_brig_e`, `_se`, `_s`, `_sw`, `_w`, `_nw`, `_n`, `_ne`.
 * Unsuffixed `prop_ship_brig` is the placement / fallback id (south view).
 */
export const HAVEN_SHIP_HEADINGS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;
export type HavenShipHeading = (typeof HAVEN_SHIP_HEADINGS)[number];

/** Sailing hulls only — no oar craft. Chandler is a land shop, not a hull. */
export const HAVEN_SHIP_HULL_IDS = [
  'prop_ship_brig',
  'prop_ship_cog',
  'prop_ship_ferry',
  'prop_ship_barge',
  'prop_ship_fishing',
  'prop_ship_caravel',
  'prop_ship_skiff',
] as const;
export type HavenShipHullId = (typeof HAVEN_SHIP_HULL_IDS)[number];

const HAVEN_SHIP_HULL_SET = new Set<string>(HAVEN_SHIP_HULL_IDS);
const HAVEN_SHIP_HEADING_SET = new Set<string>(HAVEN_SHIP_HEADINGS);

export const HAVEN_SHIP_DOCK_HOURS_MIN = 1;
export const HAVEN_SHIP_DOCK_HOURS_MAX = 24;
export const HAVEN_SHIP_AWAY_HOURS_MIN = 24;
export const HAVEN_SHIP_AWAY_HOURS_MAX = 48;
/** Visual leave/return window, taken from the end of dock / away. */
export const HAVEN_SHIP_TRANSIT_HOURS = 0.35;

export type HavenShipVoyageState = 'in_port' | 'departing' | 'at_sea' | 'returning';

export type HavenShipDef = {
  readonly hullId: HavenShipHullId;
  readonly berth: HavenTile;
  readonly heading: HavenShipHeading;
  readonly skipperId: string;
  readonly skipperTile: HavenTile;
  /** First tile is the berth; last tile is the seaward exit. Return is reverse. */
  readonly outbound: readonly HavenTile[];
};

/**
 * One hull of each sailing type. Each ship owns a unique berth and outbound
 * water route. Skiff stays as the small harbor sailboat (not an oar craft).
 */
export const HAVEN_SHIP_FLEET: readonly HavenShipDef[] = [
  {
    hullId: 'prop_ship_barge',
    berth: [47, 58],
    heading: 's',
    skipperId: 'harbor_skipper_barge',
    skipperTile: [51, 58],
    outbound: [
      [47, 58],
      [47, 76],
      [64, 80],
      [90, 76],
    ],
  },
  {
    hullId: 'prop_ship_cog',
    berth: [47, 66],
    heading: 's',
    skipperId: 'harbor_skipper_cog',
    skipperTile: [51, 66],
    outbound: [
      [47, 66],
      [47, 78],
      [72, 81],
      [102, 76],
    ],
  },
  {
    hullId: 'prop_ship_fishing',
    berth: [61, 59],
    heading: 's',
    skipperId: 'harbor_skipper_fishing',
    skipperTile: [66, 59],
    outbound: [
      [61, 59],
      [61, 76],
      [76, 81],
      [88, 81],
    ],
  },
  {
    hullId: 'prop_ship_caravel',
    berth: [62, 62],
    heading: 's',
    skipperId: 'harbor_skipper_caravel',
    skipperTile: [66, 62],
    outbound: [
      [62, 62],
      [62, 76],
      [76, 81],
      [110, 76],
    ],
  },
  {
    hullId: 'prop_ship_ferry',
    berth: [62, 70],
    heading: 's',
    skipperId: 'harbor_skipper_ferry',
    skipperTile: [66, 69],
    outbound: [
      [62, 70],
      [76, 78],
      [98, 81],
      [112, 74],
    ],
  },
  {
    hullId: 'prop_ship_skiff',
    berth: [76, 58],
    heading: 's',
    skipperId: 'harbor_skipper_skiff',
    skipperTile: [74, 58],
    outbound: [
      [76, 58],
      [76, 74],
      [90, 80],
      [104, 80],
    ],
  },
  {
    hullId: 'prop_ship_brig',
    berth: [96, 74],
    heading: 'w',
    skipperId: 'harbor_skipper_brig',
    skipperTile: [89, 69],
    outbound: [
      [96, 74],
      [110, 78],
      [114, 76],
      [114, 82],
    ],
  },
];

const FLEET_BY_HULL = new Map(HAVEN_SHIP_FLEET.map((ship) => [ship.hullId, ship]));
const FLEET_BY_SKIPPER = new Map(HAVEN_SHIP_FLEET.map((ship) => [ship.skipperId, ship]));

/** Berthed hulls — tile centers on open water beside a pier. */
export const HAVEN_SHIP_BERTH_TILES = Object.fromEntries(
  HAVEN_SHIP_FLEET.map((ship) => [ship.hullId.replace('prop_ship_', ''), ship.berth]),
) as Readonly<Record<string, HavenTile>>;

/** Bow toward the basin / along the berth (piers run N–S). */
export const HAVEN_SHIP_BERTH_HEADING = Object.fromEntries(
  HAVEN_SHIP_FLEET.map((ship) => [ship.hullId.replace('prop_ship_', ''), ship.heading]),
) as Readonly<Record<string, HavenShipHeading>>;

/** Authored outbound water route (first tile = berth, last = sea). */
export const HAVEN_SHIP_OUTBOUND_TILES: Readonly<Record<string, readonly HavenTile[]>> =
  Object.fromEntries(HAVEN_SHIP_FLEET.map((ship) => [ship.hullId, ship.outbound]));

/** @deprecated use HAVEN_SHIP_OUTBOUND_TILES — kept for existing patrol tests. */
export const HAVEN_HARBOR_PATROL_TILES = HAVEN_SHIP_OUTBOUND_TILES;

export function havenShipDef(hullId: string): HavenShipDef | undefined {
  return FLEET_BY_HULL.get(hullId as HavenShipHullId);
}

export function isHavenShipSkipperNpc(npcId: string): boolean {
  return FLEET_BY_SKIPPER.has(npcId);
}

export function havenShipForSkipper(npcId: string): HavenShipDef | undefined {
  return FLEET_BY_SKIPPER.get(npcId);
}

export function havenSkipperIds(): readonly string[] {
  return HAVEN_SHIP_FLEET.map((ship) => ship.skipperId);
}

function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type HavenShipTimetable = {
  readonly dockHours: number;
  readonly awayHours: number;
  readonly offsetHours: number;
  readonly periodHours: number;
};

/** Deterministic per-hull timers from the ship id — reloads stay consistent. */
export function havenShipTimetable(hullId: string): HavenShipTimetable {
  const h = hash32(hullId);
  const dockHours = HAVEN_SHIP_DOCK_HOURS_MIN + (h % 24);
  const awayHours = HAVEN_SHIP_AWAY_HOURS_MIN + ((h >>> 8) % 25);
  const offsetHours = (h >>> 16) % 97;
  return {
    dockHours,
    awayHours,
    offsetHours,
    periodHours: dockHours + awayHours,
  };
}

export type HavenShipVoyage = {
  readonly state: HavenShipVoyageState;
  /** 0 = berth (depart) / sea (return); 1 = sea (depart) / berth (return). */
  readonly routeT: number;
  readonly docked: boolean;
};

export function resolveHavenShipVoyage(hullId: string, absHours: number): HavenShipVoyage {
  const tt = havenShipTimetable(hullId);
  const phase = ((absHours - tt.offsetHours) % tt.periodHours + tt.periodHours) % tt.periodHours;
  const transit = Math.min(
    HAVEN_SHIP_TRANSIT_HOURS,
    tt.dockHours * 0.25,
    tt.awayHours * 0.12,
  );
  if (phase < tt.dockHours - transit) {
    return { state: 'in_port', routeT: 0, docked: true };
  }
  if (phase < tt.dockHours) {
    return { state: 'departing', routeT: (phase - (tt.dockHours - transit)) / transit, docked: false };
  }
  if (phase < tt.periodHours - transit) {
    return { state: 'at_sea', routeT: 1, docked: false };
  }
  return {
    state: 'returning',
    routeT: (phase - (tt.periodHours - transit)) / transit,
    docked: false,
  };
}

export function havenShipSkipperPresent(npcId: string, absHours: number): boolean {
  const ship = FLEET_BY_SKIPPER.get(npcId);
  if (!ship) return false;
  return resolveHavenShipVoyage(ship.hullId, absHours).docked;
}

export function havenShipHeadingAssetId(hullId: string, heading: HavenShipHeading): string {
  return `${hullId}_${heading}`;
}

export function havenShipVisualAssetIds(): readonly string[] {
  const ids: string[] = [];
  for (const hull of HAVEN_SHIP_HULL_IDS) {
    ids.push(hull);
    for (const heading of HAVEN_SHIP_HEADINGS) {
      ids.push(havenShipHeadingAssetId(hull, heading));
    }
  }
  return ids;
}

/** Land chandler / heading-stripped hull. Null if not a water craft. */
export function parseHavenShipAsset(
  assetId: string,
): { hullId: HavenShipHullId; heading: HavenShipHeading | null } | null {
  if (assetId === 'prop_ship_chandler' || assetId.startsWith('prop_ship_chandler_')) return null;
  if (assetId === 'prop_rowboat') return { hullId: 'prop_ship_skiff', heading: null };
  if (assetId === 'prop_ship_galley') return { hullId: 'prop_ship_caravel', heading: null };
  for (const hull of HAVEN_SHIP_HULL_IDS) {
    if (assetId === hull) return { hullId: hull, heading: null };
    const prefix = `${hull}_`;
    if (assetId.startsWith(prefix)) {
      const suffix = assetId.slice(prefix.length);
      if (HAVEN_SHIP_HEADING_SET.has(suffix)) {
        return { hullId: hull, heading: suffix as HavenShipHeading };
      }
    }
  }
  return null;
}

export function isHavenShipHullAsset(assetId: string): boolean {
  return parseHavenShipAsset(assetId) !== null;
}

/**
 * 8-way heading from a patrol-leg delta. +x east, +y south (Phaser / Tiled).
 * Zero motion defaults to south (seaward berth).
 */
export function havenShipHeadingFromDelta(dx: number, dy: number): HavenShipHeading {
  if (dx === 0 && dy === 0) return 's';
  const step = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const idx = ((step % 8) + 8) % 8;
  return HAVEN_SHIP_HEADINGS[idx]!;
}

export function havenShipBerthHeading(worldX: number, worldY: number): HavenShipHeading {
  const tx = Math.floor(worldX / HAVEN_TILE_SIZE);
  const ty = Math.floor(worldY / HAVEN_TILE_SIZE);
  for (const [key, tile] of Object.entries(HAVEN_SHIP_BERTH_TILES)) {
    if (tile[0] === tx && tile[1] === ty) {
      return HAVEN_SHIP_BERTH_HEADING[key as keyof typeof HAVEN_SHIP_BERTH_HEADING];
    }
  }
  return 's';
}

export function resolveHavenShipVisualId(
  hullId: string,
  heading: HavenShipHeading,
  hasTexture: (id: string) => boolean,
): string {
  const preferred = havenShipHeadingAssetId(hullId, heading);
  if (hasTexture(preferred)) return preferred;
  if (HAVEN_SHIP_HULL_SET.has(hullId) && hasTexture(hullId)) return hullId;
  for (const other of HAVEN_SHIP_HEADINGS) {
    if (other === heading) continue;
    const id = havenShipHeadingAssetId(hullId, other);
    if (hasTexture(id)) return id;
  }
  return hullId;
}

function inRect(tx: number, ty: number, r: HavenTileRect): boolean {
  return tx >= r.tx && tx < r.tx + r.w && ty >= r.ty && ty < r.ty + r.h;
}

export function isHavenBasinWaterTile(tx: number, ty: number): boolean {
  return inRect(tx, ty, HAVEN_WATER_BASIN) || inRect(tx, ty, HAVEN_WATER_EAST_BAY);
}

export function isHavenHarborStoneTile(tx: number, ty: number): boolean {
  return HAVEN_HARBOR_STONE.some((r) => inRect(tx, ty, r));
}

/** Outward unit step from a stone cell toward water or void. */
export type HavenHarborCopingEdge = {
  readonly tx: number;
  readonly ty: number;
  readonly dx: number;
  readonly dy: number;
};

const CARDINAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Stone cells whose neighbour is not pier/quay — the cobble drop-off. */
export function havenHarborCopingEdges(): readonly HavenHarborCopingEdge[] {
  const out: HavenHarborCopingEdge[] = [];
  for (const r of HAVEN_HARBOR_STONE) {
    for (let ty = r.ty; ty < r.ty + r.h; ty++) {
      for (let tx = r.tx; tx < r.tx + r.w; tx++) {
        for (const [dx, dy] of CARDINAL) {
          if (isHavenHarborStoneTile(tx + dx, ty + dy)) continue;
          out.push({ tx, ty, dx, dy });
        }
      }
    }
  }
  return out;
}

/** Tile is marine water (not quay / pier stone, not land). */
export function isHavenOpenWaterTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= HAVEN_MAP_TILES_W || ty >= HAVEN_MAP_TILES_H) return false;
  return isHavenBasinWaterTile(tx, ty) && !isHavenHarborStoneTile(tx, ty);
}

/** Horizontal open-water spans in [x0, x1) on row ty — water overlay / audits. */
export function havenOpenWaterRowSpans(
  ty: number,
  x0: number,
  x1: number,
): ReadonlyArray<{ readonly tx: number; readonly w: number }> {
  const spans: Array<{ tx: number; w: number }> = [];
  let tx = x0;
  while (tx < x1) {
    while (tx < x1 && !isHavenOpenWaterTile(tx, ty)) tx += 1;
    const start = tx;
    while (tx < x1 && isHavenOpenWaterTile(tx, ty)) tx += 1;
    if (tx > start) spans.push({ tx: start, w: tx - start });
  }
  return spans;
}

export function havenHarborPatrolWorld(
  assetId: string,
): ReadonlyArray<{ x: number; y: number }> | null {
  const parsed = parseHavenShipAsset(assetId);
  const tiles = HAVEN_SHIP_OUTBOUND_TILES[parsed?.hullId ?? assetId];
  if (!tiles) return null;
  return tiles.map(([tx, ty]) => havenWorldFromTile(tx, ty));
}

export function havenShipSkipperWorld(npcId: string): { x: number; y: number } | null {
  const ship = FLEET_BY_SKIPPER.get(npcId);
  if (!ship) return null;
  return havenWorldFromTile(ship.skipperTile[0], ship.skipperTile[1]);
}
