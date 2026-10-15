import { describe, expect, it } from 'vitest';
import { applyMediaCacheBust } from './media-manifest-cache-bust.js';

describe('applyMediaCacheBust', () => {
  it('versions asset and atlas urls from generatedAt', () => {
    const busted = applyMediaCacheBust({
      generatedAt: '2026-09-16T21:40:50.417Z',
      assets: {
        item_sword: { url: '/media/assets/item_sword.webp', profile: 'item_icon', label: 'Sword' },
      },
      atlases: {
        hud: {
          image: '/media/atlases/hud.webp',
          json: '/media/atlases/hud.json',
          pack: '/media/atlases/hud.pack.json',
          compressed: { ASTC: '/media/atlases/hud-astc.ktx2' },
        },
        world: {
          empery_haven: {
            image: '/media/atlases/world-empery_haven.webp',
            json: '/media/atlases/world-empery_haven.json',
          },
        },
      },
    });

    const revision = String(Date.parse('2026-09-16T21:40:50.417Z'));
    expect(busted.cacheRevision).toBe(revision);
    expect((busted.assets as Record<string, { url: string }>).item_sword.url).toBe(
      `/media/assets/item_sword.webp?v=${revision}`,
    );
    const hud = (busted.atlases as { hud: Record<string, unknown> }).hud;
    expect(hud.image).toBe(`/media/atlases/hud.webp?v=${revision}`);
    expect(hud.json).toBe(`/media/atlases/hud.json?v=${revision}`);
    expect((hud.compressed as { ASTC: string }).ASTC).toBe(
      `/media/atlases/hud-astc.ktx2?v=${revision}`,
    );
  });

  it('replaces an existing v query instead of stacking', () => {
    const busted = applyMediaCacheBust({
      generatedAt: '2026-09-16T21:40:50.417Z',
      assets: {
        a: { url: '/media/assets/a.webp?v=old', profile: 'p', label: 'A' },
      },
    });
    const revision = String(Date.parse('2026-09-16T21:40:50.417Z'));
    expect((busted.assets as Record<string, { url: string }>).a.url).toBe(
      `/media/assets/a.webp?v=${revision}`,
    );
  });
});
