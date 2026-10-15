import { PNG } from 'pngjs';

function lum(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function sat(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function clonePng(png: PNG): PNG {
  const out = new PNG({ width: png.width, height: png.height });
  out.data.set(png.data);
  return out;
}

function columnFigureMass(png: PNG): Uint32Array {
  const hist = new Uint32Array(png.width);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) << 2;
      const r = png.data[i]!;
      const g = png.data[i + 1]!;
      const b = png.data[i + 2]!;
      if (lum(r, g, b) > 52 || sat(r, g, b) > 32) hist[x]!++;
    }
  }
  return hist;
}

function pickFigureRegion(png: PNG): { sx: number; sy: number; size: number } {
  const hist = columnFigureMass(png);
  const w = png.width;
  const window = Math.floor(w * 0.44);
  let bestX = Math.floor((w - window) / 2);
  let bestScore = 0;
  for (let x = 0; x <= w - window; x++) {
    let score = 0;
    for (let dx = 0; dx < window; dx++) score += hist[x + dx]!;
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  const size = Math.min(window, png.height);
  return {
    sx: bestX,
    sy: Math.floor((png.height - size) / 2),
    size,
  };
}

function blitScaled(
  src: PNG,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dst: PNG,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const fx = sx + ((x + 0.5) * sw) / dw;
      const fy = sy + ((y + 0.5) * sh) / dh;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(src.width - 1, x0 + 1);
      const y1 = Math.min(src.height - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const sample = (px: number, py: number) => {
        const i = (py * src.width + px) << 2;
        return [src.data[i]!, src.data[i + 1]!, src.data[i + 2]!, src.data[i + 3]!] as const;
      };
      const c00 = sample(x0, y0);
      const c10 = sample(x1, y0);
      const c01 = sample(x0, y1);
      const c11 = sample(x1, y1);
      const mix = (a: number, b: number, t: number) => a + (b - a) * t;
      const di = ((dy + y) * dst.width + (dx + x)) << 2;
      dst.data[di] = mix(mix(c00[0], c10[0], tx), mix(c01[0], c11[0], tx), ty);
      dst.data[di + 1] = mix(mix(c00[1], c10[1], tx), mix(c01[1], c11[1], tx), ty);
      dst.data[di + 2] = mix(mix(c00[2], c10[2], tx), mix(c01[2], c11[2], tx), ty);
      dst.data[di + 3] = mix(mix(c00[3], c10[3], tx), mix(c01[3], c11[3], tx), ty);
    }
  }
}

function removeBackdrop(png: PNG): void {
  const w = png.width;
  const h = png.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) << 2;
      const r = png.data[i]!;
      const g = png.data[i + 1]!;
      const b = png.data[i + 2]!;
      const l = lum(r, g, b);
      const s = sat(r, g, b);
      // Bottom caption strip (FLUX title burn-in)
      if (y >= Math.floor(h * 0.86) && l < 200) {
        png.data[i + 3] = 0;
        continue;
      }
      if (l < 36 || (l < 58 && s < 26)) {
        png.data[i + 3] = 0;
      } else if (l < 52 && s < 34) {
        png.data[i + 3] = Math.round(png.data[i + 3]! * ((l - 36) / 16));
      }
    }
  }
}

function alphaBounds(png: PNG): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = png.width;
  let minY = png.height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[((y * png.width + x) << 2) + 3]! < 48) continue;
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return found ? { minX, minY, maxX, maxY } : null;
}

/** Remove FLUX captions/backdrop; keep one figure if model duplicated the subject. */
export function cleanupPortraitCutout(png: PNG, size = 512): PNG {
  let clear = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i]! < 20) clear++;
  }
  if (clear / (png.width * png.height) > 0.4 && png.width === size && png.height === size) {
    return clonePng(png);
  }

  const { sx, sy, size: crop } = pickFigureRegion(png);
  const square = new PNG({ width: size, height: size });
  blitScaled(png, sx, sy, crop, crop, square, 0, 0, size, size);

  const work = clonePng(square);
  removeBackdrop(work);

  const bounds = alphaBounds(work);
  const out = new PNG({ width: size, height: size });
  out.data.fill(0);
  if (!bounds) return out;

  const bw = bounds.maxX - bounds.minX + 1;
  const bh = bounds.maxY - bounds.minY + 1;
  const pad = Math.max(bw, bh) * 0.08;
  let side = Math.max(bw, bh) + pad * 2;
  side = Math.min(side, size * 0.94);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  let srcX = cx - side / 2;
  let srcY = cy - side / 2;
  srcX = Math.max(0, Math.min(size - side, srcX));
  srcY = Math.max(0, Math.min(size - side, srcY));
  const margin = (size - side) / 2;
  blitScaled(work, srcX, srcY, side, side, out, margin, margin, side, side);
  return out;
}
