import { describe, expect, it } from 'vitest';
import { bustMediaUrl } from '../../media-url.js';

describe('bustMediaUrl', () => {
  it('appends v= once and replaces an existing revision', () => {
    expect(bustMediaUrl('/media/assets/item_x.webp', 't1')).toBe(
      '/media/assets/item_x.webp?v=t1',
    );
    expect(bustMediaUrl('/media/assets/item_x.webp?foo=1', 't1')).toBe(
      '/media/assets/item_x.webp?foo=1&v=t1',
    );
    expect(bustMediaUrl('/media/assets/item_x.webp?v=old', 't2')).toBe(
      '/media/assets/item_x.webp?v=t2',
    );
  });
});
