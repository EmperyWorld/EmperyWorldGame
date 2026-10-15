/** Deterministic sett variant + 90° rotation so adjacent dock tiles do not wallpaper. */

/** Mid stone joints — not 0x3a3834 (that reads as a black tile frame). */
export const HAVEN_DOCK_MORTAR = 0x5e5a54;
export const HAVEN_DOCK_STONE = [0x8a847c, 0x7c766e, 0x948e86, 0x706a64, 0x868078, 0x9a948c] as const;

export function dockFillLuminance(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return r * 0.299 + g * 0.587 + b * 0.114;
}

export function dockSettHash(tx: number, ty: number, salt: number): number {
  return Math.abs(Math.imul(tx + 3, 374761393) ^ Math.imul(ty + 5, 668265263) ^ salt);
}

export function chooseHavenDockSett(
  tx: number,
  ty: number,
  variantCount: number,
): { variant: number; rot90: number } {
  const n = Math.max(1, variantCount);
  let variant = dockSettHash(tx, ty, 19) % n;
  let rot90 = dockSettHash(tx, ty, 41) % 4;
  const leftV = dockSettHash(tx - 1, ty, 19) % n;
  const leftR = dockSettHash(tx - 1, ty, 41) % 4;
  const upV = dockSettHash(tx, ty - 1, 19) % n;
  const upR = dockSettHash(tx, ty - 1, 41) % 4;
  if (variant === leftV) {
    variant = n === 1 ? variant : (variant + 1 + (dockSettHash(tx, ty, 53) % (n - 1))) % n;
    if (variant === leftV && n > 1) variant = (leftV + 1) % n;
  }
  if (variant === leftV && rot90 === leftR) rot90 = (rot90 + 1) % 4;
  if (variant === upV) {
    if (n > 1 && variant === leftV) rot90 = (rot90 + 2) % 4;
    else if (n > 1) variant = (upV + 1) % n;
    if (variant === upV && rot90 === upR) rot90 = (rot90 + 1) % 4;
  }
  return { variant, rot90 };
}
