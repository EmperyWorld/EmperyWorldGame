/** Animation speed follows travel speed; stationary breathing keeps its own cadence. */
export function walkCadence(speed: number, referenceSpeed: number): number {
  if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(referenceSpeed) || referenceSpeed <= 0) return 1;
  return Math.max(0.2, Math.min(2.5, speed / referenceSpeed));
}
export const CITY_STEP_DISTANCE = 4;
