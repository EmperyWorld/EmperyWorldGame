import { describe, expect, it, vi } from 'vitest';
import type { MediaManifest } from '../api.js';
import { clearWorldMediaTextures, preloadGameTextures, WORLD_MEDIA_ATLAS_KEY, queueMissingLocationPropTextures } from './texture-loader.js';

vi.mock('phaser', () => ({ default: {} }));

class MockTextureManager {
  readonly keys = new Set<string>();

  exists(key: string): boolean {
    return this.keys.has(key);
  }

  remove(key: string): void {
    this.keys.delete(key);
  }

  getTextureKeys(): string[] {
    return [...this.keys];
  }

  get(_key: string): { has: (_frame: string) => boolean } {
    return { has: () => false };
  }
}

class MockLoader {
  readonly atlasCalls: Array<{ key: string; image: string; json: string }> = [];
  readonly imageCalls: Array<{ key: string; url: string }> = [];
  readonly textureCalls: Array<{ key: string }> = [];

  constructor(public readonly textureManager: MockTextureManager) {}

  atlas(key: string, image: string, json: string): void {
    this.atlasCalls.push({ key, image, json });
    this.textureManager.keys.add(key);
  }

  image(key: string, url: string): void {
    this.imageCalls.push({ key, url });
    this.textureManager.keys.add(key);
  }

  texture(key: string): void {
    this.textureCalls.push({ key });
    this.textureManager.keys.add(key);
  }
}

describe('preloadGameTextures world atlas reload', () => {
  it('requeues world atlas for same location on a fresh game texture manager', () => {
    const tm = new MockTextureManager();
    const scene = { textures: tm } as unknown as { textures: MockTextureManager };
    clearWorldMediaTextures(scene as never);

    const manifest: MediaManifest = {
      generatedAt: 'test',
      assets: {
        loc_bg_haven: { url: '/media/assets/loc_bg_haven.webp', profile: 'p', label: 'bg' },
        prop_tree_oak: { url: '/media/assets/prop_tree_oak.webp', profile: 'p', label: 'tree' },
      },
      atlases: {
        world: {
          empery_haven: {
            image: '/media/atlas/haven.webp',
            json: '/media/atlas/haven.json',
            width: 1024,
            height: 1024,
            leftover: ['prop_tree_oak'],
          },
        },
      },
    };
    const location = {
      id: 'empery_haven',
      mapKey: 'haven_map',
      backgroundAsset: 'loc_bg_haven',
    } as unknown as import('../game/scenes/location-types.js').LocationConfig;

    const loaderA = new MockLoader(new MockTextureManager());
    preloadGameTextures(
      loaderA as never,
      manifest,
      location,
      'human',
      'test',
    );
    expect(loaderA.atlasCalls).toHaveLength(1);
    expect(loaderA.atlasCalls[0]?.key).toBe(WORLD_MEDIA_ATLAS_KEY);

    const loaderB = new MockLoader(new MockTextureManager());
    preloadGameTextures(
      loaderB as never,
      manifest,
      location,
      'human',
      'test',
    );
    expect(loaderB.atlasCalls).toHaveLength(1);
    expect(loaderB.atlasCalls[0]?.key).toBe(WORLD_MEDIA_ATLAS_KEY);
  });

  it('queues standalone prop fallback when atlas frame is missing', () => {
    const tm = new MockTextureManager();
    const scene = { textures: tm } as unknown as { textures: MockTextureManager };
    clearWorldMediaTextures(scene as never);

    const manifest: MediaManifest = {
      generatedAt: 'test',
      assets: {
        prop_city_wall_n: { url: '/media/assets/prop_city_wall_n.webp', profile: 'p', label: 'wall' },
      },
    };
    const loader = new MockLoader(tm);
    const queued = queueMissingLocationPropTextures(
      loader as never,
      scene as never,
      manifest,
      'empery_haven',
      'test',
    );

    expect(queued).toContain('prop_city_wall_n');
    expect(loader.imageCalls.some((call) => call.key === 'prop-prop_city_wall_n')).toBe(true);
  });
});
