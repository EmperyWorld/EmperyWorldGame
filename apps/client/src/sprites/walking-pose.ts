import type { SpriteFacingRow } from './facing4.js';

/** Contact pose between opposite strides keeps the three drawn poses smooth. */
export const PLAYER_WALK_CYCLE = [1, 2, 3, 2] as const;

export function walkingLegPose(frame: number, facing: SpriteFacingRow) {
  const phase = frame >= 1 && frame <= 3 ? frame - 2 : 0;
  const side = facing === 'side' || facing === 'up-side' || facing === 'down-side';
  return {
    phase,
    x: side ? phase * 2.5 : 0,
    y: side ? phase : phase * 2.5,
    arm: -phase * 1.5,
  };
}
