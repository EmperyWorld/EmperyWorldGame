import { PNG } from 'pngjs';
import type { MediaJobRequest } from '@empery/shared';

/** Combat sheet: 6 frames × 64px (readable after FLUX downscale). */
export const SHEET_FRAME = 64;
export const SHEET_FRAMES = 6;
export const SHEET_W = SHEET_FRAME * SHEET_FRAMES;
export const SHEET_H = SHEET_FRAME;

const TILE_STRIP_W = 512;
const TILE_STRIP_H = 64;
const TILE = 64;
const TILE_STRIP_COUNT = 8;
export const PROP_SPRITE_SIZE = 512;

const TARGET_SIZE: Partial<Record<MediaJobRequest['profile'], { w: number; h: number }>> = {
  item_icon: { w: 256, h: 256 },
  skill_icon: { w: 256, h: 256 },
  character_sheet: { w: 512, h: 512 },
  portrait_npc: { w: 512, h: 512 },
  dialogue_portrait: { w: 512, h: 768 },
  location_bg: { w: 1024, h: 576 },
};

function clonePng(png: PNG): PNG {
  const out = new PNG({ width: png.width, height: png.height });
  out.data.set(png.data);
  return out;
}

function getPixel(png: PNG, x: number, y: number): [number, number, number, number] {
  const cx = Math.max(0, Math.min(png.width - 1, x));
  const cy = Math.max(0, Math.min(png.height - 1, y));
  const i = (cy * png.width + cx) << 2;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!];
}

function setPixel(png: PNG, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) << 2;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

function sampleBilinear(png: PNG, fx: number, fy: number): [number, number, number, number] {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = fx - x0;
  const ty = fy - y0;
  const c00 = getPixel(png, x0, y0);
  const c10 = getPixel(png, x1, y0);
  const c01 = getPixel(png, x0, y1);
  const c11 = getPixel(png, x1, y1);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  return [
    mix(mix(c00[0], c10[0], tx), mix(c01[0], c11[0], tx), ty),
    mix(mix(c00[1], c10[1], tx), mix(c01[1], c11[1], tx), ty),
    mix(mix(c00[2], c10[2], tx), mix(c01[2], c11[2], tx), ty),
    mix(mix(c00[3], c10[3], tx), mix(c01[3], c11[3], tx), ty),
  ];
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
      const [r, g, b, a] = sampleBilinear(src, fx, fy);
      setPixel(dst, dx + x, dy + y, r, g, b, a);
    }
  }
}

function hasTransparency(png: PNG): boolean {
  let clear = 0;
  const total = png.width * png.height;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i]! < 20) clear++;
  }
  return clear / total > 0.04;
}

function meanRgbOfHighAlpha(png: PNG): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3]! < 200) continue;
    sum += png.data[i]! * 0.299 + png.data[i + 1]! * 0.587 + png.data[i + 2]! * 0.114;
    n++;
  }
  return n ? sum / n : 0;
}

function isBackdropPixel(r: number, g: number, b: number, a: number, threshold: number): boolean {
  if (a < 20) return true;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  return lum < threshold;
}

/**
 * Remove only backdrop pixels connected to the image border.
 * Global luminance cuts punch holes through dark stone / roofs — this keeps interiors solid.
 */
export function removeBorderConnectedBackground(
  png: PNG,
  threshold = 22,
  options?: { force?: boolean },
): PNG {
  if (!options?.force && hasTransparency(png) && meanRgbOfHighAlpha(png) < 40) {
    return clonePng(png);
  }

  const { width: w, height: h } = png;
  const out = clonePng(png);
  const backdrop = new Uint8Array(w * h);
  const queue: number[] = [];

  const tryEnqueue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (backdrop[idx]) return;
    const i = idx << 2;
    if (!isBackdropPixel(out.data[i]!, out.data[i + 1]!, out.data[i + 2]!, out.data[i + 3]!, threshold)) {
      return;
    }
    backdrop[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < w; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryEnqueue(0, y);
    tryEnqueue(w - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % w;
    const y = (idx / w) | 0;
    tryEnqueue(x - 1, y);
    tryEnqueue(x + 1, y);
    tryEnqueue(x, y - 1);
    tryEnqueue(x, y + 1);
  }

  for (let idx = 0; idx < backdrop.length; idx++) {
    if (!backdrop[idx]) continue;
    const i = idx << 2;
    const r = out.data[i]!;
    const g = out.data[i + 1]!;
    const b = out.data[i + 2]!;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    const existingA = out.data[i + 3]!;
    if (lum < threshold || existingA < 20) {
      out.data[i + 3] = 0;
    } else if (lum < threshold + 14) {
      const fade = (lum - threshold) / 14;
      out.data[i + 3] = Math.round(existingA * fade);
    }
  }
  return out;
}

/** Cut near-black backdrop (FLUX solid black bg). Prefer border-connected for props. */
export function removeDarkBackground(png: PNG, threshold = 22): PNG {
  return removeBorderConnectedBackground(png, threshold);
}

/**
 * Heal interior alpha holes left by older global luminance cuts.
 * Transparent pixels not reachable from the border are filled from opaque neighbors.
 */
export function healInteriorAlphaHoles(png: PNG): PNG {
  const { width: w, height: h } = png;
  const out = clonePng(png);
  const exterior = new Uint8Array(w * h);
  const queue: number[] = [];

  const tryEnqueue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (exterior[idx]) return;
    const a = out.data[(idx << 2) + 3]!;
    if (a >= 20) return;
    exterior[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < w; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryEnqueue(0, y);
    tryEnqueue(w - 1, y);
  }
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % w;
    const y = (idx / w) | 0;
    tryEnqueue(x - 1, y);
    tryEnqueue(x + 1, y);
    tryEnqueue(x, y - 1);
    tryEnqueue(x, y + 1);
  }

  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;

  let changed = true;
  let guard = 0;
  while (changed && guard < 8) {
    changed = false;
    guard++;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (exterior[idx]) continue;
        const i = idx << 2;
        if (out.data[i + 3]! >= 20) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (const [dx, dy] of neighbors) {
          const ni = ((y + dy) * w + (x + dx)) << 2;
          if (out.data[ni + 3]! < 200) continue;
          sr += out.data[ni]!;
          sg += out.data[ni + 1]!;
          sb += out.data[ni + 2]!;
          n++;
        }
        if (n < 2) continue;
        out.data[i] = Math.round(sr / n);
        out.data[i + 1] = Math.round(sg / n);
        out.data[i + 2] = Math.round(sb / n);
        out.data[i + 3] = 255;
        changed = true;
      }
    }
  }
  return out;
}

export function normalizeGameSpriteSheet(png: PNG): PNG {
  const out = new PNG({ width: SHEET_W, height: SHEET_H });
  const size = Math.min(png.width, png.height);
  const sx = Math.floor((png.width - size) / 2);
  const sy = Math.floor((png.height - size) / 2);

  for (let f = 0; f < SHEET_FRAMES; f++) {
    blitScaled(png, sx, sy, size, size, out, f * SHEET_FRAME, 0, SHEET_FRAME, SHEET_FRAME);
  }
  return removeDarkBackground(out, 26);
}

export function normalizeTilesetStrip(png: PNG): PNG {
  const out = new PNG({ width: TILE_STRIP_W, height: TILE_STRIP_H });

  if (png.width === TILE_STRIP_W && png.height === TILE_STRIP_H) {
    return clonePng(png);
  }

  if (png.width === 256 && png.height === 64) {
    blitScaled(png, 0, 0, 256, 64, out, 0, 0, 256, 64);
    blitScaled(png, 0, 0, 256, 64, out, 256, 0, 256, 64);
    return out;
  }

  if (png.width >= 256 && png.height >= 256 && png.width === png.height) {
    const halfW = Math.floor(png.width / 2);
    const halfH = Math.floor(png.height / 2);
    const quads: [number, number][] = [
      [0, 0],
      [halfW, 0],
      [0, halfH],
      [halfW, halfH],
    ];
    for (let t = 0; t < 4; t++) {
      const [qx, qy] = quads[t]!;
      blitScaled(png, qx, qy, halfW, halfH, out, t * TILE, 0, TILE, TILE);
      const ox = Math.floor(halfW * 0.12);
      const oy = Math.floor(halfH * 0.12);
      blitScaled(
        png,
        qx + ox,
        qy + oy,
        halfW - ox,
        halfH - oy,
        out,
        (t + 4) * TILE,
        0,
        TILE,
        TILE,
      );
    }
    return out;
  }

  if (png.width >= 512 && png.height >= 256) {
    const cellW = Math.floor(png.width / 4);
    const cellH = Math.floor(png.height / 2);
    for (let t = 0; t < TILE_STRIP_COUNT; t++) {
      const col = t % 4;
      const row = Math.floor(t / 4);
      blitScaled(png, col * cellW, row * cellH, cellW, cellH, out, t * TILE, 0, TILE, TILE);
    }
    return out;
  }

  blitScaled(png, 0, 0, png.width, png.height, out, 0, 0, TILE_STRIP_W, TILE_STRIP_H);
  return out;
}

/** Single seamless ground tile → 64×64 for strip packing. */
export function normalizeTerrainTile(png: PNG): PNG {
  if (png.width === TILE && png.height === TILE) return clonePng(png);
  const size = Math.min(png.width, png.height);
  const sx = Math.floor((png.width - size) / 2);
  const sy = Math.floor((png.height - size) / 2);
  const out = new PNG({ width: TILE, height: TILE });
  blitScaled(png, sx, sy, size, size, out, 0, 0, TILE, TILE);
  return out;
}

export function normalizePropSprite(png: PNG): PNG {
  const size = Math.min(png.width, png.height);
  const square = new PNG({ width: PROP_SPRITE_SIZE, height: PROP_SPRITE_SIZE });
  const sx = Math.floor((png.width - size) / 2);
  const sy = Math.floor((png.height - size) / 2);
  blitScaled(png, sx, sy, size, size, square, 0, 0, PROP_SPRITE_SIZE, PROP_SPRITE_SIZE);
  return healInteriorAlphaHoles(removeDarkBackground(square, 24));
}

/**
 * Ships sit on Flux studio black. Do not inset — a transparent margin isolates
 * the plate from the border flood and leaves a black square in-game.
 * Threshold 10 keeps tarred/near-black hulls; `force` still cuts after some alpha exists.
 */
export function normalizeShipSprite(png: PNG): PNG {
  const size = Math.min(png.width, png.height);
  const square = new PNG({ width: PROP_SPRITE_SIZE, height: PROP_SPRITE_SIZE });
  const sx = Math.floor((png.width - size) / 2);
  const sy = Math.floor((png.height - size) / 2);
  blitScaled(png, sx, sy, size, size, square, 0, 0, PROP_SPRITE_SIZE, PROP_SPRITE_SIZE);
  return healInteriorAlphaHoles(removeBorderConnectedBackground(square, 10, { force: true }));
}

export function normalizeCharacterPortrait(png: PNG): PNG {
  const size = Math.min(png.width, png.height);
  const square = new PNG({ width: 512, height: 512 });
  const sx = Math.floor((png.width - size) / 2);
  const sy = Math.floor((png.height - size) / 2);
  blitScaled(png, sx, sy, size, size, square, 0, 0, 512, 512);
  return square;
}

export function normalizeNpcPortrait(png: PNG): PNG {
  return normalizeCharacterPortrait(png);
}

export function normalizeDialoguePortrait(png: PNG): PNG {
  const targetW = 512;
  const targetH = 768;
  const out = new PNG({ width: targetW, height: targetH });
  const scale = Math.max(targetW / png.width, targetH / png.height);
  const sw = png.width * scale;
  const sh = png.height * scale;
  const sx = (targetW - sw) / 2;
  const sy = (targetH - sh) / 2;
  blitScaled(png, 0, 0, png.width, png.height, out, sx, sy, sw, sh);
  return out;
}

export function normalizeNpcSprite(png: PNG): PNG {
  const size = Math.min(png.width, png.height);
  const square = new PNG({ width: 128, height: 128 });
  const sx = Math.floor((png.width - size) / 2);
  const sy = Math.floor((png.height - size) / 2);
  blitScaled(png, sx, sy, size, size, square, 0, 0, 128, 128);
  return removeDarkBackground(square, 26);
}

function resizeTo(png: PNG, w: number, h: number): PNG {
  if (png.width === w && png.height === h) return clonePng(png);
  const out = new PNG({ width: w, height: h });
  blitScaled(png, 0, 0, png.width, png.height, out, 0, 0, w, h);
  return out;
}

export function postProcessAsset(buffer: Buffer, profile: MediaJobRequest['profile']): Buffer {
  const png = PNG.sync.read(buffer);
  let processed: PNG;
  switch (profile) {
    case 'game_sprite':
      processed = normalizeGameSpriteSheet(png);
      break;
    case 'tileset':
      processed = normalizeTilesetStrip(png);
      break;
    case 'terrain_tile':
      processed = normalizeTerrainTile(png);
      break;
    case 'prop_sprite':
      processed = normalizePropSprite(png);
      break;
    case 'ship_sprite':
      processed = normalizeShipSprite(png);
      break;
    case 'character_sheet':
      processed = normalizeCharacterPortrait(png);
      break;
    case 'portrait_npc':
      processed = normalizeNpcPortrait(png);
      break;
    case 'dialogue_portrait':
      processed = normalizeDialoguePortrait(png);
      break;
    default: {
      const target = TARGET_SIZE[profile];
      processed = target ? resizeTo(png, target.w, target.h) : png;
      break;
    }
  }
  return PNG.sync.write(processed);
}

export function postProcessGameSprite(buffer: Buffer, params: Record<string, string>): Buffer {
  const png = PNG.sync.read(buffer);
  if (params.kind === 'npc') {
    return PNG.sync.write(normalizeNpcSprite(png));
  }
  return PNG.sync.write(normalizeGameSpriteSheet(png));
}

/** Repair already-shipped prop PNGs (interior alpha holes + optional 512 resize). */
export function repairPropSpritePng(buffer: Buffer): Buffer {
  const healed = healInteriorAlphaHoles(PNG.sync.read(buffer));
  if (healed.width === PROP_SPRITE_SIZE && healed.height === PROP_SPRITE_SIZE) {
    return PNG.sync.write(healed);
  }
  return PNG.sync.write(normalizePropSprite(healed));
}
