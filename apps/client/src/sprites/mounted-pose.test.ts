import { describe, expect, it } from 'vitest';
import { MOUNT_FRAME_COUNT, MOUNT_IDLE_FRAMES, MOUNT_WALK_FRAMES, mountedFramePose } from './mounted-pose.js';
describe('mounted frame layout and gait', () => {
  it('preserves the attack frame and keeps every animation inside the atlas strip', () => {
    expect(mountedFramePose(4).attack).toBe(true);
    for (const frame of [...MOUNT_IDLE_FRAMES, ...MOUNT_WALK_FRAMES]) {
      expect(frame).toBeLessThan(MOUNT_FRAME_COUNT);
      expect(mountedFramePose(frame).attack).toBe(false);
    }
  });
  it('covers a complete evenly spaced cycle without tail excursions outside the sprite cell', () => {
    const poses = MOUNT_WALK_FRAMES.map(mountedFramePose);
    expect(new Set(poses.map(p => p.gait)).size).toBe(8);
    for (let i = 0; i < poses.length; i++) {
      expect(poses[i]!.gait).toBeCloseTo(i * Math.PI / 4);
      expect(Math.abs(poses[i]!.tail)).toBeLessThanOrEqual(1.5);
      expect(poses[i]!.bob).toBeGreaterThanOrEqual(-1.4);
    }
  });
});
