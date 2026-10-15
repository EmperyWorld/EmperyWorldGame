#!/usr/bin/env node
/** Verify the shipped individual resident portraits, not just catalog identities. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ALL_CITIZEN_DEFS, residentAppearance, residentPortraitId } from '../packages/shared/dist/index.js';
import { loadServicesConfig } from '../packages/shared/dist/config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = resolve(root, loadServicesConfig().comfyui.outputDir, 'assets');
const manifest = JSON.parse(await readFile(resolve(root, 'content/media/manifest.json'), 'utf8'));
const fingerprints = new Map();
const profiles = new Set();
const failures = [];

for (let slot = 0; slot < ALL_CITIZEN_DEFS.length; slot++) {
  const id = residentPortraitId(slot);
  try {
    const { id: _identity, seed: _seed, ...appearance } = residentAppearance(slot);
    const profile = JSON.stringify(appearance);
    assert(!profiles.has(profile), 'appearance duplicates another resident');
    profiles.add(profile);
    const entry = manifest.assets?.[id];
    assert.equal(entry?.url, `/media/assets/${id}.webp`, 'missing or incorrect manifest URL');
    assert.equal(entry.profile, 'portrait_npc', 'incorrect media profile');
    const bytes = await readFile(resolve(assetsDir, `${id}.webp`));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'webp', 'incorrect encoding');
    assert.equal(metadata.width, 512, 'incorrect width');
    assert.equal(metadata.height, 512, 'incorrect height');
    const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
    const hash = createHash('sha256').update(pixels).digest('hex');
    assert(!fingerprints.has(hash), `pixels duplicate ${fingerprints.get(hash)}`);
    fingerprints.set(hash, id);
  } catch (error) {
    failures.push(`${id}: ${error.message}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`${fingerprints.size} resident portraits: valid WebP, individual profiles, correct manifest entries, no duplicate pixels.`);
}
