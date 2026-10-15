/** Canonical amphitheatre geometry used by scheduling, rendering and collision. */
export const HAVEN_STAGE_LAYOUT = { x: 2720, y: 1952, size: 380 } as const;
export const HAVEN_STAGE_SEAT_OFFSETS: readonly (readonly [number, number])[] = [
  [-130, 130], [-100, 133], [-20, 178], [55, 163], [100, 133], [130, 130],
  [-110, 160], [-60, 160], [30, 180], [90, 160], [-60, 190],
];
export function havenStageSeat(index: number, layout: { x: number; y: number; size: number } = HAVEN_STAGE_LAYOUT): { x: number; y: number } {
  if (index === 0) return { x: layout.x, y: layout.y - layout.size * 0.05 };
  const offset = HAVEN_STAGE_SEAT_OFFSETS[index - 1];
  if (!offset) throw new RangeError('Unknown stage seat');
  return { x: layout.x + offset[0] * layout.size / 300, y: layout.y + offset[1] * layout.size / 300 };
}
