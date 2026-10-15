import { describe, expect, it } from 'vitest';
import { hudAtlasBackgroundStyle } from '../../hud-atlas-style.js';

describe('hudAtlasBackgroundStyle', () => {
  it('scales a 64px frame on a 256×64 strip (2nd cell) via % position', () => {
    const s = hudAtlasBackgroundStyle({ x: 64, y: 0, w: 64, h: 64 }, 256, 64);
    expect(s.backgroundSize).toBe('400% 100%');
    // 64 / (256 - 64) * 100 = 33.333…%
    expect(s.backgroundPosition).toBe(`${(64 / 192) * 100}% 0%`);
  });

  it('keeps shelf pad=2 frames visible (not empty)', () => {
    const s = hudAtlasBackgroundStyle({ x: 2, y: 2, w: 64, h: 64 }, 2048, 860);
    expect(s.backgroundSize).toBe(`${(2048 / 64) * 100}% ${(860 / 64) * 100}%`);
    expect(s.backgroundPosition).toBe(`${(2 / (2048 - 64)) * 100}% ${(2 / (860 - 64)) * 100}%`);
  });

  it('pins origin frame at 0% 0%', () => {
    const s = hudAtlasBackgroundStyle({ x: 0, y: 0, w: 64, h: 64 }, 2048, 860);
    expect(s.backgroundPosition).toBe('0% 0%');
  });
});
