import type { CollisionWorld } from '@empery/shared/world-collision';
import type { MotionPoint } from './player-motion.js';

export const NPC_APPROACH_REACH = 72;
const STAND_DISTANCE = 52;
type ApproachResult = { kind: 'wait' } | { kind: 'unavailable' } | { kind: 'unreachable' } | { kind: 'arrived'; id: string } | { kind: 'route'; point: MotionPoint };

/** Pick a clear standing point, keeping space for both rider and NPC. */
export function interactionStandingPoint(world: CollisionWorld, from: MotionPoint, target: MotionPoint): MotionPoint | null {
  const angle = Math.atan2(from.y - target.y, from.x - target.x);
  const candidates: Array<{ point: MotionPoint; cost: number }> = [];
  for (const radius of [STAND_DISTANCE, 64, 40]) for (let i = 0; i < 16; i++) {
    const theta = angle + i * Math.PI / 8;
    const point = { x: target.x + Math.cos(theta) * radius, y: target.y + Math.sin(theta) * radius };
    if (!world.blocked(point.x, point.y) && world.hasLineOfSight(point, target)) {
      candidates.push({ point, cost: Math.hypot(point.x - from.x, point.y - from.y) + Math.abs(radius - STAND_DISTANCE) * 2 });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);
  // Prefer a nearby point reachable directly; otherwise normal navigation handles the detour.
  for (const candidate of candidates.slice(0, 4)) if (world.canTraverse(from, candidate.point)) return candidate.point;
  return candidates[0]?.point ?? null;
}

/** An explicit interaction intent follows a moving target without restarting a pending search. */
export class InteractionApproach {
  private plannedTarget: MotionPoint | null = null;
  private nextPlanAt = 0;
  constructor(readonly id: string, private resolve: () => MotionPoint | null) {}
  update(world: CollisionWorld, from: MotionPoint, now: number, hasRoute: boolean, planning: boolean): ApproachResult {
    const target = this.resolve();
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return { kind: 'unavailable' };
    if (Math.hypot(from.x - target.x, from.y - target.y) <= NPC_APPROACH_REACH && world.hasLineOfSight(from, target)) return { kind: 'arrived', id: this.id };
    if (hasRoute && this.plannedTarget && (planning || now < this.nextPlanAt || Math.hypot(target.x - this.plannedTarget.x, target.y - this.plannedTarget.y) < 48)) return { kind: 'wait' };
    const point = interactionStandingPoint(world, from, target);
    if (!point) return { kind: 'unreachable' };
    this.plannedTarget = { ...target }; this.nextPlanAt = now + 500;
    return { kind: 'route', point };
  }
}
