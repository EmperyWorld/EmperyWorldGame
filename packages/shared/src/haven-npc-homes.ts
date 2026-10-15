/** Tile homes and patrol routes for Haven NPC schedule (64px tiles). */

export const HAVEN_TILE_SIZE = 64;

export type HavenTile = readonly [number, number];

export function havenTileCenter(tx: number, ty: number, tileSize = HAVEN_TILE_SIZE): { x: number; y: number } {
  return { x: tx * tileSize + tileSize / 2, y: ty * tileSize + tileSize / 2 };
}

/** Night sleep destination per interactive NPC (tile coords) — residential, not the shop floor. */
export const NPC_SLEEP_HOME_TILES: Record<string, readonly [number, number]> = {
  town_merchant: [10, 25],
  town_butcher: [9, 26],
  town_radio: [12, 25],
  town_blacksmith: [10, 41],
  town_stable: [32, 39],
  town_priest: [56, 10],
  town_scribe: [54, 12],
  town_guard: [18, 9],
  town_fisher: [62, 44],
  town_dockhand: [58, 45],
  town_bathkeeper: [54, 21],
  town_brewer: [62, 21],
  // Дверь у нового дома на террасе ty34
  town_miller: [22, 36],
  town_teacher: [25, 36],
  town_steward: [5, 36],
  town_gardener: [11, 36],
  town_informant: [58, 20],
  town_captain: [16, 9],
  town_innkeeper: [60, 21],
  town_innkeeper_day: [59, 21],
  town_healer: [48, 14],
};

/** City guard night patrol loop (tile waypoints along open streets). */
export const GUARD_PATROL_TILES: readonly (readonly [number, number])[] = [
  [40, 8],
  [40, 12],
  [40, 16],
  [40, 20],
  [40, 24],
  [36, 28],
  [36, 32],
  [40, 34],
  [44, 32],
  [48, 28],
  [52, 22],
  [56, 18],
  [58, 14],
  [52, 10],
  [48, 8],
  [44, 8],
  [40, 8],
];

export function resolveNpcSleepHome(
  npcId: string,
  workX: number,
  workY: number,
  tileSize = HAVEN_TILE_SIZE,
): { x: number; y: number } {
  const tile = NPC_SLEEP_HOME_TILES[npcId];
  if (tile) return havenTileCenter(tile[0], tile[1], tileSize);
  return { x: workX + 56, y: workY + 72 };
}

export function guardPatrolWorldPoints(tileSize = HAVEN_TILE_SIZE): Array<{ x: number; y: number }> {
  return GUARD_PATROL_TILES.map(([tx, ty]) => havenTileCenter(tx, ty, tileSize));
}

export function npcUsesGuardPatrol(npcId: string): boolean {
  return npcId === 'town_guard';
}

/** @deprecated Kept for tests/docs — prefer AMBIENT_SLEEP_BY_INDEX. */
export const AMBIENT_HOME_MARKET: readonly HavenTile[] = [
  [10, 25], [9, 26], [11, 26], [12, 24], [8, 24],
];
export const AMBIENT_HOME_PARK: readonly HavenTile[] = [
  [24, 45], [26, 45], [23, 41], [28, 41],
];
export const AMBIENT_HOME_TENEMENT: readonly HavenTile[] = [
  [16, 46], [17, 46], [15, 46], [18, 46], [14, 46], [19, 46],
];
export const AMBIENT_HOME_CATHEDRAL: readonly HavenTile[] = [
  [48, 14], [50, 15], [52, 14], [56, 10],
];
export const AMBIENT_HOME_INN: readonly HavenTile[] = [
  [54, 22], [55, 20], [56, 21], [62, 22], [64, 24],
];
export const AMBIENT_HOME_FORGE: readonly HavenTile[] = [
  [8, 40], [10, 41], [12, 40], [14, 42],
];
export const AMBIENT_HOME_STABLE: readonly HavenTile[] = [
  [31, 38], [32, 39], [31, 40], [33, 38],
];
export const AMBIENT_HOME_HARBOR: readonly HavenTile[] = [
  [58, 46], [56, 45], [60, 45], [62, 44], [67, 48],
];
export const AMBIENT_HOME_GARRISON: readonly HavenTile[] = [
  [14, 8], [16, 9], [12, 10], [18, 8],
];
export const AMBIENT_HOME_HQ: readonly HavenTile[] = [
  [59, 32], [69, 32], [59, 38], [69, 38], [62, 40],
];

/** Unique night door per day ambient citizen index (generated). */
export const AMBIENT_SLEEP_BY_INDEX: readonly HavenTile[] = [
  [13, 24],
  [8, 24],
  [17, 10],
  [10, 10],
  [12, 25],
  [7, 25],
  [11, 26],
  [25, 45],
  [22, 44],
  [28, 45],
  [22, 45],
  [48, 14],
  [49, 15],
  [50, 14],
  [33, 38],
  [54, 21],
  [55, 22],
  [51, 12],
  [52, 13],
  [54, 12],
  [57, 19],
  [56, 21],
  [68, 13],
  [70, 14],
  [66, 14],
  [72, 12],
  [58, 20],
  [60, 21],
  [61, 22],
  [62, 21],
  [62, 44],
  [14, 38],
  [12, 38],
  [8, 38],
  [9, 39],
  [29, 40],
  [31, 40],
  [25, 40],
  [63, 47],
  [66, 46],
  [60, 45],
  [64, 45],
  [59, 44],
  [58, 45],
  [19, 8],
  [34, 39],
  [18, 9],
  [16, 9],
  [56, 46],
  [28, 49],
  [22, 53],
  [20, 53],
  [24, 52],
  [22, 39],
  [22, 40],
  [16, 50],
  [22, 49],
  [21, 38],
  [22, 41],
  [22, 43],
  [32, 39],
  [30, 39],
  [20, 38],
  [11, 42],
  [10, 25],
  [9, 26],
  [12, 10],
  [11, 9],
  [14, 9],
  [13, 8],
  [25, 49],
  [21, 46],
  [22, 42],
  [19, 38],
  [18, 38],
  [19, 40],
  [15, 8],
  [20, 46],
  [19, 44],
  [15, 38],
  [13, 38],
  [11, 39],
  [16, 38],
  [17, 38],
  [19, 46],
  [18, 46],
  [18, 40],
  [18, 44],
  [17, 44],
  [17, 40],
  [16, 40],
  [15, 40],
  [16, 44],
  [14, 40],
  [17, 46],
  [16, 46],
  [15, 46],
  [15, 44],
  [14, 46],
  [14, 41],
  [12, 40],
  [11, 40],
  [14, 44],
  [11, 41],
  [13, 46],
  [11, 43],
  [10, 41],
  [8, 40],
  [11, 44],
  [5, 38],
  [12, 46],
  [11, 45],
  [8, 45],
  [5, 45],
  [11, 49],
  [8, 49],
  [5, 49],
  [59, 32],
  [69, 32],
  [59, 38],
  [69, 38],
  [62, 40],
];

/** Home door tile: explicit sleepTile, else unique slot by ambient index. */
export function resolveAmbientSleepTile(
  _workTx: number,
  _workTy: number,
  index: number,
  explicit?: HavenTile,
): HavenTile {
  if (explicit) return explicit;
  const door = AMBIENT_SLEEP_BY_INDEX[index];
  if (door) return door;
  return AMBIENT_SLEEP_BY_INDEX[index % AMBIENT_SLEEP_BY_INDEX.length]!;
}
