export const REFERENCE_FRAME_MS = 1000 / 60;

/**
 * Converts a lerp factor tuned for 60 FPS into an exponential factor for the
 * actual delta. Equal elapsed time therefore produces equal smoothing.
 */
export function frameRateIndependentLerpFactor(
  referenceFactor: number,
  deltaMs: number,
  maxDeltaMs = 100,
): number {
  const factor = Math.min(1, Math.max(0, referenceFactor));
  if (factor === 0 || factor === 1) return factor;
  const safeDelta = Number.isFinite(deltaMs)
    ? Math.min(Math.max(0, deltaMs), Math.max(0, maxDeltaMs))
    : REFERENCE_FRAME_MS;
  return 1 - (1 - factor) ** (safeDelta / REFERENCE_FRAME_MS);
}
