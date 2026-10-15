/**
 * Terrain GID vocabulary for Tiled ground layers.
 * Phaser TilemapGPULayer needs a real image sheet + enough unique tiles
 * so roads/plazas don't wallpaper as one 64×64 stamp.
 *
 * Haven bake semantics (then diversify within family):
 * 1 — dirt path / soft yard   5 — gravel plaza   6 — stone apron
 * 2 — stone paved artery (width 3 on main spines)
 * 3 — water (solid)   4 — wall (solid)
 * After diversify: 1/5/6 ↔ plaza variants, 2/7/8 ↔ road variants (all walkable).
 */
export const TERRAIN_TILE = {
  plazaA: 1,
  roadA: 2,
  water: 3,
  wall: 4,
  plazaB: 5,
  plazaC: 6,
  roadB: 7,
  roadC: 8,
} as const;

export const TERRAIN_SHEET_COLUMNS = 8;
export const TERRAIN_TILE_PX = 64;
export const TERRAIN_SHEET_W = TERRAIN_SHEET_COLUMNS * TERRAIN_TILE_PX;
export const TERRAIN_SHEET_H = TERRAIN_TILE_PX;

export const PLAZA_TILE_GIDS: readonly number[] = [
  TERRAIN_TILE.plazaA,
  TERRAIN_TILE.plazaB,
  TERRAIN_TILE.plazaC,
];

export const ROAD_TILE_GIDS: readonly number[] = [
  TERRAIN_TILE.roadA,
  TERRAIN_TILE.roadB,
  TERRAIN_TILE.roadC,
];

export const WALKABLE_TILE_GIDS: ReadonlySet<number> = new Set([
  ...PLAZA_TILE_GIDS,
  ...ROAD_TILE_GIDS,
]);

export function isWalkableTileGid(gid: number | undefined | null): boolean {
  if (gid == null || gid <= 0) return false;
  return WALKABLE_TILE_GIDS.has(gid);
}

/** Stable 0..n-1 pick from tile coords (map bake + client must match). */
export function terrainVariantIndex(tx: number, ty: number, salt: number, n: number): number {
  const v = Math.imul(tx + 1, 374761393) ^ Math.imul(ty + 1, 668265263) ^ Math.imul(salt, 1274126177);
  return Math.abs(v) % Math.max(1, n);
}

export function diversifyTerrainGid(gid: number, tx: number, ty: number): number {
  if (gid === TERRAIN_TILE.plazaA || gid === TERRAIN_TILE.plazaB || gid === TERRAIN_TILE.plazaC) {
    return PLAZA_TILE_GIDS[terrainVariantIndex(tx, ty, 11, PLAZA_TILE_GIDS.length)]!;
  }
  if (gid === TERRAIN_TILE.roadA || gid === TERRAIN_TILE.roadB || gid === TERRAIN_TILE.roadC) {
    return ROAD_TILE_GIDS[terrainVariantIndex(tx, ty, 29, ROAD_TILE_GIDS.length)]!;
  }
  return gid;
}
