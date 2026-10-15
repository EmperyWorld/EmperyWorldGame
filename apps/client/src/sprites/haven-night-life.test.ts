import { describe, expect, it } from 'vitest';
import { havenNightlifeActive } from './haven-nightlife-state.js';

describe('havenNightlifeActive', () => {
  it('uses the authoritative schedule when available', () => {
    expect(havenNightlifeActive(true, 12)).toBe(true);
    expect(havenNightlifeActive(false, 23)).toBe(false);
  });

  it('falls back to the world clock while schedule bootstrap is unavailable', () => {
    expect(havenNightlifeActive(undefined, 23)).toBe(true);
    expect(havenNightlifeActive(undefined, 3)).toBe(true);
    expect(havenNightlifeActive(undefined, 12)).toBe(false);
    expect(havenNightlifeActive(undefined, undefined)).toBe(false);
  });
});
