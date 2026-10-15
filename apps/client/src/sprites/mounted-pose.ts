/** Keep legacy idle/attack indices stable while extending the riding cycle. */
export const MOUNT_WALK_FRAMES = [1, 2, 3, 6, 7, 8, 9, 10] as const;
export const MOUNT_IDLE_FRAMES = [0, 5] as const;
export const MOUNT_FRAME_COUNT = 11;

export function mountedFramePose(frame: number) {
  const step = MOUNT_WALK_FRAMES.indexOf(frame as typeof MOUNT_WALK_FRAMES[number]);
  const gait = step < 0 ? 0 : step / MOUNT_WALK_FRAMES.length * Math.PI * 2;
  return {
    gait,
    bob: step >= 0 ? -0.7 + Math.cos(gait * 2) * 0.7 : frame === 4 ? -1 : frame === 5 ? -0.35 : 0,
    sway: step >= 0 ? Math.sin(gait) * 1.2 : frame === 5 ? 0.3 : 0,
    attack: frame === 4,
    tail: Math.sin(gait) * 1.5,
  };
}
