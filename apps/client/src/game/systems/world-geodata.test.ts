import { describe, expect, it } from 'vitest';
import {
  isWalkableTileGid,
  nudgeFromCollidingCell,
  pullTowardWalkable,
} from './world-geodata.js';

describe('walkable tile GIDs', () => {
  it('treats plaza/road variants as walkable and water/wall as solid', () => {
    expect(isWalkableTileGid(1)).toBe(true);
    expect(isWalkableTileGid(2)).toBe(true);
    expect(isWalkableTileGid(5)).toBe(true);
    expect(isWalkableTileGid(6)).toBe(true);
    expect(isWalkableTileGid(7)).toBe(true);
    expect(isWalkableTileGid(8)).toBe(true);
    expect(isWalkableTileGid(3)).toBe(false);
    expect(isWalkableTileGid(4)).toBe(false);
    expect(isWalkableTileGid(0)).toBe(false);
    expect(isWalkableTileGid(undefined)).toBe(false);
  });
});

describe('nudgeFromCollidingCell', () => {
  it('hops to the nearest walkable neighbour centre', () => {
    const collides = (tx: number, ty: number): boolean => tx === 1 && ty === 1;
    const out = nudgeFromCollidingCell(96, 96, 64, 64, collides);
    expect(out.x).not.toBe(96);
    expect(collides(Math.floor(out.x / 64), Math.floor(out.y / 64))).toBe(false);
  });

  it('leaves a walkable point alone', () => {
    const out = nudgeFromCollidingCell(40, 40, 64, 64, () => false);
    expect(out).toEqual({ x: 40, y: 40 });
  });
});

describe('pullTowardWalkable', () => {
  it('pulls a blocked click toward the player until it is free', () => {
    const blocked = (x: number, _y: number): boolean => x > 80;
    const out = pullTowardWalkable(0, 50, 200, 50, blocked, 20, 20);
    expect(out.x).toBeLessThanOrEqual(80);
    expect(out.y).toBe(50);
  });

  it('keeps an already walkable target', () => {
    expect(pullTowardWalkable(0, 0, 10, 10, () => false)).toEqual({ x: 10, y: 10 });
  });
});
