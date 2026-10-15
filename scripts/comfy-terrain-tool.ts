#!/usr/bin/env tsx
/**
 * Dump / validate ComfyUI terrain workflow helpers for podman `comfyui`.
 *
 * - Writes API-format Flux prompts for terrain_tile into tools/comfyui/
 * - Health-checks http://127.0.0.1:31003 (services.yaml)
 * - Lists tiling-related custom nodes if present
 *
 * Usage:
 *   pnpm tsx scripts/comfy-terrain-tool.ts
 *   pnpm tsx scripts/comfy-terrain-tool.ts --dump-only
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServicesConfig } from '@empery/shared/config';
import {
  buildWorkflowForJob,
  negativePromptFor,
} from '@empery/media';
import type { ServicesConfig } from '@empery/shared';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tools/comfyui');
mkdirSync(outDir, { recursive: true });

const dumpOnly = process.argv.includes('--dump-only');

async function main(): Promise<void> {
  const services = loadServicesConfig();
  const url = services.comfyui.url;

  const samples = [
    {
      id: 'tile_haven_road_a',
      surface:
        'dark grey imperial cobblestone street, small packed stones 12+ across, center wear groove, thin black mortar',
    },
    {
      id: 'tile_haven_plaza_a',
      surface:
        'warm beige sandstone plaza cobbles, irregular small river stones, 12 to 16 stones across width, thin dark mortar',
    },
  ];

  for (const s of samples) {
    const wf = buildWorkflowForJob(services.comfyui as ServicesConfig['comfyui'], {
      profile: 'terrain_tile',
      params: { surface: s.surface, seed: '42' },
    }, s.id);
    const path = join(outDir, `${s.id}.api.json`);
    writeFileSync(path, `${JSON.stringify(wf, null, 2)}\n`);
    console.log('wrote', path);
  }

  writeFileSync(
    join(outDir, 'README.md'),
    `# ComfyUI terrain tools

Container: \`podman ps\` → \`comfyui\` (\`:31003→3000\`).
Models/outputs: \`~/podryad/models/comfyui\`, \`~/podryad/outputs/comfyui\`.

## Batch (preferred)

\`\`\`bash
pnpm --filter @empery/shared build && pnpm --filter @empery/media build
pnpm generate:media:terrain   # tile_haven_* --force + pack strip
\`\`\`

## Scale rule

Each 64px tile must show **≥10–16** cobbles/bricks across — not 2–4 giant slabs.

## API dumps

\`*.api.json\` here are Flux Klein graphs from \`buildMediaWorkflow\` (\`terrain_tile\`).
POST to \`/prompt\` or use \`pnpm generate:media -- --only=tile_haven_\`.

Negative for terrain: ${negativePromptFor('terrain_tile').slice(0, 120)}…
`,
  );

  if (dumpOnly) return;

  try {
    const res = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(5000) });
    console.log('ComfyUI', res.ok ? 'OK' : `HTTP ${res.status}`, url);
  } catch (err) {
    console.error('ComfyUI unreachable', url, err);
    process.exit(1);
  }

  try {
    const info = (await fetch(`${url}/object_info`).then((r) => r.json())) as Record<
      string,
      unknown
    >;
    const tiling = Object.keys(info).filter((k) => /tile|seam/i.test(k));
    console.log('tiling-related nodes:', tiling.slice(0, 24).join(', ') || '(none)');
  } catch {
    console.warn('object_info failed');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
