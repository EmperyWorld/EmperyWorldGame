import { describe, expect, it } from 'vitest';
import { PLAYER_WALK_CYCLE, walkingLegPose } from './walking-pose.js';
describe('walking body poses', () => {
  it('inserts contact between opposing strides without changing atlas frame IDs', () => {
    expect(PLAYER_WALK_CYCLE).toEqual([1, 2, 3, 2]);
    expect(PLAYER_WALK_CYCLE.map(frame => walkingLegPose(frame, 'down').phase)).toEqual([-1, 0, 1, 0]);
  });
  it.each(['down', 'up'] as const)('walks %s with feet under the hips rather than widening the stance', facing => {
    for (const frame of PLAYER_WALK_CYCLE) expect(walkingLegPose(frame, facing).x).toBe(0);
    expect(walkingLegPose(1, facing).y).toBe(-walkingLegPose(3, facing).y);
    expect(walkingLegPose(1, facing).arm).toBe(-walkingLegPose(3, facing).arm);
  });
  it.each(['side', 'up-side', 'down-side'] as const)('uses bounded profile steps for %s', facing => {
    for (const frame of PLAYER_WALK_CYCLE) expect(Math.abs(walkingLegPose(frame, facing).x)).toBeLessThanOrEqual(2.5);
  });
  it.each([0, 4, 5])('does not introduce stride into idle, attack or hurt pose %s', frame => {
    expect(walkingLegPose(frame, 'down').phase).toBe(0);
  });
});
