const BAKE_MAX_AREA = 1024 * 1024;

export interface BakeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function canBakeGraphics(width: number, height: number, maxArea = BAKE_MAX_AREA): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width < 4 || height < 4) return false;
  return width * height <= maxArea;
}

/** Phaser `fillCircle(x, y, r)` AABB. Graphics has no GetBounds mixin. */
export function bakeRectFromCircle(x: number, y: number, r: number, pad = 4): BakeRect {
  const rad = Math.max(0, r) + pad;
  return { x: x - rad, y: y - rad, width: rad * 2, height: rad * 2 };
}

/** Phaser `fillEllipse(cx, cy, width, height)` — width/height are full diameters. */
export function bakeRectFromEllipse(cx: number, cy: number, width: number, height: number, pad = 4): BakeRect {
  const hw = width * 0.5 + pad;
  const hh = height * 0.5 + pad;
  return { x: cx - hw, y: cy - hh, width: hw * 2, height: hh * 2 };
}

export function bakeRectFromBox(x: number, y: number, width: number, height: number, pad = 4): BakeRect {
  return { x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2 };
}

export function unionBakeRect(a: BakeRect, b: BakeRect): BakeRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}
