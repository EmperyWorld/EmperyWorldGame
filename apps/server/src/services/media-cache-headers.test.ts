import { describe, expect, it } from 'vitest';
import {
  MEDIA_MANIFEST_CACHE_CONTROL,
  mediaStaticCacheControl,
} from './media-cache-headers.js';

describe('mediaStaticCacheControl', () => {
  it('gives atlases and assets a short revalidating cache', () => {
    expect(mediaStaticCacheControl('/data/generated/atlases/hud.webp')).toBe(
      'public, max-age=3600, must-revalidate',
    );
    expect(mediaStaticCacheControl('/data/generated/assets/item_sword.webp')).toBe(
      'public, max-age=3600, must-revalidate',
    );
  });

  it('does not pin job portraits or other media leftovers', () => {
    expect(mediaStaticCacheControl('/data/generated/jobs/portrait.png')).toBeUndefined();
    expect(MEDIA_MANIFEST_CACHE_CONTROL).toBe('no-store');
  });
});
