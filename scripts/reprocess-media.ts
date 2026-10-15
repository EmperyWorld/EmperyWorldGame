#!/usr/bin/env tsx
/** Re-process existing assets on disk (fix wrong sizes / backgrounds without ComfyUI), then encode WebP. */
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServicesConfig } from '@empery/shared/config';
import {
  MEDIA_CATALOG,
  postProcessAsset,
  postProcessGameSprite,
  encodeToWebp,
  decodeToPng,
  ASSET_IMAGE_EXT,
} from '@empery/media';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = loadServicesConfig();
const assetsDir = join(root, config.comfyui.outputDir, 'assets');
const byId = new Map(MEDIA_CATALOG.map((s) => [s.id, s]));

async function main(): Promise<void> {
  if (!existsSync(assetsDir)) {
    console.error('No assets dir:', assetsDir);
    process.exit(1);
  }

  const files = readdirSync(assetsDir).filter(
    (f) => f.endsWith('.png') || f.endsWith(`.${ASSET_IMAGE_EXT}`),
  );
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

  let fixed = 0;
  for (const file of files) {
    const id = file.replace(/\.(png|webp)$/, '');
    const spec = byId.get(id);
    if (!spec) continue;
    if (only && !id.startsWith(only) && !id.includes(only)) continue;
    if (
      spec.profile !== 'game_sprite' &&
      spec.profile !== 'tileset' &&
      spec.profile !== 'prop_sprite' &&
      spec.profile !== 'ship_sprite' &&
      spec.profile !== 'item_icon' &&
      spec.profile !== 'skill_icon' &&
      spec.profile !== 'character_sheet' &&
      spec.profile !== 'portrait_npc' &&
      spec.profile !== 'location_bg'
    ) {
      continue;
    }

    const path = join(assetsDir, file);
    const pngIn = await decodeToPng(readFileSync(path));
    const processed =
      spec.profile === 'game_sprite'
        ? postProcessGameSprite(pngIn, spec.params)
        : postProcessAsset(pngIn, spec.profile);
    const out = await encodeToWebp(processed);
    const outPath = join(assetsDir, `${id}.${ASSET_IMAGE_EXT}`);
    writeFileSync(outPath, out);
    if (file.endsWith('.png') && existsSync(path)) unlinkSync(path);
    console.log('[fix]', id);
    fixed++;
  }

  console.log(`\nDone: ${fixed} files updated in ${assetsDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
