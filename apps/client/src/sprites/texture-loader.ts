import Phaser from 'phaser';
import type { MediaAtlasRef, MediaManifest } from '../api.js';
import type { LocationConfig } from '../scenes/GameScene.js';
import { bustMediaUrl } from '../media-url.js';
import { COMBAT_ATLAS_KEY } from './sprite-factory.js';
import { hasWorldMediaFrame, setFileWorldAtlasLoaded, WORLD_MEDIA_ATLAS_KEY } from './world-media-atlas.js';
import { isMountAtlasKey } from './mount-atlas.js';
import { isGearAtlasKey } from './gear-atlas.js';
import { locationPropIds } from './location-prop-ids.js';
import { isHavenShipHullAsset } from '@empery/shared';
import { applyLight2DPipeline } from './light2d-pipeline.js';

export const SPRITE_FRAME = 64;
export const SPRITE_FRAMES = 6;
export const SHEET_W = SPRITE_FRAME * SPRITE_FRAMES;
export const SHEET_H = SPRITE_FRAME;

/** Prefer GPU-friendly readback path — we call getImageData a lot when normalizing sheets. */
function canvas2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d', { willReadFrequently: true })!;
}

const ENEMY_ASSET: Record<string, string> = {
  goblin: 'sprite_enemy_goblin',
  shadow: 'sprite_enemy_shadow',
  wolf: 'sprite_enemy_wolf',
  cinder: 'sprite_enemy_cinder',
  bone: 'sprite_enemy_bone',
  orc_grunt: 'sprite_enemy_orc_grunt',
};

const NPC_ASSET: Record<string, string> = {
  elder_mira: 'sprite_npc_elder_mira',
  silvan_hermit: 'sprite_npc_silvan_hermit',
  ash_shaman: 'sprite_npc_ash_shaman',
  town_merchant: 'sprite_npc_town_merchant',
  town_innkeeper: 'sprite_npc_town_innkeeper',
  town_innkeeper_day: 'sprite_npc_town_innkeeper_day',
  town_captain: 'sprite_npc_town_captain',
  town_blacksmith: 'sprite_npc_town_blacksmith',
};

const TILESET_THEMES: Record<string, [number, number, number, number]> = {
  starter_grove: [0x4a8050, 0x8a7040, 0x3a6888, 0x2a5030],
  empery_haven: [0xa89878, 0xb8a888, 0x2a5878, 0x4a4850],
  adena_fields: [0x7a9050, 0xc9a860, 0x6a8898, 0x5a6840],
  silverwood: [0x5a7888, 0x6a8070, 0x4a6888, 0x3a5060],
  ash_highlands: [0x6a5a50, 0x8a7060, 0x992211, 0x3a3028],
  shadow_depths: [0x3a3550, 0x4a4060, 0x2a4060, 0x221828],
  suburban_park: [0x4a7050, 0x6a6a68, 0x3a6888, 0x3a5040],
  abandoned_yard: [0x6a6050, 0x8a7860, 0x5a5040, 0x4a4030],
  intersection_district: [0x3a3550, 0x5a5080, 0x6644aa, 0x2a2038],
  signal_block: [0x2a4850, 0x3a6870, 0x228866, 0x1a3040],
  relay_spire: [0x2a4058, 0x3a6080, 0x4488aa, 0x182838],
  static_core: [0x1a4038, 0x2a5860, 0x33aa88, 0x102828],
  chaos_sector: [0x4a2838, 0x6a3048, 0x882244, 0x281018],
  fracture_ridge: [0x402030, 0x5a3040, 0x882244, 0x201018],
  void_scar: [0x381828, 0x502030, 0x882244, 0x180810],
  collapse_fringe: [0x301820, 0x482838, 0x773355, 0x140810],
  citadel_approach: [0x2a1420, 0x402838, 0x883355, 0x120810],
  singularity_citadel: [0x281420, 0x3a2030, 0xaa4477, 0x100810],
  gods_rift: [0x2a2210, 0x3a3020, 0xc09040, 0x100804],
  pantheon_ascent: [0x2e2614, 0x403828, 0xd4a840, 0x120a06],
  godfall_throne: [0x322814, 0x483820, 0xe8c060, 0x100804],
  haven_apartment: [0x8a6a48, 0xa08058, 0x5a4838, 0x2a2218],
  empery_hq: [0x222a35, 0x324050, 0x1e3a4a, 0x121822],
};

function tileNoise(x: number, y: number, seed: number): number {
  return ((x * 374761393 + y * 668265263 + seed * 982451653) ^ (x >> 13)) >>> 0;
}

function drawCobbleTile(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  base: number,
  accent: number,
  seed: number,
): void {
  g.fillStyle(base, 1);
  g.fillRect(ox, 0, 64, 64);
  g.fillStyle(0x000000, 0.06);
  g.fillRect(ox, 0, 64, 64);

  const mortar = 0x3a342c;
  const highlight = Phaser.Display.Color.IntegerToColor(accent).lighten(6).color;
  const shade = Phaser.Display.Color.IntegerToColor(base).darken(14).color;

  // Mid-scale (~7 across) — finer grit becomes moiré/рябь under camera zoom.
  for (let row = 0; row < 8; row++) {
    const y = row * 8;
    const offset = (row % 2) * 4;
    for (let col = -1; col < 9; col++) {
      const x = ox + offset + col * 9;
      const n = tileNoise(col + 5, row, seed) % 100;
      const w = 7 + (n % 3);
      const h = 6 + ((n * 3) % 2);
      const fill = n > 65 ? highlight : n > 35 ? accent : shade;
      g.fillStyle(mortar, 0.4);
      g.fillRect(x, y + 1, w, h);
      g.fillStyle(fill, 1);
      g.fillRect(x + 1, y + 2, w - 2, h - 2);
      g.fillStyle(0xffffff, 0.06);
      g.fillRect(x + 2, y + 2, w - 4, 1);
    }
  }
}

/** Horizontal floorboards for apartment interiors. */
function drawWoodPlankTile(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  base: number,
  accent: number,
  seed: number,
  variant: number,
): void {
  g.fillStyle(base, 1);
  g.fillRect(ox, 0, 64, 64);
  const gap = 0x3a3028;
  const plankH = 10 + (variant % 2);
  let y = 0;
  let row = 0;
  while (y < 64) {
    const h = Math.min(plankH, 64 - y);
    const n = tileNoise(row, seed, variant + 3) % 100;
    const shade = n > 50 ? accent : base;
    g.fillStyle(shade, 1);
    g.fillRect(ox, y, 64, h);
    // grain flecks
    for (let i = 0; i < 4; i++) {
      const gx = 4 + (tileNoise(i, row, seed) % 52);
      const gy = y + 2 + (tileNoise(row, i, seed) % Math.max(1, h - 3));
      g.fillStyle(0x000000, 0.08);
      g.fillRect(ox + gx, gy, 8 + (i % 3), 1);
    }
    g.fillStyle(gap, 0.55);
    g.fillRect(ox, y + h - 1, 64, 1);
    // staggered end joints
    if (row % 2 === 1) {
      const jx = 20 + (tileNoise(row, seed, 9) % 24);
      g.fillStyle(gap, 0.4);
      g.fillRect(ox + jx, y, 1, h);
    }
    y += h;
    row++;
  }
  g.fillStyle(0xffffff, 0.04);
  g.fillRect(ox + 1, 1, 62, 10);
  g.fillStyle(0x000000, 0.07);
  g.fillRect(ox + 1, 52, 62, 10);
}

/** Modern concrete slab grid for high-tech corporate campus. */
function drawTechTile(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  base: number,
  accent: number,
  seed: number,
): void {
  g.fillStyle(base, 1);
  g.fillRect(ox, 0, 64, 64);
  const seam = 0x0e1620;
  g.lineStyle(1, seam, 0.45);
  g.strokeRect(ox, 0, 32, 32);
  g.strokeRect(ox + 32, 0, 32, 32);
  g.strokeRect(ox, 32, 32, 32);
  g.strokeRect(ox + 32, 32, 32, 32);
  g.fillStyle(accent, 0.08);
  g.fillRect(ox + 1, 1, 30, 2);
  g.fillRect(ox + 33, 1, 30, 2);
  g.fillRect(ox + 1, 33, 30, 2);
  g.fillRect(ox + 33, 33, 30, 2);
  for (let py = 2; py < 62; py += 4) {
    for (let px = 2; px < 62; px += 4) {
      const n = tileNoise(px, py, seed) % 100;
      if (n > 60) {
        g.fillStyle(accent, 0.04);
        g.fillRect(ox + px, py, 2, 2);
      }
    }
  }
}

/** Darker packed flagstone for streets — reads apart from plaza cobble. */
function drawRoadTile(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  base: number,
  accent: number,
  seed: number,
): void {
  const deep = Phaser.Display.Color.IntegerToColor(base).darken(18).color;
  const mid = base;
  const lit = Phaser.Display.Color.IntegerToColor(accent).lighten(4).color;
  g.fillStyle(deep, 1);
  g.fillRect(ox, 0, 64, 64);

  for (let row = 0; row < 6; row++) {
    const y = row * 10;
    const offset = (row % 2) * 5;
    for (let col = -1; col < 8; col++) {
      const x = ox + offset + col * 11;
      const n = tileNoise(col + 2, row, seed) % 100;
      const w = 9 + (n % 3);
      const h = 7 + ((n * 5) % 3);
      const fill = n > 55 ? lit : n > 30 ? mid : deep;
      g.fillStyle(0x1a1814, 0.35);
      g.fillRect(x, y + 1, w, h);
      g.fillStyle(fill, 1);
      g.fillRect(x + 1, y + 2, w - 2, h - 2);
    }
  }

  g.fillStyle(0x000000, 0.06);
  g.fillRect(ox, 0, 64, 4);
  g.fillRect(ox, 60, 64, 4);
  g.fillStyle(0xc4a878, 0.04);
  g.fillRect(ox + 22, 10, 20, 44);
}

/** Canal / basin water — not cobble with a blue base (that made vertical “brick stripes”). */
function drawWaterTile(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  base: number,
  accent: number,
  seed: number,
): void {
  g.fillStyle(base, 1);
  g.fillRect(ox, 0, 64, 64);
  g.fillStyle(0x081828, 0.28);
  g.fillRect(ox, 0, 64, 64);
  for (let i = 0; i < 7; i++) {
    const y = 6 + i * 8 + (tileNoise(i, seed, 2) % 3);
    g.fillStyle(accent, 0.1 + (i % 3) * 0.03);
    g.fillEllipse(ox + 12 + (tileNoise(seed, i, 4) % 36), y, 22 + (i % 4) * 3, 5);
  }
  g.fillStyle(0xffffff, 0.07);
  g.fillRect(ox + 2, 4, 60, 3);
  g.fillStyle(0x000000, 0.18);
  g.fillRect(ox + 2, 56, 60, 6);
}

function drawMaterialTile(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  base: number,
  accent: number,
  seed: number,
  opts: {
    wet?: boolean;
    rocky?: boolean;
    cobble?: boolean;
    road?: boolean;
    wood?: boolean;
    woodVariant?: number;
    tech?: boolean;
  } = {},
): void {
  if (opts.tech) {
    drawTechTile(g, ox, base, accent, seed);
    return;
  }
  if (opts.wood) {
    drawWoodPlankTile(g, ox, base, accent, seed, opts.woodVariant ?? 0);
    return;
  }
  if (opts.road) {
    drawRoadTile(g, ox, base, accent, seed);
    return;
  }
  if (opts.cobble) {
    drawCobbleTile(g, ox, base, accent, seed);
    return;
  }
  if (opts.wet) {
    drawWaterTile(g, ox, base, accent, seed);
    return;
  }
  g.fillStyle(base, 1);
  g.fillRect(ox, 0, 64, 64);

  for (let py = 0; py < 64; py += 2) {
    for (let px = 0; px < 64; px += 2) {
      const n = tileNoise(px, py, seed) % 100;
      const alpha = 0.03 + (n / 100) * 0.1;
      g.fillStyle(n > 52 ? accent : 0x000000, alpha);
      g.fillRect(ox + px, py, 2, 2);
    }
  }

  g.fillStyle(0xffffff, 0.05);
  g.fillRect(ox + 1, 1, 62, 18);
  g.fillStyle(0x000000, 0.08);
  g.fillRect(ox + 1, 45, 62, 18);

  if (opts.rocky) {
    g.lineStyle(1, 0x000000, 0.18);
    for (let i = 0; i < 4; i++) {
      const x1 = ox + 6 + (tileNoise(i, seed, 3) % 40);
      const y1 = 8 + (tileNoise(seed, i, 5) % 40);
      g.lineBetween(x1, y1, x1 + 10, y1 + 6);
    }
  }
}

function manifestUrl(manifest: MediaManifest, assetId: string): string | undefined {
  return manifest.assets[assetId]?.url;
}

export function propTextureKey(assetId: string): string {
  return `prop-${assetId}`;
}

function sourceSize(source: CanvasImageSource): { w: number; h: number } {
  if (source instanceof HTMLImageElement) return { w: source.naturalWidth, h: source.naturalHeight };
  if (source instanceof HTMLCanvasElement) return { w: source.width, h: source.height };
  if (source instanceof HTMLVideoElement) return { w: source.videoWidth, h: source.videoHeight };
  return { w: SPRITE_FRAME, h: SPRITE_FRAME };
}

function cutDarkBackground(ctx: CanvasRenderingContext2D, w: number, h: number, threshold = 22): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let clear = 0;
  let hiSum = 0;
  let hiN = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 20) clear++;
    if (d[i + 3]! >= 200) {
      hiSum += d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114;
      hiN++;
    }
  }
  if (clear / (w * h) > 0.04 && hiN && hiSum / hiN < 40) return;

  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114;
    if (lum < threshold) {
      d[i + 3] = 0;
    } else if (lum < threshold + 14) {
      d[i + 3] = Math.round(d[i + 3]! * ((lum - threshold) / 14));
    }
  }
  ctx.putImageData(img, 0, 0);
}

function registerSheetFrames(tex: Phaser.Textures.Texture): void {
  for (let i = 0; i < SPRITE_FRAMES; i++) {
    if (!tex.has(String(i))) {
      tex.add(i, 0, i * SPRITE_FRAME, 0, SPRITE_FRAME, SPRITE_FRAME);
    }
  }
}

interface CombatPose {
  dy: number;
  dx: number;
  scale: number;
  rot: number;
  skewX?: number;
  hurt?: boolean;
}

const COMBAT_POSES: CombatPose[] = [
  { dy: 0, dx: 0, scale: 1, rot: 0 },
  { dy: -2, dx: -1, scale: 1.02, rot: -0.03, skewX: -0.04 },
  { dy: 0, dx: 0, scale: 1, rot: 0 },
  { dy: -2, dx: 1, scale: 1.02, rot: 0.03, skewX: 0.04 },
  { dy: -1, dx: 3, scale: 1.06, rot: 0.08 },
  { dy: 2, dx: -4, scale: 0.96, rot: -0.06, hurt: true },
];

function drawCombatFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  size: number,
  frame: number,
  destX: number,
): void {
  const pose = COMBAT_POSES[frame] ?? COMBAT_POSES[0]!;
  const cx = destX + SPRITE_FRAME / 2;
  const cy = SPRITE_FRAME / 2 + pose.dy;

  ctx.save();
  ctx.translate(cx + pose.dx, cy);
  ctx.rotate(pose.rot);
  if (pose.skewX) ctx.transform(1, 0, pose.skewX, 1, 0, 0);
  ctx.scale(pose.scale, pose.scale);
  ctx.drawImage(source, sx, sy, size, size, -SPRITE_FRAME / 2, -SPRITE_FRAME / 2, SPRITE_FRAME, SPRITE_FRAME);
  ctx.restore();

  if (pose.hurt) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255, 80, 80, 0.35)';
    ctx.fillRect(destX, 0, SPRITE_FRAME, SPRITE_FRAME);
    ctx.restore();
  }
}

function sheetFramesIdentical(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  if (w !== SHEET_W || h !== SHEET_H) return true;
  const a = ctx.getImageData(0, 0, SPRITE_FRAME, h).data;
  for (let f = 1; f < SPRITE_FRAMES; f++) {
    const b = ctx.getImageData(f * SPRITE_FRAME, 0, SPRITE_FRAME, h).data;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
  }
  return true;
}

interface CropRect {
  sx: number;
  sy: number;
  size: number;
}

function findPortraitCrop(ctx: CanvasRenderingContext2D, w: number, h: number): CropRect {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const topSkip = Math.floor(h * 0.11);
  const bottomSkip = Math.floor(h * 0.8);

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = topSkip; y < bottomSkip; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i]!;
      const g = d[i + 1]!;
      const b = d[i + 2]!;
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const isCharacter =
        (lum > 64 && sat > 24) ||
        (lum > 50 && sat > 48) ||
        (r > 95 && g > 75 && b < 95) ||
        (r > 140 && g > 110 && b > 70 && sat > 30);
      if (!isCharacter) continue;
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!found) {
    const size = Math.min(w, h) * 0.72;
    return { sx: (w - size) / 2, sy: h * 0.08, size };
  }

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const pad = Math.max(bw, bh) * 0.14;
  let size = Math.max(bw + pad * 2, bh + pad * 2.2);
  size = Math.min(size, Math.min(w, h) * 0.86);

  const cx = (minX + maxX) / 2;
  let sx = cx - size / 2;
  let sy = minY - pad * 0.95;
  sx = Math.max(0, Math.min(w - size, sx));
  sy = Math.max(0, Math.min(h - size, sy));
  return { sx, sy, size };
}

function findAlphaCentroid(ctx: CanvasRenderingContext2D, w: number, h: number): { x: number; y: number } {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3]! < 48) continue;
      sx += x;
      sy += y;
      n++;
    }
  }
  if (!n) return { x: w / 2, y: h * 0.46 };
  return { x: sx / n, y: sy / n };
}

function cutPortraitBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const textBand = Math.floor(h * 0.84);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i]!;
      const g = d[i + 1]!;
      const b = d[i + 2]!;
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (y >= textBand && lum < 130) {
        d[i + 3] = 0;
        continue;
      }
      if (y < h * 0.09 && lum < 120 && sat < 40) {
        d[i + 3] = 0;
        continue;
      }
      if (lum < 36 || (lum < 56 && sat < 26)) {
        d[i + 3] = 0;
      } else if (lum < 52 && sat < 34) {
        d[i + 3] = Math.round(d[i + 3]! * ((lum - 36) / 16));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function applySoftCircleMask(
  ctx: CanvasRenderingContext2D,
  destX: number,
  frameH: number,
  cx: number,
  cy: number,
): void {
  const r = SPRITE_FRAME * 0.49;
  const grad = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.88, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = grad;
  ctx.fillRect(destX, 0, SPRITE_FRAME, frameH);
  ctx.restore();
}

const PORTRAIT_POSES: CombatPose[] = [
  { dy: 0, dx: 0, scale: 1, rot: 0 },
  { dy: -1, dx: 0, scale: 1.01, rot: 0 },
  { dy: 0, dx: 0, scale: 1, rot: 0 },
  { dy: -1, dx: 0, scale: 1.01, rot: 0 },
  { dy: 0, dx: 1, scale: 1.03, rot: 0 },
  { dy: 1, dx: -2, scale: 0.98, rot: 0, hurt: true },
];

function drawPortraitFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  frame: number,
  destX: number,
): void {
  const pose = PORTRAIT_POSES[frame] ?? PORTRAIT_POSES[0]!;
  const cx = destX + SPRITE_FRAME / 2;
  const cy = SPRITE_FRAME / 2 + pose.dy;

  ctx.save();
  ctx.translate(cx + pose.dx, cy);
  ctx.scale(pose.scale, pose.scale);
  ctx.drawImage(source, -SPRITE_FRAME / 2, -SPRITE_FRAME / 2, SPRITE_FRAME, SPRITE_FRAME);
  ctx.restore();

  if (pose.hurt) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255, 80, 80, 0.35)';
    ctx.fillRect(destX, 0, SPRITE_FRAME, SPRITE_FRAME);
    ctx.restore();
  }
}

function buildPortraitHeroSheet(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const pctx = canvas2d(probe);
  pctx.drawImage(source, 0, 0);
  const sample = pctx.getImageData(0, 0, w, h).data;
  let clear = 0;
  for (let i = 3; i < sample.length; i += 4) if (sample[i]! < 20) clear++;
  const preCut = clear / (w * h) > 0.25;

  const token = document.createElement('canvas');
  token.width = SPRITE_FRAME;
  token.height = SPRITE_FRAME;
  const tctx = canvas2d(token);

  if (preCut) {
    const bounds = findPortraitCrop(pctx, w, h);
    tctx.drawImage(source, bounds.sx, bounds.sy, bounds.size, bounds.size, 0, 0, SPRITE_FRAME, SPRITE_FRAME);
  } else {
    const scratch = document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
    const sctx = canvas2d(scratch);
    sctx.drawImage(source, 0, 0);
    const { sx, sy, size } = findPortraitCrop(sctx, w, h);
    const mid = 256;
    const cropped = document.createElement('canvas');
    cropped.width = mid;
    cropped.height = mid;
    const cctx = canvas2d(cropped);
    cctx.drawImage(scratch, sx, sy, size, size, 0, 0, mid, mid);
    cutPortraitBackground(cctx, mid, mid);
    const centroid = findAlphaCentroid(cctx, mid, mid);
    tctx.drawImage(cropped, 0, 0, mid, mid, 0, 0, SPRITE_FRAME, SPRITE_FRAME);
    applySoftCircleMask(
      tctx,
      0,
      SPRITE_FRAME,
      (centroid.x / mid) * SPRITE_FRAME,
      (centroid.y / mid) * SPRITE_FRAME,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = SHEET_W;
  canvas.height = SHEET_H;
  const ctx = canvas2d(canvas);
  ctx.clearRect(0, 0, SHEET_W, SHEET_H);
  for (let f = 0; f < SPRITE_FRAMES; f++) {
    drawPortraitFrame(ctx, token, f, f * SPRITE_FRAME);
  }
  return canvas;
}

function buildAnimatedCombatSheet(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_W;
  canvas.height = SHEET_H;
  const ctx = canvas2d(canvas);
  ctx.clearRect(0, 0, SHEET_W, SHEET_H);

  const size = Math.min(w, h);
  const sx = (w - size) / 2;
  const sy = (h - size) / 2;

  for (let f = 0; f < SPRITE_FRAMES; f++) {
    drawCombatFrame(ctx, source, sx, sy, size, f, f * SPRITE_FRAME);
  }
  cutDarkBackground(ctx, SHEET_W, SHEET_H, 28);
  return canvas;
}

/** Build 384×64 combat sheet; synthesize walk/attack/hurt if FLUX returned one static pose. */
export function normalizeCombatSheet(scene: Phaser.Scene, key: string): void {
  if (!scene.textures.exists(key)) return;
  const tex = scene.textures.get(key);
  const source = tex.getSourceImage() as CanvasImageSource;
  const { w, h } = sourceSize(source);

  if (w === SHEET_W && h === SHEET_H && tex.frameTotal >= SPRITE_FRAMES) {
    const probe = document.createElement('canvas');
    probe.width = SHEET_W;
    probe.height = SHEET_H;
    const pctx = canvas2d(probe);
    pctx.drawImage(source, 0, 0);
    if (!sheetFramesIdentical(pctx, SHEET_W, SHEET_H)) {
      registerSheetFrames(tex);
      return;
    }
  }

  const canvas = buildAnimatedCombatSheet(source, w, h);
  scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  registerSheetFrames(scene.textures.get(key));
}

/** Race portrait → token sheet (FLUX game_sprite output is unreliable). */
export function normalizePlayerHeroSheet(scene: Phaser.Scene, key: string): void {
  if (!scene.textures.exists(key)) return;
  const tex = scene.textures.get(key);
  const source = tex.getSourceImage() as CanvasImageSource;
  const { w, h } = sourceSize(source);

  const canvas = w > 128 || h > 128 ? buildPortraitHeroSheet(source, w, h) : buildAnimatedCombatSheet(source, w, h);
  scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  registerSheetFrames(scene.textures.get(key));
}

/** NPC / prop: center-crop, resize, remove dark backdrop. */
export function normalizeSquareSprite(scene: Phaser.Scene, key: string, size = 128): void {
  if (!scene.textures.exists(key)) return;
  const tex = scene.textures.get(key);
  const source = tex.getSourceImage() as CanvasImageSource;
  const { w, h } = sourceSize(source);
  if (w === size && h === size && tex.source[0]?.width === size) return;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas2d(canvas);
  const crop = Math.min(w, h);
  const sx = (w - crop) / 2;
  const sy = (h - crop) / 2;
  ctx.drawImage(source, sx, sy, crop, crop, 0, 0, size, size);
  cutDarkBackground(ctx, size, size, 32);

  scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

/** Tileset strip: prefer 8×64 sheet (road/plaza variants). Keep as canvas — CPU TilemapLayer. */
export function normalizeTilesetTexture(scene: Phaser.Scene, key = 'terrain-tiles'): void {
  if (!scene.textures.exists(key)) return;
  const tex = scene.textures.get(key);
  const source = tex.getSourceImage() as CanvasImageSource;
  const { w, h } = sourceSize(source);

  const outW = 512;
  const outH = 64;
  if (w === outW && h === outH) return;
  // Legacy 4-tile strip — pad by repeating into 8 slots.
  if (w === 256 && h === 64) {
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas2d(canvas);
    ctx.drawImage(source, 0, 0);
    ctx.drawImage(source, 256, 0);
    scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas2d(canvas);

  if (w >= 256 && h >= 256) {
    const halfW = w / 2;
    const halfH = h / 2;
    const quads: [number, number][] = [
      [0, 0],
      [halfW, 0],
      [0, halfH],
      [halfW, halfH],
    ];
    for (let t = 0; t < 4; t++) {
      const [qx, qy] = quads[t]!;
      ctx.drawImage(source, qx, qy, halfW, halfH, t * 64, 0, 64, 64);
      ctx.drawImage(source, qx, qy, halfW, halfH, (t + 4) * 64, 0, 64, 64);
    }
  } else {
    ctx.drawImage(source, 0, 0, outW, outH);
  }

  scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

/**
 * @deprecated GPU Image promote raced boot (black ground). Kept for tests/callers;
 * procedural terrain stays on canvas + CPU TilemapLayer.
 */
export function installTerrainImageTexture(
  scene: Phaser.Scene,
  key: string,
  canvas: HTMLCanvasElement,
): Promise<void> {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return Promise.resolve();
}

/** No-op ready check — canvas tilesets are sync. */
export function ensureTerrainImageReady(scene: Phaser.Scene, key = 'terrain-tiles'): Promise<void> {
  void scene;
  void key;
  return Promise.resolve();
}

const normalizedTextureKeys = new Set<string>();
let loadedManifestGeneratedAt: string | undefined;
let lastTilesetLocation: string | null = null;
let loadedWorldAtlasLocation: string | undefined;

function atlasHasFrame(textures: Phaser.Textures.TextureManager, frame: string): boolean {
  if (!textures.exists(WORLD_MEDIA_ATLAS_KEY)) return false;
  return textures.get(WORLD_MEDIA_ATLAS_KEY).has(frame);
}

function queueImage(
  loader: Phaser.Loader.LoaderPlugin,
  key: string,
  url: string,
): void {
  if (loader.textureManager.exists(key)) return;
  if (atlasHasFrame(loader.textureManager, key)) return;
  loader.image(key, url);
}

function queueWorldAtlas(
  loader: Phaser.Loader.LoaderPlugin,
  ref: MediaAtlasRef,
  tagged: (url: string) => string,
): void {
  const json = tagged(ref.json);
  const img = tagged(ref.image);
  const c = ref.compressed;
  if (c && (c.ASTC || c.ETC || c.S3TC)) {
    const urls: Phaser.Types.Loader.FileTypes.CompressedTextureFileConfig = {
      IMG: { textureURL: img, atlasURL: json },
    };
    if (c.ASTC) urls.ASTC = { type: 'KTX', textureURL: tagged(c.ASTC), atlasURL: json };
    if (c.ETC) urls.ETC = { type: 'KTX', textureURL: tagged(c.ETC), atlasURL: json };
    if (c.S3TC) urls.S3TC = { type: 'KTX', textureURL: tagged(c.S3TC), atlasURL: json };
    loader.texture(WORLD_MEDIA_ATLAS_KEY, urls);
    return;
  }
  // load.atlas with ?v=generatedAt. File pack.json URLs are untagged (immutable cache).
  loader.atlas(WORLD_MEDIA_ATLAS_KEY, img, json);
}

function withManifestBust(url: string, bust: string): string {
  return bustMediaUrl(url, bust);
}

/**
 * Drop world textures only when generate:media changed the manifest.
 * Travel keeps the atlas so haven ↔ fields does not re-decode hundreds of WebPs.
 */
export function syncWorldMediaTextures(scene: Phaser.Scene, manifest: MediaManifest): void {
  const generatedAt = manifest.cacheRevision ?? manifest.generatedAt ?? '';
  if (generatedAt === loadedManifestGeneratedAt) return;
  loadedManifestGeneratedAt = generatedAt;
  loadedWorldAtlasLocation = undefined;
  clearWorldMediaTextures(scene);
}

/** @returns true if new standalone textures were normalized (atlas should re-pack). */
export function normalizeLoadedTextures(scene: Phaser.Scene, _playerRace: string): boolean {
  void _playerRace;
  let dirty = false;
  for (const npcId of Object.keys(NPC_ASSET)) {
    const key = `npc-${npcId}`;
    if (!scene.textures.exists(key) || normalizedTextureKeys.has(key)) continue;
    normalizeSquareSprite(scene, key);
    normalizedTextureKeys.add(key);
    dirty = true;
  }
  for (const kind of Object.keys(ENEMY_ASSET)) {
    const key = `enemy-art-${kind}`;
    if (!scene.textures.exists(key) || normalizedTextureKeys.has(key)) continue;
    normalizeCombatSheet(scene, key);
    normalizedTextureKeys.add(key);
  }
  for (const key of scene.textures.getTextureKeys()) {
    if (!key.startsWith('prop-') || normalizedTextureKeys.has(key)) continue;
    // Terrain tiles are full-bleed floors. cutDarkBackground punches mortar into
    // holes and turns dock overlays into a 64px black grid.
    if (key.startsWith('prop-tile_') || key.startsWith('prop-prop_ship_')) {
      normalizedTextureKeys.add(key);
      continue;
    }
    normalizeSquareSprite(scene, key, 256);
    normalizedTextureKeys.add(key);
    dirty = true;
  }
  return dirty;
}

export { packWorldMediaAtlas, hasWorldMediaFrame, WORLD_MEDIA_ATLAS_KEY } from './world-media-atlas.js';

/** Preload ComfyUI PNGs as plain images — normalize in BootScene.create(). */
export function preloadGameTextures(
  loader: Phaser.Loader.LoaderPlugin,
  manifest: MediaManifest,
  location: LocationConfig,
  playerRace: string,
  bust = manifest.generatedAt ?? '0',
): void {
  void playerRace;
  const tagged = (url: string): string => withManifestBust(url, String(bust));

  const worldAtlas = manifest.atlases?.world?.[location.id];
  if (worldAtlas) {
    const hasLoadedAtlasTexture = loader.textureManager.exists(WORLD_MEDIA_ATLAS_KEY);
    const shouldQueueAtlas =
      loadedWorldAtlasLocation !== location.id || !hasLoadedAtlasTexture;
    if (shouldQueueAtlas) {
      if (loader.textureManager.exists(WORLD_MEDIA_ATLAS_KEY)) {
        loader.textureManager.remove(WORLD_MEDIA_ATLAS_KEY);
      }
      for (const key of loader.textureManager.getTextureKeys()) {
        if (key.startsWith('prop-')) loader.textureManager.remove(key);
      }
      queueWorldAtlas(loader, worldAtlas, tagged);
      loadedWorldAtlasLocation = location.id;
      setFileWorldAtlasLoaded(true);
    }
    for (const assetId of worldAtlas.leftover ?? []) {
      const url = manifestUrl(manifest, assetId);
      if (url) queueImage(loader, propTextureKey(assetId), tagged(url));
    }
  } else {
    if (loadedWorldAtlasLocation && loader.textureManager.exists(WORLD_MEDIA_ATLAS_KEY)) {
      loader.textureManager.remove(WORLD_MEDIA_ATLAS_KEY);
    }
    loadedWorldAtlasLocation = undefined;
    setFileWorldAtlasLoaded(false);
    for (const assetId of locationPropIds(location.id)) {
      const url = manifestUrl(manifest, assetId);
      if (url) queueImage(loader, propTextureKey(assetId), tagged(url));
    }
  }

  if (location.backgroundAsset) {
    const bgUrl = manifestUrl(manifest, location.backgroundAsset) ?? location.backgroundUrl;
    if (bgUrl) queueImage(loader, `loc-bg-${location.id}`, tagged(bgUrl));
  } else if (location.backgroundUrl) {
    queueImage(loader, `loc-bg-${location.id}`, tagged(location.backgroundUrl));
  }

  // ComfyUI / packed fine-grain terrain strip (prefer over procedural cobbles).
  const tilesetId = `tileset_${location.id}`;
  const tilesetUrl = manifestUrl(manifest, tilesetId);
  if (tilesetUrl) {
    if (loader.textureManager.exists('terrain-tiles')) {
      loader.textureManager.remove('terrain-tiles');
    }
    queueImage(loader, 'terrain-tiles', tagged(tilesetUrl));
  }

  for (const [npcId, assetId] of Object.entries(NPC_ASSET)) {
    const url = manifestUrl(manifest, assetId);
    if (url) queueImage(loader, `npc-${npcId}`, tagged(url));
  }

  for (const [kind, assetId] of Object.entries(ENEMY_ASSET)) {
    const url = manifestUrl(manifest, assetId);
    if (url) queueImage(loader, `enemy-art-${kind}`, tagged(url));
  }
}

/** Queue standalone fallback images for props missing after atlas preload. */
export function queueMissingLocationPropTextures(
  loader: Phaser.Loader.LoaderPlugin,
  scene: Phaser.Scene,
  manifest: MediaManifest,
  locationId: string,
  bust = manifest.generatedAt ?? '0',
): string[] {
  const tagged = (url: string): string => withManifestBust(url, String(bust));
  const queued: string[] = [];
  for (const assetId of locationPropIds(locationId)) {
    const frame = propTextureKey(assetId);
    if (hasWorldMediaFrame(scene, frame) || scene.textures.exists(frame)) continue;
    const url = manifestUrl(manifest, assetId);
    if (!url) continue;
    queueImage(loader, frame, tagged(url));
    queued.push(assetId);
  }
  return queued;
}

/** Drop cached prop/npc frames so BootScene can reload fresh PNGs after generate:media. */
export function clearWorldMediaTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(WORLD_MEDIA_ATLAS_KEY)) {
    scene.textures.remove(WORLD_MEDIA_ATLAS_KEY);
  }
  for (const key of scene.textures.getTextureKeys()) {
    if (
      key.startsWith('prop-') ||
      key.startsWith('npc-') ||
      key.startsWith('loc-bg-') ||
      key.startsWith('enemy-art-') ||
      key === 'terrain-tiles'
    ) {
      scene.textures.remove(key);
    }
  }
  normalizedTextureKeys.clear();
  lastTilesetLocation = null;
  loadedWorldAtlasLocation = undefined;
  setFileWorldAtlasLoaded(false);
}

/** Prefer ComfyUI / packed strip; procedural only if media missing. */
export function ensureFallbackTileset(scene: Phaser.Scene, locationId: string): Promise<void> {
  if (lastTilesetLocation === locationId && scene.textures.exists('terrain-tiles')) {
    normalizeTilesetTexture(scene, 'terrain-tiles');
    return Promise.resolve();
  }

  // Media preload already put a real sheet on `terrain-tiles`.
  if (scene.textures.exists('terrain-tiles') && lastTilesetLocation !== locationId) {
    const src = scene.textures.get('terrain-tiles').getSourceImage() as CanvasImageSource;
    const { w } = sourceSize(src);
    // Only reuse if it looks like a strip (not a leftover from another system).
    if (w >= 256) {
      lastTilesetLocation = locationId;
      normalizeTilesetTexture(scene, 'terrain-tiles');
      return Promise.resolve();
    }
  }

  if (scene.textures.exists('terrain-tiles')) scene.textures.remove('terrain-tiles');
  lastTilesetLocation = locationId;

  const colors = TILESET_THEMES[locationId] ?? TILESET_THEMES.starter_grove!;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const imperial = locationId === 'empery_haven';
  const apartment = locationId === 'haven_apartment';
  const hq = locationId === 'empery_hq';
  // GID: 1 plazaA, 2 roadA, 3 water, 4 wall, 5 plazaB, 6 plazaC, 7 roadB, 8 roadC
  const tileOpts = apartment
    ? ([
        { wood: true, woodVariant: 0 },
        { wood: true, woodVariant: 1 },
        { wood: true, woodVariant: 2 },
        {},
        { wood: true, woodVariant: 0 },
        { wood: true, woodVariant: 1 },
        { wood: true, woodVariant: 2 },
        {},
      ] as const)
    : imperial
      ? ([
          { cobble: true },
          { road: true },
          { wet: true },
          { rocky: true },
          { cobble: true },
          { cobble: true },
          { road: true },
          { road: true },
        ] as const)
      : hq
        ? ([
            { tech: true },
            { tech: true },
            { tech: true },
            { tech: true },
            { tech: true },
            { tech: true },
            { tech: true },
            { tech: true },
          ] as const)
        : ([
            {},
            { rocky: true },
            { wet: true },
            { rocky: true },
            {},
            { rocky: true },
            {},
            { rocky: true },
          ] as const);

  const plazaBases = [0xa89878, 0xb8a888, 0x2a5878, 0x4a4850, 0x9a8870, 0xc0b090, 0x8a7860, 0xa09078];
  const roadBases = [0x7a7060, 0x6a6050, 0x2a5878, 0x4a4850, 0x9a8870, 0xc0b090, 0x706858, 0x857868];

  for (let i = 0; i < 8; i++) {
    const opts = tileOpts[i]!;
    let base = colors[i % 4]!;
    if (imperial && 'cobble' in opts && opts.cobble) base = plazaBases[i]!;
    if (imperial && 'road' in opts && opts.road) base = roadBases[i]!;
    if (imperial && i === 2) base = 0x2a5878;
    if (imperial && i === 3) base = 0x4a4850;
    const accent = Phaser.Display.Color.IntegerToColor(base).lighten(apartment ? 10 : 14).color;
    drawMaterialTile(g, i * 64, base, accent, i + locationId.length * 17, opts);
  }
  g.generateTexture('terrain-tiles', 512, 64);
  g.destroy();
  return Promise.resolve();
}

export function hasPropTexture(scene: Phaser.Scene, assetId: string): boolean {
  const frame = propTextureKey(assetId);
  return hasWorldMediaFrame(scene, frame) || scene.textures.exists(frame);
}

export function placeProp(
  scene: Phaser.Scene,
  assetId: string,
  x: number,
  y: number,
  size = 80,
  depth = 5,
): Phaser.GameObjects.Image | null {
  const frame = propTextureKey(assetId);
  if (hasWorldMediaFrame(scene, frame)) {
    const img = scene.add
      .image(x, y, WORLD_MEDIA_ATLAS_KEY, frame)
      .setDepth(depth)
      .setDisplaySize(size, size)
      .setOrigin(0.5, 0.72);
    // Light2D shades discarded alpha as black — ships become a black square.
    if (!isHavenShipHullAsset(assetId)) applyLight2DPipeline(img);
    return img;
  }
  if (!scene.textures.exists(frame)) return null;
  const img = scene.add
    .image(x, y, frame)
    .setDepth(depth)
    .setDisplaySize(size, size)
    .setOrigin(0.5, 0.72);
  if (!isHavenShipHullAsset(assetId)) applyLight2DPipeline(img);
  return img;
}

export function combatDisplaySize(scene: Phaser.Scene, textureKey: string): number {
  if (!scene.textures.exists(textureKey)) return 48;
  if (textureKey === COMBAT_ATLAS_KEY) return 48;
  if (textureKey === WORLD_MEDIA_ATLAS_KEY) return 48;
  if (isMountAtlasKey(textureKey)) return 48;
  if (isGearAtlasKey(textureKey)) return 48;
  if (textureKey.startsWith('enemy-art-')) {
    const srcW = scene.textures.get(textureKey).source[0]?.width ?? 0;
    return srcW >= SHEET_W ? 64 : 48;
  }
  const srcW = scene.textures.get(textureKey).source[0]?.width ?? 0;
  return srcW >= SHEET_W ? 64 : 48;
}

export { ENEMY_ASSET, NPC_ASSET };
