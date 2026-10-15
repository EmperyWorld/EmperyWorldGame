#!/usr/bin/env tsx
/**
 * Pack fine-grain `tile_haven_*` WebPs into `tileset_empery_haven.webp` (512×64).
 * Order matches Tiled GIDs: plazaA, roadA, water, wall, plazaB, plazaC, roadB, roadC.
 *
 * Usage: pnpm pack:terrain -- --location=empery_haven
 *
 * Note: sharp.composite() was silently producing a flat strip here; we pack via raw
 * buffers so each 64×64 cell stays distinct.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadServicesConfig } from '@empery/shared/config';
import { ASSET_IMAGE_EXT, assetUrl } from '@empery/media';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const location =
  process.argv.find((a) => a.startsWith('--location='))?.slice('--location='.length) ??
  'empery_haven';

const TILE = 64;
const STRIP_W = TILE * 8;
const STRIP_H = TILE;

const HAVEN_ORDER = [
  'tile_haven_plaza_a',
  'tile_haven_road_a',
  'tile_haven_water',
  'tile_haven_wall',
  'tile_haven_plaza_b',
  'tile_haven_plaza_c',
  'tile_haven_road_b',
  'tile_haven_road_c',
] as const;

async function main(): Promise<void> {
  if (location !== 'empery_haven') {
    console.error('Only empery_haven pack order is defined for now.');
    process.exit(1);
  }

  const config = loadServicesConfig();
  const assetsDir = join(rootDir, config.comfyui.outputDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });

  const strip = Buffer.alloc(STRIP_W * STRIP_H * 3);
  for (let i = 0; i < HAVEN_ORDER.length; i++) {
    const id = HAVEN_ORDER[i]!;
    const path = join(assetsDir, `${id}.${ASSET_IMAGE_EXT}`);
    if (!existsSync(path)) {
      console.error(`Missing ${path} — run: pnpm generate:media -- --only=tile_haven_ --force`);
      process.exit(1);
    }
    const { data } = await sharp(readFileSync(path))
      .resize(TILE, TILE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let y = 0; y < TILE; y++) {
      data.copy(strip, (y * STRIP_W + i * TILE) * 3, y * TILE * 3, (y + 1) * TILE * 3);
    }
    console.log(`[ok] ${id}`);
  }

  const stripWebp = await sharp(strip, {
    raw: { width: STRIP_W, height: STRIP_H, channels: 3 },
  })
    .webp({ quality: 95, lossless: true })
    .toBuffer();
  const outId = `tileset_${location}`;
  const outPath = join(assetsDir, `${outId}.${ASSET_IMAGE_EXT}`);
  writeFileSync(outPath, stripWebp);
  console.log(`wrote ${outPath} (${stripWebp.length} bytes)`);

  const manifestPath = join(rootDir, 'content/media/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    generatedAt?: string;
    assets: Record<string, { url: string; profile: string; label: string }>;
  };
  manifest.generatedAt = new Date().toISOString();
  manifest.assets[outId] = {
    url: assetUrl(outId),
    profile: 'tileset',
    label: `Tiles ${location} (packed fine strip)`,
  };
  for (const id of HAVEN_ORDER) {
    if (!manifest.assets[id]) {
      manifest.assets[id] = {
        url: assetUrl(id),
        profile: 'terrain_tile',
        label: id,
      };
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('manifest updated');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
