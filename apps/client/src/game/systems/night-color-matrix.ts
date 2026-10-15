/**
 * Overlay blend as a 5×4 ColorMatrix (offset column 0–255 for Phaser Display.ColorMatrix).
 * Also multiplies source brightness so night reads dark even under ADD lamp wash.
 */
export function overlayColorMatrix(color: number, alpha: number, darkness = 0): number[] {
  const a = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0));
  const d = Math.min(1, Math.max(0, Number.isFinite(darkness) ? darkness : 0));
  const rgb = Number.isFinite(color) ? color >>> 0 : 0;
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  // Extra dim on top of tint blend — safe-zone lamps used to leave the city looking like day.
  const dim = 1 - d * 0.42;
  const k = (1 - a) * dim;
  return [k, 0, 0, 0, r * a, 0, k, 0, 0, g * a, 0, 0, k, 0, b * a, 0, 0, 0, 1, 0];
}
