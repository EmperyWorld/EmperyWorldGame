#!/usr/bin/env tsx
/**
 * Re-encode existing PNGs on disk → WebP (no ComfyUI).
 * Also rewrites content/media/manifest.json URLs to .webp.
 *
 * Usage: pnpm convert:media:webp [--keep-png]
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServicesConfig } from '@empery/shared/config';
import { ASSET_IMAGE_EXT, assetUrl, encodeToWebp } from '@empery/media';
import { packMediaAtlases } from './pack-media-atlases.ts';

const keepPng = process.argv.includes('--keep-png');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = loadServicesConfig();
const assetsDir = join(root, config.comfyui.outputDir, 'assets');
const jobsOutDir = join(root, config.comfyui.outputDir);
const manifestPath = join(root, 'content/media/manifest.json');

async function convertFile(pngPath: string, webpPath: string): Promise<{ inB: number; outB: number }> {
  const raw = readFileSync(pngPath);
  const webp = await encodeToWebp(raw);
  writeFileSync(webpPath, webp);
  return { inB: raw.length, outB: webp.length };
}

async function main(): Promise<void> {
  if (!existsSync(assetsDir)) {
    console.error('No assets dir:', assetsDir);
    process.exit(1);
  }

  const pngs = readdirSync(assetsDir).filter((f) => f.endsWith('.png'));
  console.log(`Converting ${pngs.length} PNG → .${ASSET_IMAGE_EXT} in ${assetsDir}`);
  if (keepPng) console.log('(keeping source PNGs)');

  let ok = 0;
  let failed = 0;
  let inTotal = 0;
  let outTotal = 0;

  for (const file of pngs) {
    const id = file.replace(/\.png$/, '');
    const pngPath = join(assetsDir, file);
    const webpPath = join(assetsDir, `${id}.${ASSET_IMAGE_EXT}`);
    try {
      const { inB, outB } = await convertFile(pngPath, webpPath);
      inTotal += inB;
      outTotal += outB;
      if (!keepPng) unlinkSync(pngPath);
      ok++;
      const pct = inB > 0 ? Math.round((1 - outB / inB) * 100) : 0;
      console.log(`[ok] ${id}  ${(inB / 1024).toFixed(0)}→${(outB / 1024).toFixed(0)} KB (−${pct}%)`);
    } catch (err) {
      failed++;
      console.error(`[fail] ${id}`, err instanceof Error ? err.message : err);
    }
  }

  // Runtime job outputs in outputDir root (not assets/) — convert if any leftover PNG jobs
  if (existsSync(jobsOutDir)) {
    for (const file of readdirSync(jobsOutDir)) {
      if (!file.endsWith('.png')) continue;
      const st = statSync(join(jobsOutDir, file));
      if (!st.isFile()) continue;
      const id = file.replace(/\.png$/, '');
      const pngPath = join(jobsOutDir, file);
      const webpPath = join(jobsOutDir, `${id}.${ASSET_IMAGE_EXT}`);
      try {
        await convertFile(pngPath, webpPath);
        if (!keepPng) unlinkSync(pngPath);
        console.log(`[job] ${id}`);
      } catch {
        /* ignore non-image leftovers */
      }
    }
  }

  // Rewrite manifest URLs
  if (existsSync(manifestPath)) {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      generatedAt?: string;
      assets?: Record<string, { url: string; profile: string; label: string }>;
      atlases?: unknown;
    };
    const assets = parsed.assets ?? {};
    for (const [id, entry] of Object.entries(assets)) {
      const webpOnDisk = existsSync(join(assetsDir, `${id}.${ASSET_IMAGE_EXT}`));
      if (webpOnDisk || entry.url.endsWith('.png')) {
        entry.url = assetUrl(id);
      }
    }
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          assets,
          ...(parsed.atlases ? { atlases: parsed.atlases } : {}),
        },
        null,
        2,
      ),
    );
    console.log(`\nManifest updated: ${manifestPath}`);
  }

  const saved = inTotal - outTotal;
  console.log(
    `\nDone: ${ok} converted, ${failed} failed. ` +
      `${(inTotal / 1024 / 1024).toFixed(1)} → ${(outTotal / 1024 / 1024).toFixed(1)} MB ` +
      `(saved ${(saved / 1024 / 1024).toFixed(1)} MB)`,
  );
  await packMediaAtlases();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
