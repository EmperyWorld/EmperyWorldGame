import { MOVEMENT_STEP_MS } from '@empery/shared/movement';
import type { CollisionWorld } from '@empery/shared/world-collision';

export interface MotionPoint { x: number; y: number }
export interface PredictedFrame { dx: number; dy: number; prediction: MotionPoint }

/** Fixed-step physical pose with interpolation for display and camera only. */
export class PlayerMotion {
  private previous: MotionPoint;
  private remainder = 0;
  private paused = false;
  constructor(private pose: MotionPoint) { this.pose = { ...pose }; this.previous = { ...pose }; }
  get x(): number { return this.pose.x; }
  get y(): number { return this.pose.y; }
  position(): MotionPoint { return { ...this.pose }; }
  renderPosition(): MotionPoint {
    const t = this.remainder / MOVEMENT_STEP_MS;
    return { x: this.previous.x + (this.pose.x - this.previous.x) * t, y: this.previous.y + (this.pose.y - this.previous.y) * t };
  }
  reset(point: MotionPoint): void { this.pose = { ...point }; this.previous = { ...point }; this.remainder = 0; this.paused = false; }
  correct(point: MotionPoint): void {
    const dx = point.x - this.pose.x, dy = point.y - this.pose.y;
    this.previous = { x: this.previous.x + dx, y: this.previous.y + dy };
    this.pose = { ...point };
  }
  advance(world: CollisionWorld, deltaMs: number, dx: number, dy: number, speed: number, target?: MotionPoint | ((from: MotionPoint) => MotionPoint | null) | null, availableSteps = 4): PredictedFrame[] {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || !Number.isFinite(speed) || speed < 0) return [];
    const capacity = Number.isFinite(availableSteps) ? Math.max(0, Math.min(4, Math.floor(availableSteps))) : 0;
    if (!capacity) {
      this.remainder = Math.min(MOVEMENT_STEP_MS, this.remainder + deltaMs); this.paused = true;
      return [];
    }
    if (this.paused) { this.previous = { ...this.pose }; this.remainder = 0; this.paused = false; }
    this.remainder = Math.min(MOVEMENT_STEP_MS * capacity, this.remainder + deltaMs);
    const frames: PredictedFrame[] = [];
    while (this.remainder + 1e-6 >= MOVEMENT_STEP_MS) {
      this.previous = { ...this.pose };
      const from = world.nearestWalkable(this.pose);
      if (from.x !== this.pose.x || from.y !== this.pose.y) this.previous = { ...from };
      let vx = dx, vy = dy;
      const destination = typeof target === 'function' ? target(from) : target;
      if (typeof target === 'function' && !destination) { vx = 0; vy = 0; }
      if (destination && (dx || dy)) {
        const distance = Math.hypot(destination.x - from.x, destination.y - from.y);
        vx = distance ? (destination.x - from.x) / distance : 0;
        vy = distance ? (destination.y - from.y) / distance : 0;
        const scale = speed > 0 ? Math.min(1, distance * 1000 / MOVEMENT_STEP_MS / speed) : 0;
        vx *= scale; vy *= scale;
      }
      this.pose = world.move(from, vx, vy, speed, MOVEMENT_STEP_MS / 1000);
      this.remainder = Math.max(0, this.remainder - MOVEMENT_STEP_MS);
      frames.push({ dx: vx, dy: vy, prediction: { ...this.pose } });
    }
    return frames;
  }
}
