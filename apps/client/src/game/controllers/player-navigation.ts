import type { CollisionWorld } from '@empery/shared/world-collision';
import { MinHeap } from '../systems/min-heap.js';
import type { MotionPoint } from './player-motion.js';

const COARSE_STEP = 16;
const FINE_STEP = 4;
const MAX_GRID_CELLS = 4_000_000;
const MAX_CACHED_CELLS = 48_000;
const MAX_SEARCH_NODES = 100_000;
const MAX_QUEUED_NODES = 200_000;
const MAX_ROUTE_POINTS = 16_384;
const FRAME_BUDGET_MS = 3;
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const REVERSE = [1, 0, 3, 2, 7, 6, 5, 4];
const grids = new WeakMap<CollisionWorld, Map<number, NavigationGrid>>();
type Failure = 'unreachable' | 'search_limit' | 'invalid';
type Cell = { clear: boolean; edges: number };

/** Sparse geometry cache: fine navigation never allocates an array for the entire city. */
class NavigationGrid {
  readonly cols: number;
  readonly rows: number;
  private cells = new Map<number, Cell>();
  constructor(readonly world: CollisionWorld, readonly spacing: number) {
    this.cols = Math.floor(world.map.width * world.map.tilewidth / spacing) + 1;
    this.rows = Math.floor(world.map.height * world.map.tileheight / spacing) + 1;
    if (this.cols * this.rows > MAX_GRID_CELLS) throw new Error('Navigation map exceeds its bound');
  }
  point(id: number): MotionPoint {
    return { x: id % this.cols * this.spacing, y: Math.floor(id / this.cols) * this.spacing };
  }
  private cell(id: number): Cell {
    let cell = this.cells.get(id);
    if (!cell) {
      const point = this.point(id);
      cell = { clear: !this.world.blocked(point.x, point.y), edges: 0 };
      if (this.cells.size >= MAX_CACHED_CELLS) this.cells.delete(this.cells.keys().next().value!);
      this.cells.set(id, cell);
    }
    return cell;
  }
  neighbors(id: number): Array<{ id: number; cost: number }> {
    const x = id % this.cols, y = Math.floor(id / this.cols), result = [];
    const cell = this.cell(id);
    for (let dir = 0; dir < DIRECTIONS.length; dir++) {
      const [dx, dy] = DIRECTIONS[dir]!;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
      const next = ny * this.cols + nx, neighbor = this.cell(next);
      if (!neighbor.clear) continue;
      let edge = (cell.edges >>> (dir * 2)) & 3;
      if (!edge) {
        edge = this.world.canTraverse(this.point(id), this.point(next)) ? 1 : 2;
        cell.edges |= edge << (dir * 2);
        neighbor.edges |= edge << (REVERSE[dir]! * 2);
      }
      if (edge === 1) result.push({ id: next, cost: Math.hypot(dx, dy) * this.spacing });
    }
    return result;
  }
  connect(point: MotionPoint): Map<number, number> {
    const result = new Map<number, number>();
    const cx = Math.round(point.x / this.spacing), cy = Math.round(point.y / this.spacing);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
      const id = y * this.cols + x, p = this.point(id);
      if (this.cell(id).clear && this.world.canTraverse(point, p)) result.set(id, Math.hypot(p.x - point.x, p.y - point.y));
    }
    return result;
  }
}

type SearchNode = { g: number; parent: number; closed: boolean };
class NavigationSearch {
  private open = new MinHeap<{ id: number; g: number; f: number }>((a, b) => a.f - b.f);
  private nodes = new Map<number, SearchNode>();
  private goals: Map<number, number>;
  failure: Failure | null = null;
  expanded = 0;
  get queued(): number { return this.open.size; }
  constructor(readonly grid: NavigationGrid, private from: MotionPoint, private target: MotionPoint) {
    this.goals = grid.connect(target);
    for (const [id, g] of grid.connect(from)) {
      this.nodes.set(id, { g, parent: -1, closed: false });
      this.open.push({ id, g, f: g + this.heuristic(id) });
    }
    if (!this.goals.size) this.failure = 'unreachable';
  }
  private heuristic(id: number): number {
    const p = this.grid.point(id);
    return Math.hypot(p.x - this.target.x, p.y - this.target.y);
  }
  /** One pop is one bounded search unit. Undefined means pending, null means failure. */
  step(): MotionPoint[] | null | undefined {
    if (this.failure) return null;
    const entry = this.open.pop();
    if (!entry) { this.failure = 'unreachable'; return null; }
    const node = this.nodes.get(entry.id)!;
    if (node.closed || entry.g !== node.g) return undefined;
    node.closed = true; this.expanded++;
    if (this.goals.has(entry.id)) {
      const chain: MotionPoint[] = [];
      for (let id = entry.id; id >= 0; id = this.nodes.get(id)!.parent) {
        if (chain.length >= MAX_ROUTE_POINTS) { this.failure = 'search_limit'; return null; }
        chain.push(this.grid.point(id));
      }
      chain.reverse();
      return [this.from, ...chain, this.target];
    }
    for (const next of this.grid.neighbors(entry.id)) {
      const g = entry.g + next.cost, previous = this.nodes.get(next.id);
      if (previous?.closed || (previous && g >= previous.g)) continue;
      if ((!previous && this.nodes.size >= MAX_SEARCH_NODES) || this.open.size >= MAX_QUEUED_NODES) {
        this.failure = 'search_limit'; return null;
      }
      this.nodes.set(next.id, { g, parent: entry.id, closed: false });
      this.open.push({ id: next.id, g, f: g + this.heuristic(next.id) });
    }
    return undefined;
  }
}

/** Smoothing shares the frame budget with search; there is no unsmoothed long-path tail. */
class RouteSmoother {
  readonly path: MotionPoint[];
  private index = 0;
  private candidate: number;
  constructor(private world: CollisionWorld, private raw: MotionPoint[]) {
    this.path = [raw[0]!]; this.candidate = Math.min(raw.length - 1, 24);
  }
  step(): boolean {
    if (this.index >= this.raw.length - 1) return true;
    if (this.candidate === this.index + 1 || this.world.canTraverse(this.raw[this.index]!, this.raw[this.candidate]!)) {
      this.index = this.candidate; this.path.push(this.raw[this.index]!);
      this.candidate = Math.min(this.raw.length - 1, this.index + 24);
    } else this.candidate--;
    return this.index >= this.raw.length - 1;
  }
}

/** Project the clicked obstacle itself; an intervening wall is handled by routing. */
export function resolvePlayerDestination(world: CollisionWorld, target: MotionPoint): MotionPoint | null {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  if (!world.blocked(target.x, target.y)) return { ...target };
  for (let radius = FINE_STEP; radius <= 192; radius += FINE_STEP) {
    let best: MotionPoint | null = null, distance = Infinity;
    const consider = (dx: number, dy: number): void => {
      const p = { x: target.x + dx, y: target.y + dy }, d = dx * dx + dy * dy;
      if (d < distance && !world.blocked(p.x, p.y)) { best = p; distance = d; }
    };
    for (let offset = -radius; offset <= radius; offset += FINE_STEP) {
      consider(offset, -radius); consider(offset, radius);
      if (Math.abs(offset) !== radius) { consider(-radius, offset); consider(radius, offset); }
    }
    if (best) return best;
  }
  return null;
}

export const PLAYER_NAV_ARRIVAL_PX = 2;

export class PlayerNavigation {
  status: 'idle' | 'planning' | 'following' | 'arrived' | 'failed' = 'idle';
  generation = 0;
  path: MotionPoint[] = [];
  failure: Failure | null = null;
  resolution = 0;
  workLastUpdate = 0;
  private index = 1;
  get cursor(): number { return this.index; }
  private world: CollisionWorld | null = null;
  private target: MotionPoint | null = null;
  private searches: NavigationSearch[] = [];
  private turn = 0;
  private smoother: RouteSmoother | null = null;
  private searchLimited = false;
  clear(): void {
    this.status = 'idle'; this.path = []; this.searches = []; this.smoother = null;
    this.target = null; this.world = null; this.failure = null; this.resolution = 0; this.workLastUpdate = 0;
  }
  update(world: CollisionWorld, from: MotionPoint, target: MotionPoint, budget = 600): void {
    this.workLastUpdate = 0;
    if (world !== this.world || !this.target || target.x !== this.target.x || target.y !== this.target.y) this.request(world, from, target);
    const deadline = performance.now() + FRAME_BUDGET_MS;
    const limit = Number.isFinite(budget) ? Math.max(0, Math.min(600, Math.floor(budget))) : 0;
    while (this.status === 'planning' && this.workLastUpdate < limit) {
      if (this.workLastUpdate % 16 === 0 && performance.now() >= deadline) break;
      this.workLastUpdate++;
      if (this.smoother) {
        if (this.smoother.step()) {
          this.path = this.smoother.path; this.smoother = null; this.index = 1; this.status = 'following';
        }
      } else {
        const slot = this.turn++ % 4;
        const index = this.searches.length === 1 || slot < 3 ? 0 : 1;
        const search = this.searches[index]!;
        const path = search.step();
        if (path) {
          this.resolution = search.grid.spacing; this.searches = []; this.smoother = new RouteSmoother(world, path);
        } else if (path === null) {
          this.searchLimited ||= search.failure === 'search_limit'; this.searches.splice(index, 1);
          if (!this.searches.length) { this.failure = this.searchLimited ? 'search_limit' : 'unreachable'; this.status = 'failed'; }
        }
      }
    }
    const point = this.waypoint(from);
    if (point && this.status === 'following') {
      const start = this.path[this.index - 1]!, dx = point.x - start.x, dy = point.y - start.y, length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((from.x - start.x) * dx + (from.y - start.y) * dy) / length)) : 0;
      if (Math.hypot(from.x - start.x - dx * t, from.y - start.y - dy * t) > 1 && !world.canTraverse(from, point)) this.request(world, from, target);
    }
  }
  private request(world: CollisionWorld, from: MotionPoint, target: MotionPoint): void {
    this.generation++; this.world = world; this.target = { ...target }; this.searches = []; this.smoother = null;
    this.path = []; this.index = 1; this.turn = 0; this.failure = null; this.searchLimited = false; this.resolution = 0;
    if (world.blocked(from.x, from.y) || world.blocked(target.x, target.y)) { this.failure = 'invalid'; this.status = 'failed'; return; }
    if (world.canTraverse(from, target)) { this.path = [{ ...from }, { ...target }]; this.status = 'following'; return; }
    let cache = grids.get(world);
    if (!cache) { cache = new Map(); grids.set(world, cache); }
    for (const spacing of [COARSE_STEP, FINE_STEP]) {
      try {
        let grid = cache.get(spacing);
        if (!grid) { grid = new NavigationGrid(world, spacing); cache.set(spacing, grid); }
        this.searches.push(new NavigationSearch(grid, { ...from }, { ...target }));
      } catch { this.searchLimited = true; }
    }
    this.status = this.searches.length ? 'planning' : 'failed';
    if (!this.searches.length) this.failure = 'search_limit';
  }
  waypoint(from: MotionPoint): MotionPoint | null {
    if (this.status !== 'following') return null;
    while (this.index < this.path.length) {
      const tolerance = this.index === this.path.length - 1 ? PLAYER_NAV_ARRIVAL_PX : 0.05;
      if (Math.hypot(from.x - this.path[this.index]!.x, from.y - this.path[this.index]!.y) >= tolerance) break;
      this.index++;
    }
    if (this.index >= this.path.length) { this.status = 'arrived'; return null; }
    return this.path[this.index]!;
  }
}
