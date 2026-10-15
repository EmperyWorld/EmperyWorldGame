/**
 * Haven street routing — axis-aligned walks via the main N–S strip and E–W boulevard
 * (matches scripts/layouts/empery_haven.mjs nearestRoad).
 */

import { HAVEN_TILE_SIZE, havenTileCenter, type HavenTile } from './haven-npc-homes.js';

/** Main vertical street (tile X inclusive). */
export const HAVEN_MAIN_TX0 = 36;
export const HAVEN_MAIN_TX1 = 43;
/** Horizontal boulevard (tile Y inclusive). */
export const HAVEN_BLVD_TY0 = 17;
export const HAVEN_BLVD_TY1 = 22;

export function worldToHavenTile(
  x: number,
  y: number,
  tileSize = HAVEN_TILE_SIZE,
): HavenTile {
  return [Math.floor(x / tileSize), Math.floor(y / tileSize)];
}

/** Snap a tile to the nearest point on the main road cross. */
export function nearestHavenRoadTile(tx: number, ty: number): HavenTile {
  const mainLeft = HAVEN_MAIN_TX0;
  const mainRight = HAVEN_MAIN_TX1;
  const blvdTop = HAVEN_BLVD_TY0;
  const blvdBot = HAVEN_BLVD_TY1;

  if (tx >= mainLeft && tx <= mainRight) {
    const cy = ty < blvdTop ? blvdTop : ty > blvdBot ? blvdBot : ty;
    return [tx, cy];
  }
  if (ty >= blvdTop && ty <= blvdBot) {
    const cx = tx < mainLeft ? mainLeft : tx > mainRight ? mainRight : tx;
    return [cx, ty];
  }
  const toMain = tx < mainLeft ? mainLeft : mainRight;
  const toBlvd = ty < blvdTop ? blvdTop : blvdBot;
  if (Math.abs(tx - toMain) <= Math.abs(ty - toBlvd)) return [toMain, ty];
  return [tx, toBlvd];
}

function pushUnique(path: HavenTile[], tile: HavenTile): void {
  const last = path[path.length - 1];
  if (last && last[0] === tile[0] && last[1] === tile[1]) return;
  path.push(tile);
}

/** Manhattan steps between two tiles (inclusive of end, exclusive of start if same axis). */
function axisSteps(from: HavenTile, to: HavenTile): HavenTile[] {
  const out: HavenTile[] = [];
  const [fx, fy] = from;
  const [tx, ty] = to;
  if (fx === tx && fy === ty) return out;
  if (fx === tx) {
    const step = ty > fy ? 1 : -1;
    for (let y = fy + step; step > 0 ? y <= ty : y >= ty; y += step) out.push([fx, y]);
    return out;
  }
  if (fy === ty) {
    const step = tx > fx ? 1 : -1;
    for (let x = fx + step; step > 0 ? x <= tx : x >= tx; x += step) out.push([x, fy]);
    return out;
  }
  // L via boulevard junction preference
  const mid: HavenTile = [tx, fy];
  out.push(...axisSteps(from, mid));
  out.push(...axisSteps(mid, to));
  return out;
}

/**
 * Tile waypoints from A to B via nearest road access + main cross.
 * Dense enough for smooth walkT sampling without cutting through blocks.
 */
export function havenStreetTilePath(from: HavenTile, to: HavenTile): HavenTile[] {
  const path: HavenTile[] = [];
  pushUnique(path, from);
  const roadA = nearestHavenRoadTile(from[0], from[1]);
  const roadB = nearestHavenRoadTile(to[0], to[1]);
  for (const step of axisSteps(from, roadA)) pushUnique(path, step);
  pushUnique(path, roadA);

  // Route roadA → roadB on the cross (prefer blvd then main, or main then blvd).
  const onMain = (t: HavenTile) => t[0] >= HAVEN_MAIN_TX0 && t[0] <= HAVEN_MAIN_TX1;
  const onBlvd = (t: HavenTile) => t[1] >= HAVEN_BLVD_TY0 && t[1] <= HAVEN_BLVD_TY1;

  if (onMain(roadA) && onMain(roadB)) {
    for (const step of axisSteps(roadA, [roadA[0], roadB[1]])) pushUnique(path, step);
    for (const step of axisSteps([roadA[0], roadB[1]], roadB)) pushUnique(path, step);
  } else if (onBlvd(roadA) && onBlvd(roadB)) {
    for (const step of axisSteps(roadA, roadB)) pushUnique(path, step);
  } else {
    const junction: HavenTile = [
      Math.min(HAVEN_MAIN_TX1, Math.max(HAVEN_MAIN_TX0, roadA[0])),
      Math.min(HAVEN_BLVD_TY1, Math.max(HAVEN_BLVD_TY0, roadA[1])),
    ];
    const junctionB: HavenTile = [
      Math.min(HAVEN_MAIN_TX1, Math.max(HAVEN_MAIN_TX0, roadB[0])),
      Math.min(HAVEN_BLVD_TY1, Math.max(HAVEN_BLVD_TY0, roadB[1])),
    ];
    for (const step of axisSteps(roadA, junction)) pushUnique(path, step);
    pushUnique(path, junction);
    for (const step of axisSteps(junction, junctionB)) pushUnique(path, step);
    pushUnique(path, junctionB);
    for (const step of axisSteps(junctionB, roadB)) pushUnique(path, step);
  }
  pushUnique(path, roadB);
  for (const step of axisSteps(roadB, to)) pushUnique(path, step);
  pushUnique(path, to);
  return path;
}

const WORLD_PATH_CACHE = new Map<string, Array<{ x: number; y: number }>>();
const PATH_LEN_CACHE = new Map<string, number>();
const PATH_CACHE_MAX = 512;

function streetCacheKey(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tileSize: number,
): string {
  return `${fromX},${fromY}>${toX},${toY}@${tileSize}`;
}

function remember<T>(map: Map<string, T>, key: string, value: T): T {
  if (map.size >= PATH_CACHE_MAX) map.delete(map.keys().next().value!);
  map.set(key, value);
  return value;
}

export function havenStreetWorldPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tileSize = HAVEN_TILE_SIZE,
): Array<{ x: number; y: number }> {
  const key = streetCacheKey(fromX, fromY, toX, toY, tileSize);
  const hit = WORLD_PATH_CACHE.get(key);
  if (hit) { WORLD_PATH_CACHE.delete(key);WORLD_PATH_CACHE.set(key,hit);return hit; }
  const from = worldToHavenTile(fromX, fromY, tileSize);
  const to = worldToHavenTile(toX, toY, tileSize);
  const path = havenStreetTilePath(from, to).map(([tx, ty]) => havenTileCenter(tx, ty, tileSize));
  if(path.length===1)path.push({x:toX,y:toY});
  path[0]={x:fromX,y:fromY};path[path.length-1]={x:toX,y:toY};
  return remember(WORLD_PATH_CACHE, key, path);
}

/** Cached polyline length in world px — used for walk duration without rebuilding every frame. */
export function havenStreetPathLength(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tileSize = HAVEN_TILE_SIZE,
): number {
  const key = streetCacheKey(fromX, fromY, toX, toY, tileSize);
  const hit = PATH_LEN_CACHE.get(key);
  if (hit !== undefined) return hit;
  const path = havenStreetWorldPath(fromX, fromY, toX, toY, tileSize);
  let len = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return remember(PATH_LEN_CACHE, key, len);
}

/** Locate the segment containing a sampled pose; nearest vertex can skip a corner. */
export function nearestWorldPathSegment(points:ReadonlyArray<{x:number;y:number}>,x:number,y:number):number {
 let best=0,bestDistance=Infinity;
 for(let i=0;i<points.length-1;i++){
  const a=points[i]!,b=points[i+1]!,dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.min(1,Math.max(0,((x-a.x)*dx+(y-a.y)*dy)/length)):0;
  const distance=(x-a.x-t*dx)**2+(y-a.y-t*dy)**2;
  if(distance<bestDistance){bestDistance=distance;best=i;}
 }
 return best;
}

/** Sample a polyline by normalized progress t ∈ [0, 1]. */
export function pointAlongWorldPath(
  points: ReadonlyArray<{ x: number; y: number }>,
  t: number,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0]! };
  const tt = Math.min(1, Math.max(0, t));
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (total < 1) return { ...points[points.length - 1]! };
  let dist = tt * total;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist <= len) {
      const u = len > 0 ? dist / len : 0;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    dist -= len;
  }
  return { ...points[points.length - 1]! };
}

export function pointAlongHavenStreet(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  t: number,
  tileSize = HAVEN_TILE_SIZE,
): { x: number; y: number } {
  return pointAlongWorldPath(havenStreetWorldPath(fromX, fromY, toX, toY, tileSize), t);
}

/** Default sidewalk half-width from road centerline (world px). */
export const HAVEN_SIDEWALK_OFFSET_PX = 14;

/** Stable left/right lane from actor slot or id hash. */
export function havenActorLane(slotOrId: number | string): -1 | 1 {
  if (typeof slotOrId === 'number') {
    return (slotOrId & 1) === 0 ? -1 : 1;
  }
  let h = 0;
  for (let i = 0; i < slotOrId.length; i++) {
    h = (h * 31 + slotOrId.charCodeAt(i)) | 0;
  }
  return (h & 1) === 0 ? -1 : 1;
}

/**
 * Offset a street polyline onto a sidewalk / travel lane.
 * Perpendicular shift uses local tangent so corners stay coherent.
 */
export function offsetWorldPathForLane(
  path: ReadonlyArray<{ x: number; y: number }>,
  lane: -1 | 1,
  offsetPx = HAVEN_SIDEWALK_OFFSET_PX,
): Array<{ x: number; y: number }> {
  if (path.length === 0) return [];
  if (path.length === 1 || offsetPx === 0) {
    return path.map((p) => ({ x: p.x, y: p.y }));
  }
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < path.length; i++) {
    if(i===0||i===path.length-1){out.push({...path[i]!});continue;}
    const prev = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(path.length - 1, i + 1)]!;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      // Degenerate — fall back to previous segment or zero offset.
      if (i > 0) {
        const a = path[i - 1]!;
        const b = path[i]!;
        dx = b.x - a.x;
        dy = b.y - a.y;
      }
    }
    const nlen = Math.hypot(dx, dy) || 1;
    const ox = (-dy / nlen) * lane * offsetPx;
    const oy = (dx / nlen) * lane * offsetPx;
    const p = path[i]!;
    out.push({ x: p.x + ox, y: p.y + oy });
  }
  return out;
}

/** Street path with sidewalk lane applied (does not share cache with centerline). */
export function havenStreetWorldPathLaned(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  lane: -1 | 1,
  offsetPx = HAVEN_SIDEWALK_OFFSET_PX,
  tileSize = HAVEN_TILE_SIZE,
): Array<{ x: number; y: number }> {
  return offsetWorldPathForLane(
    havenStreetWorldPath(fromX, fromY, toX, toY, tileSize),
    lane,
    offsetPx,
  );
}

/**
 * Soft personal-space push away from nearby bodies.
 * Returns suggested position (caller should clamp / collide).
 */
export function softSeparatePosition(
  x: number,
  y: number,
  others: ReadonlyArray<{ x: number; y: number }>,
  opts?: { radius?: number; strength?: number },
): { x: number; y: number } {
  const radius = opts?.radius ?? 30;
  const strength = opts?.strength ?? 0.42;
  let ox = 0;
  let oy = 0;
  for (const o of others) {
    const dx = x - o.x;
    const dy = y - o.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05 || d >= radius) continue;
    const push = (1 - d / radius) * strength;
    ox += (dx / d) * push * 10;
    oy += (dy / d) * push * 10;
  }
  return { x: x + ox, y: y + oy };
}
