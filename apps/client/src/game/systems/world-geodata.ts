/**
 * Walkable geodata helpers — no Phaser (safe for unit tests).
 * Tiled GIDs: plaza 1/5/6 + road 2/7/8 walkable; water 3 + wall 4 solid.
 */

export {
  WALKABLE_TILE_GIDS,
  isWalkableTileGid,
  TERRAIN_TILE,
  PLAZA_TILE_GIDS,
  ROAD_TILE_GIDS,
  diversifyTerrainGid,
  terrainVariantIndex,
} from './terrain-tiles.js';

const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** If (x,y) sits on a colliding cell, hop to the nearest walkable neighbour centre. */
export function nudgeFromCollidingCell(
  x: number,
  y: number,
  tileW: number,
  tileH: number,
  collides: (tx: number, ty: number) => boolean,
): { x: number; y: number } {
  if (tileW <= 0 || tileH <= 0) return { x, y };
  const tx = Math.floor(x / tileW);
  const ty = Math.floor(y / tileH);
  if (!collides(tx, ty)) return { x, y };
  let bestX = x;
  let bestY = y;
  let bestD = Infinity;
  for (const [ox, oy] of DIRS8) {
    const nx = tx + ox;
    const ny = ty + oy;
    if (collides(nx, ny)) continue;
    const wx = (nx + 0.5) * tileW;
    const wy = (ny + 0.5) * tileH;
    const d = (wx - x) * (wx - x) + (wy - y) * (wy - y);
    if (d < bestD) {
      bestD = d;
      bestX = wx;
      bestY = wy;
    }
  }
  return { x: bestX, y: bestY };
}

/**
 * Click / order target inside a wall: walk it toward `from` until unblocked.
 * Gives up at the origin so we never keep a destination inside solid geodata.
 */
export function pullTowardWalkable(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  blocked: (x: number, y: number) => boolean,
  step = 20,
  maxSteps = 36,
): { x: number; y: number } {
  if (!blocked(toX, toY)) return { x: toX, y: toY };
  const dx = fromX - toX;
  const dy = fromY - toY;
  const len = Math.hypot(dx, dy) || 1;
  const sx = (dx / len) * step;
  const sy = (dy / len) * step;
  let x = toX;
  let y = toY;
  for (let i = 0; i < maxSteps; i++) {
    x += sx;
    y += sy;
    if (!blocked(x, y)) return { x, y };
  }
  return { x: fromX, y: fromY };
}
