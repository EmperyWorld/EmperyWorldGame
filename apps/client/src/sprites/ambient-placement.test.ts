import { describe, expect, it } from 'vitest';
import { ambientPatrolPlacement } from './ambient-placement.js';
import { havenScene } from './haven-navigation.test-fixture.js';
import { resolveNpcAnchor } from './npc-anchor.js';
import { resolveNpcHomeEntrance } from './npc-home-entrance.js';

describe('stationary resident roles', () => {
  it.each([1, 2, 4, 5])('honours explicit zero speed regardless of definition index %s', index => {
    const point = { x: 100, y: 200 };
    const patrol = ambientPatrolPlacement(havenScene(), { look: 'human', tiles: [[1, 3], [2, 3]], speed: 0 }, index,
      [point, { x: 150, y: 200 }]);
    expect(patrol).toMatchObject({ path: [point], speed: 0, sitter: true });
  });
  it('does not invent a world origin when a route is empty', () => {
    expect(ambientPatrolPlacement(havenScene(), { look: 'human', tiles: [] }, 1, []).path).toEqual([]);
  });
});

describe('invalid world anchors', () => {
  it.each([NaN, Infinity, -Infinity])('rejects nonfinite coordinate %s before collision lookup', coordinate => {
    const scene = {} as Phaser.Scene;
    expect(resolveNpcAnchor(scene, coordinate, 0)).toBeNull();
    expect(resolveNpcAnchor(scene, 0, coordinate)).toBeNull();
    expect(resolveNpcHomeEntrance(scene, coordinate, 0)).toBeNull();
    expect(resolveNpcHomeEntrance(scene, 0, coordinate)).toBeNull();
  });
});
