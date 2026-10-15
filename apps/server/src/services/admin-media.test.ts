import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MEDIA_CATALOG } from '@empery/media';
import { buildAdminMediaStatus } from './admin-media.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('buildAdminMediaStatus', () => {
  it('reports catalog assets missing from disk or manifest', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'empery-admin-media-'));
    tempDirs.push(rootDir);
    const outputDir = join(rootDir, 'generated');
    const first = MEDIA_CATALOG[0]!;
    mkdirSync(join(rootDir, 'content/media'), { recursive: true });
    mkdirSync(join(outputDir, 'assets'), { recursive: true });
    writeFileSync(
      join(rootDir, 'content/media/manifest.json'),
      JSON.stringify({
        assets: {
          [first.id]: { url: `/media/assets/${first.id}.webp` },
        },
      }),
    );
    writeFileSync(join(outputDir, 'assets', `${first.id}.webp`), 'webp');

    const status = buildAdminMediaStatus(rootDir, outputDir);

    expect(status.total).toBe(MEDIA_CATALOG.length);
    expect(status.ready).toBe(1);
    expect(status.missing).toBe(MEDIA_CATALOG.length - 1);
    expect(status.missingAssets.some((asset) => asset.id === first.id)).toBe(false);
    expect(status.categories.find((category) => category.id === 'all')).toEqual({
      id: 'all',
      total: MEDIA_CATALOG.length,
      ready: 1,
      missing: MEDIA_CATALOG.length - 1,
    });
  });
});
