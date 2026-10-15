export interface CityPoint { x: number; y: number }
export interface CityRouteWorld {
  position(): CityPoint;
  move(point: CityPoint): void;
  route(from: CityPoint, to: CityPoint): CityPoint[];
  revision(): number;
  walkable(point: CityPoint): boolean;
  constrainStep?(from: CityPoint, desired: CityPoint): CityPoint | null;
}

export function cityRouteRetryDelay(failures: number): number {
  return Math.min(5000, 500 * 2 ** Math.min(Math.max(0, failures - 1), 4));
}

/** Follows a requested destination without mistaking a shortened path for arrival. */
export class CityRouteFollower {
  private goal: CityPoint | null = null;
  private points: CityPoint[] = [];
  private segment = 0;
  private revision = -1;
  private blockedMs = 0;
  private retryMs = 0;
  failures = 0;
  moving = false;

  constructor(private world: CityRouteWorld) {}

  clear(): void {
    this.goal = null;
    this.points = [];
    this.segment = 0;
    this.blockedMs = this.retryMs = this.failures = 0;
    this.moving = false;
  }

  setGoal(point: CityPoint, tolerance = 0): void {
    if (this.goal && Math.hypot(point.x - this.goal.x, point.y - this.goal.y) <= tolerance) return;
    this.clear();
    this.goal = { ...point };
    this.rebuild();
  }

  private rebuild(): void {
    if (!this.goal) return;
    this.points = this.world.route(this.world.position(), this.goal);
    this.segment = 0;
    this.revision = this.world.revision();
    this.blockedMs = this.retryMs = 0;
  }

  private defer(): void {
    this.failures++;
    this.retryMs = cityRouteRetryDelay(this.failures);
    this.blockedMs = 0;
    this.moving = false;
  }

  step(deltaMs: number, speed: number, arrivalPx = 6): boolean {
    this.moving = false;
    if (!this.goal || !Number.isFinite(deltaMs) || deltaMs <= 0 || !Number.isFinite(speed) || speed <= 0) return false;
    const elapsed = Math.min(deltaMs, 500);
    if (this.revision !== this.world.revision()) {
      this.failures = 0;
      this.rebuild();
    }
    if (this.retryMs > 0) {
      this.retryMs = Math.max(0, this.retryMs - elapsed);
      if (this.retryMs === 0) this.rebuild();
      return false;
    }
    if (this.points.length === 0) {
      this.blockedMs += elapsed;
      if (this.blockedMs >= 1200) this.defer();
      return false;
    }
    let budget = speed * elapsed / 1000;
    for (let guard = 0; guard < 64; guard++) {
      if (this.segment >= this.points.length - 1) {
        const pose = this.world.position();
        if (Math.hypot(pose.x - this.goal.x, pose.y - this.goal.y) <= arrivalPx) return true;
        this.defer();
        return false;
      }
      const pose = this.world.position(), target = this.points[this.segment + 1]!;
      const dx = target.x - pose.x, dy = target.y - pose.y, distance = Math.hypot(dx, dy);
      if (distance < 0.001) { this.segment++; continue; }
      if (budget <= 0) return false;
      // Bound collision samples even during a slow display frame or catch-up.
      const step = Math.min(budget, distance, 8);
      const desired = { x: pose.x + dx / distance * step, y: pose.y + dy / distance * step };
      const next = this.world.constrainStep ? this.world.constrainStep(pose, desired) : desired;
      if (!next || !this.world.walkable(next)) {
        this.blockedMs = this.moving ? 0 : this.blockedMs + elapsed;
        if (this.blockedMs >= 700) this.defer();
        return false;
      }
      this.world.move(next);
      this.moving = true;
      this.blockedMs = 0;
      const travelled = Math.hypot(next.x-pose.x,next.y-pose.y);
      budget -= travelled;
      if (Math.hypot(next.x-target.x,next.y-target.y) < 0.001) this.segment++;
      if (travelled < 0.001) return false;
    }
    return false;
  }
}
