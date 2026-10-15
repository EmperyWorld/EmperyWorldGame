#!/usr/bin/env tsx
/**
 * Fast heal of interior alpha holes + sharp upscale to 512 for prop WebPs.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadServicesConfig } from '@empery/shared/config';

const PROP_SIZE = 512;
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(rootDir, loadServicesConfig().comfyui.outputDir, 'assets');

function healRawRgba(data: Buffer, width: number, height: number): number {
  const exterior = new Uint8Array(width * height);
  const queue: number[] = [];
  const tryEnqueue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (exterior[idx]) return;
    if (data[(idx << 2) + 3]! >= 20) return;
    exterior[idx] = 1;
    queue.push(idx);
  };
  for (let x = 0; x < width; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryEnqueue(0, y);
    tryEnqueue(width - 1, y);
  }
  while (queue.length) {
    const idx = queue.pop()!;
    const x = idx % width;
    const y = (idx / width) | 0;
    tryEnqueue(x - 1, y);
    tryEnqueue(x + 1, y);
    tryEnqueue(x, y - 1);
    tryEnqueue(x, y + 1);
  }

  let filled = 0;
  let changed = true;
  let guard = 0;
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
  while (changed && guard < 6) {
    changed = false;
    guard++;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (exterior[idx]) continue;
        const i = idx << 2;
        if (data[i + 3]! >= 20) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (const [dx, dy] of neighbors) {
          const ni = ((y + dy) * width + (x + dx)) << 2;
          if (data[ni + 3]! < 200) continue;
          sr += data[ni]!;
          sg += data[ni + 1]!;
          sb += data[ni + 2]!;
          n++;
        }
        if (n < 2) continue;
        data[i] = Math.round(sr / n);
        data[i + 1] = Math.round(sg / n);
        data[i + 2] = Math.round(sb / n);
        data[i + 3] = 255;
        filled++;
        changed = true;
      }
    }
  }
  return filled;
}

async function main(): Promise<void> {
  const files = readdirSync(assetsDir).filter((f) => f.startsWith('prop_') && f.endsWith('.webp'));
  let touched = 0;
  let filledTotal = 0;
  for (const file of files) {
    const path = join(assetsDir, file);
    const { data, info } = await sharp(readFileSync(path))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const filled = healRawRgba(data, info.width, info.height);
    filledTotal += filled;
    const webp = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .resize(PROP_SIZE, PROP_SIZE, { fit: 'fill', kernel: 'lanczos3' })
      .webp({ quality: 95, alphaQuality: 100, effort: 4 })
      .toBuffer();
    writeFileSync(path, webp);
    touched++;
    if (touched % 40 === 0 || filled > 0) {
      console.log(`${file}: filled ${filled} (${touched}/${files.length})`);
    }
  }
  console.log(`done: ${touched} props → ${PROP_SIZE}px, filled ${filledTotal} interior holes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
