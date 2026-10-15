import { MinHeap } from '../game/systems/min-heap.js';
import type Phaser from 'phaser';
import { havenStreetWorldPathLaned } from '@empery/shared';
import { isInsidePropAabb, propCollisionRevision } from './prop-colliders.js';
import { GROUND_LAYER_KEY, isTileBlockedAt } from './world-tiles.js';

const PATH_CACHE_MAX = 420;
let PATH_CACHES = new WeakMap<Phaser.Scene,{revision:number;ground:unknown;routes:Map<string,Array<{x:number;y:number}>>}>();
interface NavigationGrid {
  revision: number; ground: unknown; minX: number; minY: number; cols: number; rows: number;
  cells: Uint8Array; edges: Uint8Array;
}
let NAVIGATION_GRIDS = new WeakMap<Phaser.Scene, Map<number, NavigationGrid>>();
const NPC_PATH_DEBUG_GFX_KEY = 'npcPathDebugGfx';
const NPC_PATH_DEBUG_ROUTES_KEY = 'npcPathDebugRoutes';

interface DebugRoute {
  points: Array<{ x: number; y: number }>;
  fallback: boolean;
  blockedAt: { x: number; y: number } | null;
}

function pathKey(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  lane: -1 | 1,
): string {
  return `${fromX},${fromY}>${toX},${toY}:L${lane}`;
}

function isBlocked(scene: Phaser.Scene, x: number, y: number, radius = 13): boolean {
  return isTileBlockedAt(scene, x, y) || isInsidePropAabb(scene, x, y, radius);
}

function segmentBlocked(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius = 13,
  skipStart = false,
): boolean {
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(2, Math.ceil(dist / 18));
  const startStep = skipStart ? 1 : 0;
  for (let i = startStep; i <= steps; i++) {
    const t = i / steps;
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    if (isBlocked(scene, x, y, radius)) return true;
  }
  return false;
}

function firstBlockedPoint(
  scene: Phaser.Scene,
  route: Array<{ x: number; y: number }>,
  radius = 13,
): { x: number; y: number } | null {
  if (route.length < 2) return null;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    if (segmentBlocked(scene, a.x, a.y, b.x, b.y, radius)) {
      return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    }
  }
  return null;
}

interface GridNode {
  gx: number;
  gy: number;
  f: number;
  g: number;
}

function gridId(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

function findAStarPath(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  cell = 32,
): Array<{ x: number; y: number }> | null {
  const world = scene.physics.world.bounds;
  const minX = world.x + cell;
  const maxX = world.right - cell;
  const minY = world.y + cell;
  const maxY = world.bottom - cell;

  const toGrid = (x: number, y: number): { gx: number; gy: number } => ({
    gx: Math.round((x - minX) / cell),
    gy: Math.round((y - minY) / cell),
  });
  const toWorld = (gx: number, gy: number): { x: number; y: number } => ({
    x: minX + gx * cell,
    y: minY + gy * cell,
  });

  const cols = Math.max(2, Math.floor((maxX - minX) / cell) + 1);
  const rows = Math.max(2, Math.floor((maxY - minY) / cell) + 1);
  const start = toGrid(fromX, fromY);
  const goal = toGrid(toX, toY);
  const revision = propCollisionRevision(scene), ground = scene.data.get(GROUND_LAYER_KEY);
  let grids = NAVIGATION_GRIDS.get(scene);
  if(!grids){grids=new Map();NAVIGATION_GRIDS.set(scene,grids);}
  let grid = grids.get(cell);
  if (!grid || grid.revision !== revision || grid.ground !== ground || grid.minX !== minX || grid.minY !== minY || grid.cols !== cols || grid.rows !== rows) {
    grid = { revision, ground, minX, minY, cols, rows, cells: new Uint8Array(cols * rows), edges: new Uint8Array(cols * rows * 8) };
    grids.set(cell, grid);
  }

  const walkable = (gx: number, gy: number): boolean => {
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
    const id = gy * cols + gx;
    const cached = grid.cells[id];
    if (cached) return cached === 1;
    const p = toWorld(gx, gy);
    const result = !isBlocked(scene, p.x, p.y, 13);
    grid.cells[id] = result ? 1 : 2;
    return result;
  };

  const findNearestWalkable = (
    gx: number,
    gy: number,
    maxRadius = 3,
    anchor?: {x:number;y:number},
  ): { gx: number; gy: number } | null => {
    const connected = (nx:number,ny:number):boolean => {
      if(!walkable(nx,ny))return false;
      if(!anchor)return true;
      const point=toWorld(nx,ny);
      return !segmentBlocked(scene,point.x,point.y,anchor.x,anchor.y);
    };
    if (connected(gx, gy)) return { gx, gy };
    let best: { gx: number; gy: number } | null = null;
    let bestDist = Infinity;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = gx + dx;
          const ny = gy + dy;
          if (connected(nx, ny)) {
            const d = Math.hypot(dx, dy);
            if (d < bestDist) {
              bestDist = d;
              best = { gx: nx, gy: ny };
            }
          }
        }
      }
      if (best) return best;
    }
    return null;
  };

  const startNode = findNearestWalkable(start.gx,start.gy,3,!isBlocked(scene,fromX,fromY)?{x:fromX,y:fromY}:undefined);
  const exactGoalClear = !isBlocked(scene,toX,toY);
  const goalNode = findNearestWalkable(goal.gx,goal.gy,3,exactGoalClear?{x:toX,y:toY}:undefined);

  if (!startNode || !goalNode) return null;

  const open = new MinHeap<GridNode>((a,b)=>a.f-b.f || b.g-a.g);
  const gScore = new Map<string, number>();
  const came = new Map<string, string>();
  const closed = new Set<string>();

  const h = (gx:number,gy:number):number => {const dx=Math.abs(goalNode.gx-gx),dy=Math.abs(goalNode.gy-gy);return Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);};

  open.push({ gx: startNode.gx, gy: startNode.gy, g: 0, f: h(startNode.gx, startNode.gy) });
  gScore.set(gridId(startNode.gx, startNode.gy), 0);

  const neighbors: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  const MAX_ASTAR_ITERATIONS = Math.min(cols * rows, 45000);
  let iterations = 0;

  while (open.size > 0) {
    const cur=open.pop()!;
    const curId=gridId(cur.gx,cur.gy);
    if(closed.has(curId)||cur.g!==gScore.get(curId))continue;
    if (++iterations > MAX_ASTAR_ITERATIONS) break;
    if (cur.gx === goalNode.gx && cur.gy === goalNode.gy) {
      const goalWasAdjusted = !exactGoalClear;
      const out: Array<{ x: number; y: number }> = goalWasAdjusted
        ? []
        : [{ x: toX, y: toY }];
      let trace = curId;
      while (trace !== gridId(startNode.gx, startNode.gy)) {
        const [sx, sy] = trace.split(',').map(Number);
        const p = toWorld(sx, sy);
        out.push({ x: p.x, y: p.y });
        const prev = came.get(trace);
        if (!prev) break;
        trace = prev;
      }
      out.push(toWorld(startNode.gx, startNode.gy));
      out.push({ x: fromX, y: fromY });
      out.reverse();
      return out;
    }
    closed.add(curId);

    for (let direction = 0; direction < neighbors.length; direction++) {
      const [dx, dy] = neighbors[direction]!;
      const nx = cur.gx + dx;
      const ny = cur.gy + dy;
      const nid = gridId(nx, ny);
      if (closed.has(nid) || !walkable(nx, ny)) continue;
      // Prevent diagonal cutting through corner obstacles
      if (dx !== 0 && dy !== 0) {
        if (!walkable(cur.gx + dx, cur.gy) || !walkable(cur.gx, cur.gy + dy)) continue;
      }
      // Free nodes do not guarantee a free edge across a narrow footprint.
      const a = toWorld(cur.gx, cur.gy);
      const b = toWorld(nx, ny);
      const edgeIndex = (cur.gy * cols + cur.gx) * 8 + direction;
      let edge = grid.edges[edgeIndex];
      if (!edge) {
        edge = segmentBlocked(scene, a.x, a.y, b.x, b.y) ? 2 : 1;
        grid.edges[edgeIndex] = edge;
        const opposite = [1, 0, 3, 2, 7, 6, 5, 4][direction]!;
        grid.edges[(ny * cols + nx) * 8 + opposite] = edge;
      }
      if (edge === 2) continue;
      const step = Math.hypot(dx, dy);
      const nextG = cur.g + step;
      const prevG = gScore.get(nid);
      if (prevG !== undefined && nextG >= prevG) continue;
      came.set(nid, curId);
      gScore.set(nid, nextG);
      const nextF = nextG + h(nx, ny);
      open.push({ gx: nx, gy: ny, g: nextG, f: nextF });
    }
  }

  return null;
}

function smoothRoute(
  scene: Phaser.Scene,
  route: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (route.length <= 2) return route;
  const out: Array<{ x: number; y: number }> = [route[0]!];
  let i = 0;
  while (i < route.length - 1) {
    let furthest = i + 1;
    for (let j = route.length - 1; j > i + 1; j--) {
      const a = route[i]!;
      const b = route[j]!;
      if (!segmentBlocked(scene, a.x, a.y, b.x, b.y, 13, i === 0)) {
        furthest = j;
        break;
      }
    }
    out.push(route[furthest]!);
    i = furthest;
  }
  return out;
}

function pathDebugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('npcPathDebug');
  } catch {
    return false;
  }
}

function ensureDebugGfx(scene: Phaser.Scene): Phaser.GameObjects.Graphics | null {
  if (!pathDebugEnabled()) return null;
  let g = scene.data.get(NPC_PATH_DEBUG_GFX_KEY) as Phaser.GameObjects.Graphics | undefined;
  if (g?.active) return g;
  g = scene.add.graphics().setDepth(11_500);
  scene.data.set(NPC_PATH_DEBUG_GFX_KEY, g);
  scene.events.once('shutdown', () => {
    const cur = scene.data.get(NPC_PATH_DEBUG_GFX_KEY) as Phaser.GameObjects.Graphics | undefined;
    if (cur) {
      try {
        cur.destroy();
      } catch {
        /* already gone */
      }
    }
    scene.data.remove(NPC_PATH_DEBUG_GFX_KEY);
    scene.data.remove(NPC_PATH_DEBUG_ROUTES_KEY);
  });
  return g;
}

function redrawDebugRoutes(scene: Phaser.Scene): void {
  const g = ensureDebugGfx(scene);
  if (!g) return;
  const routes = (scene.data.get(NPC_PATH_DEBUG_ROUTES_KEY) as DebugRoute[] | undefined) ?? [];
  g.clear();
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i]!;
    const alpha = 0.15 + (i / Math.max(1, routes.length - 1)) * 0.55;
    const color = r.fallback ? 0x50d8ff : 0x78ff88;
    g.lineStyle(2, color, alpha);
    for (let p = 1; p < r.points.length; p++) {
      const a = r.points[p - 1]!;
      const b = r.points[p]!;
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    if (r.points.length > 0) {
      const s = r.points[0]!;
      const e = r.points[r.points.length - 1]!;
      g.fillStyle(0xffffff, alpha * 0.85);
      g.fillCircle(s.x, s.y, 2.5);
      g.fillStyle(color, alpha * 0.95);
      g.fillCircle(e.x, e.y, 3.5);
    }
    if (r.blockedAt) {
      g.lineStyle(2, 0xff4f4f, alpha * 0.9);
      g.strokeCircle(r.blockedAt.x, r.blockedAt.y, 7);
    }
  }
}

function pushDebugRoute(
  scene: Phaser.Scene,
  route: Array<{ x: number; y: number }>,
  fallback: boolean,
  blockedAt: { x: number; y: number } | null,
): void {
  if (!pathDebugEnabled()) return;
  const routes = (scene.data.get(NPC_PATH_DEBUG_ROUTES_KEY) as DebugRoute[] | undefined) ?? [];
  routes.push({ points: route, fallback, blockedAt });
  if (routes.length > 28) routes.shift();
  scene.data.set(NPC_PATH_DEBUG_ROUTES_KEY, routes);
  redrawDebugRoutes(scene);
}

export function buildNpcRoute(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  lane: -1 | 1,
): Array<{ x: number; y: number }> {
  const key = pathKey(fromX, fromY, toX, toY, lane);
  const revision=propCollisionRevision(scene), ground=scene.data.get(GROUND_LAYER_KEY);let cache=PATH_CACHES.get(scene);
  if(!cache||cache.revision!==revision||cache.ground!==ground){cache={revision,ground,routes:new Map()};PATH_CACHES.set(scene,cache);}
  const routes=cache.routes,cached=routes.get(key);
  if(cached){routes.delete(key);routes.set(key,cached);return cached;}

  const direct=Math.hypot(toX-fromX,toY-fromY)<=192&&!segmentBlocked(scene,fromX,fromY,toX,toY);
  const base = direct?[{x:fromX,y:fromY},{x:toX,y:toY}]:havenStreetWorldPathLaned(fromX, fromY, toX, toY, lane);
  let route = base;
  const blockedAt = firstBlockedPoint(scene, base, 13);
  let fallbackUsed = false;
  if (blockedAt) {
    const fallback = findAStarPath(scene, fromX, fromY, toX, toY) ?? findAStarPath(scene, fromX, fromY, toX, toY, 16);
    if (fallback && fallback.length > 1) {
      route = smoothRoute(scene, fallback);
      fallbackUsed = true;
      // Include the exact start/goal connectors in collision validation.
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!;
        const b = route[i]!;
        if (segmentBlocked(scene, a.x, a.y, b.x, b.y, 13, i === 1)) {
          route = [];
          break;
        }
      }
    }else{route=[];}
  }

  if (routes.size >= PATH_CACHE_MAX) routes.delete(routes.keys().next().value!);
  routes.set(key, route);
  pushDebugRoute(scene, route, fallbackUsed, blockedAt);
  return route;
}

export function clearNpcRouteCache(scene?:Phaser.Scene): void {
  if(scene){PATH_CACHES.delete(scene);NAVIGATION_GRIDS.delete(scene);}
  else {PATH_CACHES=new WeakMap();NAVIGATION_GRIDS=new WeakMap();}
}
