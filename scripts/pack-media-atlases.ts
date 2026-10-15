#!/usr/bin/env tsx
/**
 * Pack ComfyUI WebPs into Phaser atlases (world per location + HUD).
 * Writes data/generated/atlases/* and merges keys into content/media/manifest.json.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadServicesConfig } from '@empery/shared/config';
import { locationPropIds } from '../apps/client/src/sprites/location-prop-ids.ts';
import {
  leftoverAssetIds,
  phaserHashAtlasJson,
  shelfPack,
  type PackRect,
} from '../apps/client/src/sprites/shelf-pack.ts';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = loadServicesConfig();
const outputDir = join(rootDir, config.comfyui.outputDir);
const assetsDir = join(outputDir, 'assets');
const atlasesDir = join(outputDir, 'atlases');
const manifestPath = join(rootDir, 'content/media/manifest.json');
/** Keep cells at generated prop resolution (512). */
const MAX_WORLD = 16384;
const WORLD_CELL = 512;
const HUD_CELL = 128;
const MAX_HUD = 4096;

interface AtlasRef {
  image: string;
  json: string;
  width: number;
  height: number;
  pack?: string;
  leftover?: string[];
  compressed?: { ASTC?: string; ETC?: string; S3TC?: string };
}

interface ManifestFile {
  generatedAt?: string;
  assets?: Record<string, { url: string; profile: string; label: string }>;
  atlases?: {
    hud?: AtlasRef;
    world?: Record<string, AtlasRef>;
  };
}

function locationIds(): string[] {
  const dir = join(rootDir, 'content/locations');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => name.replace(/\.yaml$/, ''));
}

function hasBin(name: string): boolean {
  const r = spawnSync('which', [name], { encoding: 'utf8' });
  return r.status === 0 && Boolean(r.stdout?.trim());
}

function tryEncodeKtx(imagePath: string, name: string): AtlasRef['compressed'] {
  if (!hasBin('toktx')) return undefined;
  const out: NonNullable<AtlasRef['compressed']> = {};
  const jobs: Array<['ASTC' | 'ETC', string, string[]]> = [
    ['ASTC', `${name}-astc.ktx2`, ['--encode', 'astc', '--astc_blk_d', '6x6', '--assign_oetf', 'srgb']],
    ['ETC', `${name}-etc2.ktx2`, ['--encode', 'etc2', '--assign_oetf', 'srgb']],
  ];
  for (const [fmt, file, extra] of jobs) {
    const dest = join(atlasesDir, file);
    const r = spawnSync('toktx', [...extra, dest, imagePath], { encoding: 'utf8' });
    if (r.status === 0 && existsSync(dest)) {
      out[fmt] = `/media/atlases/${file}`;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function measure(path: string): Promise<{ w: number; h: number } | null> {
  if (!existsSync(path)) return null;
  try {
    const meta = await sharp(path).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 1 || h < 1) return null;
    return { w, h };
  } catch {
    return null;
  }
}

async function packSheet(
  name: string,
  items: Array<{ id: string; path: string }>,
  cell: number,
  maxSize: number,
  atlasKey: string,
): Promise<AtlasRef | null> {
  const rects: PackRect[] = [];
  const paths = new Map<string, string>();
  for (const item of items) {
    const size = await measure(item.path);
    if (!size) continue;
    const w = Math.min(cell, size.w);
    const h = Math.min(cell, size.h);
    rects.push({ id: item.id, w, h });
    paths.set(item.id, item.path);
  }
  if (rects.length === 0) return null;

  let packed = shelfPack(rects, maxSize);
  // Prefer leftovers at full cell size over crushing the whole sheet to 64px.
  if (packed.placed.length === 0 && cell > 128) {
    const mid = rects.map((r) => ({
      id: r.id,
      w: Math.min(128, r.w),
      h: Math.min(128, r.h),
    }));
    packed = shelfPack(mid, maxSize);
  }
  if (packed.placed.length === 0) return null;

  const canvas = sharp({
    create: {
      width: packed.width,
      height: packed.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const composites: sharp.OverlayOptions[] = [];
  for (const frame of packed.placed) {
    const src = paths.get(frame.id);
    if (!src) continue;
    const png = await sharp(src).resize(frame.w, frame.h, { fit: 'fill' }).png().toBuffer();
    composites.push({ input: png, left: frame.x, top: frame.y });
  }

  mkdirSync(atlasesDir, { recursive: true });
  const imageFile = `${name}.webp`;
  const jsonFile = `${name}.json`;
  const packFile = `${name}.pack.json`;
  const imagePath = join(atlasesDir, imageFile);
  await canvas.composite(composites).webp({ quality: 90 }).toFile(imagePath);
  const json = phaserHashAtlasJson(packed.placed, imageFile, packed.width, packed.height);
  writeFileSync(join(atlasesDir, jsonFile), `${JSON.stringify(json)}\n`);
  const imageUrl = `/media/atlases/${imageFile}`;
  const jsonUrl = `/media/atlases/${jsonFile}`;
  writeFileSync(
    join(atlasesDir, packFile),
    `${JSON.stringify({
      [name]: {
        files: [
          {
            type: 'atlas',
            key: atlasKey,
            textureURL: imageUrl,
            atlasURL: jsonUrl,
          },
        ],
      },
    })}\n`,
  );
  if (packed.skipped.length > 0) {
    console.warn(`[atlas ${name}] skipped ${packed.skipped.length}: ${packed.skipped.slice(0, 8).join(', ')}`);
  }
  const compressed = tryEncodeKtx(imagePath, name);
  if (compressed) console.log(`[atlas ${name}] ktx ${Object.keys(compressed).join(',')}`);
  const leftover = packed.skipped.length > 0 ? leftoverAssetIds(packed.skipped) : undefined;
  return {
    image: imageUrl,
    json: jsonUrl,
    pack: `/media/atlases/${packFile}`,
    leftover,
    width: packed.width,
    height: packed.height,
    compressed,
  };
}

export async function packMediaAtlases(options: {locations?: readonly string[]} = {}): Promise<void> {
  if (!existsSync(assetsDir)) {
    console.warn('нет data/generated/assets — пропускаю pack-atlases');
    return;
  }

  let manifest: ManifestFile = { assets: {} };
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestFile;
  }

  const available=locationIds();
  const selected=options.locations ?? available;
  if(selected.some(id=>!available.includes(id)))throw new Error('Unknown atlas location');
  const world: NonNullable<ManifestFile['atlases']>['world'] = options.locations ? {...manifest.atlases?.world} : {};
  for (const loc of selected) {
    const ids = [...locationPropIds(loc)];
    const items = ids
      .map((assetId) => ({
        id: `prop-${assetId}`,
        path: join(assetsDir, `${assetId}.webp`),
      }))
      .filter((item) => existsSync(item.path));
    if (items.length === 0) continue;
    const packed = await packSheet(`world-${loc}`, items, WORLD_CELL, MAX_WORLD, 'world-media-atlas');
    if (packed) {
      world[loc] = packed;
      console.log(`world ${loc}: ${items.length} props → ${packed.width}×${packed.height}`);
    }
  }

  const hudItems: Array<{ id: string; path: string }> = [];
  for (const [id, meta] of Object.entries(manifest.assets ?? {})) {
    if (!id.startsWith('item_') && !id.startsWith('skill_') && !id.startsWith('ui_')) continue;
    const file = join(assetsDir, `${id}.webp`);
    if (!existsSync(file)) continue;
    void meta;
    hudItems.push({ id, path: file });
  }
  const hud = options.locations ? manifest.atlases?.hud : await packSheet('hud', hudItems, HUD_CELL, MAX_HUD, 'hud-atlas');
  if (hud) console.log(`hud: ${hudItems.length} icons → ${hud.width}×${hud.height}`);

  manifest.atlases = { hud: hud ?? undefined, world };
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('manifest atlases updated');
}

const invokedDirect = Boolean(process.argv[1]?.includes('pack-media-atlases'));
if (invokedDirect) {
  const selectedLocations=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
  packMediaAtlases({locations:selectedLocations}).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
