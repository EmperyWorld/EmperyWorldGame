/** 8-way facing for top-down sprites. Left* = row art + flipX. */
export type Facing8 =
  | 'down'
  | 'up'
  | 'left'
  | 'right'
  | 'down-left'
  | 'down-right'
  | 'up-left'
  | 'up-right';

/** @deprecated use Facing8 */
export type Facing4 = Facing8;

/** Atlas/art row (left diagonals/side reuse right-facing art + flip). */
export type SpriteFacingRow = 'down' | 'side' | 'up' | 'down-side' | 'up-side';

export function facingRow(facing: Facing8): SpriteFacingRow {
  switch (facing) {
    case 'up':
      return 'up';
    case 'down':
      return 'down';
    case 'left':
    case 'right':
      return 'side';
    case 'up-left':
    case 'up-right':
      return 'up-side';
    case 'down-left':
    case 'down-right':
      return 'down-side';
  }
}

export function facingNeedsFlipX(facing: Facing8): boolean {
  return facing === 'left' || facing === 'up-left' || facing === 'down-left';
}

const SECTOR_FACING: Facing8[] = [
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right',
];

/**
 * Pick 8-way facing from a movement (or aim) vector.
 * Uses 45° sectors (screen y grows downward). Returns null if nearly stationary.
 */
export function facingFromDelta(dx: number, dy: number, deadzone = 0.35): Facing8 | null {
  if (Math.abs(dx) < deadzone && Math.abs(dy) < deadzone) return null;
  // atan2(dy,dx): 0 = right, π/2 = down, ±π = left, -π/2 = up
  const angle = Math.atan2(dy, dx);
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return SECTOR_FACING[sector]!;
}
