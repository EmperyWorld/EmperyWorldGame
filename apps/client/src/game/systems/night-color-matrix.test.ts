import { describe, expect, it } from 'vitest';
import { overlayColorMatrix } from './night-color-matrix.js';

describe('overlayColorMatrix', () => {
  it('is identity when alpha is 0 and darkness is 0', () => {
    expect(overlayColorMatrix(0xff0000, 0)).toEqual([
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
    ]);
  });

  it('lerps toward overlay RGB in the offset column', () => {
    const m = overlayColorMatrix(0x060812, 0.5);
    expect(m[0]).toBe(0.5);
    expect(m[4]).toBeCloseTo(0x06 * 0.5);
    expect(m[9]).toBeCloseTo(0x08 * 0.5);
    expect(m[14]).toBeCloseTo(0x12 * 0.5);
    expect(m[18]).toBe(1);
  });

  it('dims source brightness with darkness even at mid alpha', () => {
    const lit = overlayColorMatrix(0x0a1028, 0.5, 0);
    const dark = overlayColorMatrix(0x0a1028, 0.5, 1);
    expect(dark[0]!).toBeLessThan(lit[0]!);
    expect(dark[0]!).toBeCloseTo(0.5 * (1 - 0.42));
  });
});
