import { describe, expect, it } from 'vitest';
import { clientAssetCacheControl } from './client-asset-cache.js';

describe('clientAssetCacheControl', () => {
  it('pins hashed vite assets and gives maps a short cache', () => {
    expect(clientAssetCacheControl('/assets/index-abc123.js')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(clientAssetCacheControl('/maps/empery_haven.json?v=abc')).toBe('public, max-age=3600');
    expect(clientAssetCacheControl('/index.html')).toBeUndefined();
  });
});
