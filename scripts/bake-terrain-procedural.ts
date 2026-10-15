#!/usr/bin/env tsx
/**
 * Bake Haven terrain strip (512×64).
 * Mid-scale cobbles (~6–8 across a 64px cell) — fine grit reads as moiré/рябь on zoom.
 *
 * Usage: pnpm bake:terrain:haven
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadServicesConfig } from '@empery/shared/config';
import { ASSET_IMAGE_EXT, assetUrl } from '@empery/media';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TILE = 64;
const COLS = 8;
const W = COLS * TILE;
const H = TILE;

function noise(x: number, y: number, s: number): number {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(s, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return Math.abs(n) % 100;
}

function hexRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function mix(a: number, b: number, t: number): number {
  const [ar, ag, ab] = hexRgb(a);
  const [br, bg, bb] = hexRgb(b);
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

function fill(
  buf: Uint8ClampedArray,
  x0: number,
  y0: number,
  w: number,
  h: number,
  color: number,
  clipOx: number,
): void {
  const [r, g, b] = hexRgb(color);
  const xMin = clipOx;
  const xMax = clipOx + TILE;
  for (let y = 0; y < h; y++) {
    const py = y0 + y;
    if (py < 0 || py >= H) continue;
    for (let x = 0; x < w; x++) {
      const px = x0 + x;
      if (px < xMin || px >= xMax) continue;
      const i = (py * W + px) * 3;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }
}

/** Soft rounded-ish stone with low-contrast mortar (avoids sparkle/рябь). */
function stone(
  buf: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
  fillCol: number,
  mortar: number,
  clipOx: number,
): void {
  fill(buf, x, y, w, h, mortar, clipOx);
  fill(buf, x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2), fillCol, clipOx);
  fill(buf, x + 2, y + 1, Math.max(1, w - 4), 1, mix(fillCol, 0xffffff, 0.12), clipOx);
  fill(buf, x + 2, y + h - 2, Math.max(1, w - 4), 1, mix(fillCol, 0x000000, 0.14), clipOx);
}

function cobble(buf: Uint8ClampedArray, ox: number, base: number, accent: number, seed: number): void {
  fill(buf, ox, 0, TILE, TILE, mix(base, 0x000000, 0.08), ox);
  const mortar = mix(base, 0x2a2824, 0.45);
  const shade = mix(base, 0x000000, 0.18);
  // Brick-bond that wraps so left/right edges match when tiled.
  for (let row = 0; row < 8; row++) {
    const y = row * 8;
    const offset = (row % 2) * 4;
    for (let col = 0; col < 8; col++) {
      const localX = (offset + col * 8) % TILE;
      const n = noise(col + 5, row, seed);
      const w = 7;
      const h = 6;
      const c = n > 65 ? accent : n > 35 ? base : shade;
      stone(buf, ox + localX, y + 1, w, h, c, mortar, ox);
      // wrap fragment on the right edge
      if (localX + w > TILE) {
        stone(buf, ox + localX - TILE, y + 1, w, h, c, mortar, ox);
      }
    }
  }
}

function road(buf: Uint8ClampedArray, ox: number, base: number, accent: number, seed: number): void {
  fill(buf, ox, 0, TILE, TILE, mix(base, 0x000000, 0.12), ox);
  const mortar = mix(base, 0x1a1814, 0.5);
  const deep = mix(base, 0x000000, 0.28);
  for (let row = 0; row < 6; row++) {
    const y = row * 10 + 1;
    const offset = (row % 2) * 5;
    for (let col = 0; col < 6; col++) {
      const localX = (offset + col * 10) % TILE;
      const n = noise(col + 2, row, seed);
      const w = 9;
      const h = 8;
      const c = n > 55 ? accent : n > 30 ? base : deep;
      stone(buf, ox + localX, y, w, h, c, mortar, ox);
      if (localX + w > TILE) {
        stone(buf, ox + localX - TILE, y, w, h, c, mortar, ox);
      }
    }
  }
}

function water(buf: Uint8ClampedArray, ox: number): void {
  fill(buf, ox, 0, TILE, TILE, 0x1a3858, ox);
  for (let i = 0; i < 5; i++) {
    const y = 8 + i * 11;
    const n = noise(i, 3, 9);
    fill(buf, ox + 6 + (n % 16), y, 28 + (n % 10), 3, 0x2a5880, ox);
  }
  fill(buf, ox, 3, TILE, 4, mix(0x1a3858, 0xffffff, 0.08), ox);
  fill(buf, ox, 56, TILE, 6, mix(0x1a3858, 0x000000, 0.2), ox);
}

function wall(buf: Uint8ClampedArray, ox: number): void {
  fill(buf, ox, 0, TILE, TILE, 0x3a3838, ox);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const n = noise(col, row, 44);
      const c = n > 50 ? 0x4a4848 : 0x2e2c2c;
      const localX = (col * 13 + (row % 2) * 6) % TILE;
      stone(buf, ox + localX, row * 12 + 2, 11, 10, c, 0x221f1f, ox);
      if (localX + 11 > TILE) {
        stone(buf, ox + localX - TILE, row * 12 + 2, 11, 10, c, 0x221f1f, ox);
      }
    }
  }
}

async function main(): Promise<void> {
  const buf = new Uint8ClampedArray(W * H * 3);
  cobble(buf, 0, 0xa89878, 0xb8a888, 11);
  road(buf, 1 * TILE, 0x6a6050, 0x7a7060, 22);
  water(buf, 2 * TILE);
  wall(buf, 3 * TILE);
  cobble(buf, 4 * TILE, 0xb0a090, 0xc0b0a0, 33);
  cobble(buf, 5 * TILE, 0x9a8a70, 0xaa9a80, 44);
  road(buf, 6 * TILE, 0x5a5448, 0x6a6458, 55);
  road(buf, 7 * TILE, 0x706858, 0x807868, 66);

  const config = loadServicesConfig();
  const assetsDir = join(root, config.comfyui.outputDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });

  // Individual cells first — so pack:terrain / admin regen can't silently reintroduce Comfy junk.
  const cellIds = [
    'tile_haven_plaza_a',
    'tile_haven_road_a',
    'tile_haven_water',
    'tile_haven_wall',
    'tile_haven_plaza_b',
    'tile_haven_plaza_c',
    'tile_haven_road_b',
    'tile_haven_road_c',
  ] as const;
  for (let i = 0; i < COLS; i++) {
    const cell = Buffer.alloc(TILE * TILE * 3);
    for (let y = 0; y < TILE; y++) {
      const src = (y * W + i * TILE) * 3;
      cell.set(buf.subarray(src, src + TILE * 3), y * TILE * 3);
    }
    const cellWebp = await sharp(cell, { raw: { width: TILE, height: TILE, channels: 3 } })
      .webp({ quality: 95, lossless: true })
      .toBuffer();
    writeFileSync(join(assetsDir, `${cellIds[i]}.${ASSET_IMAGE_EXT}`), cellWebp);
  }

  const webp = await sharp(Buffer.from(buf), { raw: { width: W, height: H, channels: 3 } })
    .webp({ quality: 95, lossless: true })
    .toBuffer();

  const outId = 'tileset_empery_haven';
  const outPath = join(assetsDir, `${outId}.${ASSET_IMAGE_EXT}`);
  writeFileSync(outPath, webp);
  console.log('wrote', outPath, webp.length, 'bytes +', cellIds.length, 'cells');

  const manifestPath = join(root, 'content/media/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    generatedAt?: string;
    assets: Record<string, { url: string; profile: string; label: string }>;
  };
  manifest.generatedAt = new Date().toISOString();
  manifest.assets[outId] = {
    url: assetUrl(outId),
    profile: 'tileset',
    label: 'Tiles empery haven (procedural mid-scale cobble)',
  };
  for (const id of cellIds) {
    manifest.assets[id] = {
      url: assetUrl(id),
      profile: 'terrain_tile',
      label: id,
    };
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('manifest updated', manifest.generatedAt);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
