import { describe, expect, it } from 'vitest';
import { layoutNightStars } from './night-stars.js';

describe('layoutNightStars', () => {
  it('is deterministic for the same clock and grows with darkness', () => {
    const a = layoutNightStars(800, 600, 0.5, 0.3);
    const b = layoutNightStars(800, 600, 0.5, 0.3);
    expect(a).toEqual(b);
    expect(a.length).toBe(Math.floor(28 + 0.5 * 40));
    expect(a[0]?.x).toBeGreaterThanOrEqual(0);
    expect(a[0]?.x).toBeLessThanOrEqual(800);
    const denser = layoutNightStars(800, 600, 1, 0.3);
    expect(denser.length).toBeGreaterThan(a.length);
  });
});
