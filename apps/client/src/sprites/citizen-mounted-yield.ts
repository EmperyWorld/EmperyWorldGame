export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * Returns both perpendicular escape points, preferring the citizen's stable
 * sidewalk lane. Collision-aware callers can fall back to the opposite side.
 */
export function mountedYieldCandidates(
  origin: WorldPoint,
  playerDelta: WorldPoint,
  lane: -1 | 1,
  distance = 18,
): readonly [WorldPoint, WorldPoint] {
  const length = Math.hypot(playerDelta.x, playerDelta.y);
  const nx = length > 0.001 ? playerDelta.x / length : 0;
  const ny = length > 0.001 ? playerDelta.y / length : 1;
  const offsetX = -ny * lane * distance;
  const offsetY = nx * lane * distance;
  return [
    { x: origin.x + offsetX, y: origin.y + offsetY },
    { x: origin.x - offsetX, y: origin.y - offsetY },
  ];
}
