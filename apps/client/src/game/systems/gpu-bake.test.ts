import { describe, expect, it } from 'vitest';
import {
  bakeRectFromBox,
  bakeRectFromCircle,
  bakeRectFromEllipse,
  canBakeGraphics,
  unionBakeRect,
} from '../../sprites/graphics-bake-limits.js';

describe('canBakeGraphics', () => {
  it('accepts a pond-sized blob and rejects a full Haven map', () => {
    expect(canBakeGraphics(200, 90)).toBe(true);
    expect(canBakeGraphics(5120, 3584)).toBe(false);
    expect(canBakeGraphics(0, 10)).toBe(false);
  });
});

describe('bake rects', () => {
  it('builds AABB from Phaser ellipse/circle/box', () => {
    const e = bakeRectFromEllipse(640, 560, 200, 90, 0);
    expect(e).toEqual({ x: 540, y: 515, width: 200, height: 90 });
    const c = bakeRectFromCircle(10, 20, 5, 0);
    expect(c).toEqual({ x: 5, y: 15, width: 10, height: 10 });
    const box = bakeRectFromBox(0, 0, 10, 8, 0);
    expect(unionBakeRect(box, bakeRectFromBox(4, 2, 10, 8, 0))).toEqual({
      x: 0,
      y: 0,
      width: 14,
      height: 10,
    });
  });
});
