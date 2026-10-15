import { describe, expect, it } from 'vitest';
import {
  havenStreetTilePath,
  havenStreetWorldPath,
  havenStreetWorldPathLaned,
  havenStreetPathLength,
  nearestHavenRoadTile,
  pointAlongHavenStreet,
  havenActorLane,
  nearestWorldPathSegment,
  offsetWorldPathForLane,
  softSeparatePosition,
} from '@empery/shared';

describe('haven street path', () => {
  it('snaps off-road tiles onto the main cross', () => {
    const road = nearestHavenRoadTile(12, 20);
    expect(road[1]).toBeGreaterThanOrEqual(17);
    expect(road[1]).toBeLessThanOrEqual(22);
  });

  it('routes market tile to tenement via boulevard, not a single diagonal', () => {
    const path = havenStreetTilePath([12, 20], [32, 18]);
    expect(path.length).toBeGreaterThan(6);
    expect(path[0]).toEqual([12, 20]);
    expect(path[path.length - 1]).toEqual([32, 18]);
    // Must touch the boulevard band somewhere
    expect(path.some(([, ty]) => ty >= 17 && ty <= 22)).toBe(true);
  });

  it('samples smoothly along the polyline', () => {
    const a = pointAlongHavenStreet(12 * 64 + 32, 20 * 64 + 32, 32 * 64 + 32, 18 * 64 + 32, 0);
    const b = pointAlongHavenStreet(12 * 64 + 32, 20 * 64 + 32, 32 * 64 + 32, 18 * 64 + 32, 1);
    expect(a.x).toBeCloseTo(12 * 64 + 32, 0);
    expect(b.x).toBeCloseTo(32 * 64 + 32, 0);
  });

  it('reuses cached world paths for the same tile endpoints', () => {
    const args = [12 * 64 + 10, 20 * 64 + 10, 32 * 64 + 50, 18 * 64 + 50] as const;
    const first = havenStreetWorldPath(...args);
    const second = havenStreetWorldPath(...args);
    expect(second).toBe(first);
    expect(havenStreetPathLength(...args)).toBeGreaterThan(6 * 64);
  });

  it('preserves exact anchors for different positions inside the same tiles',()=>{
    const a=havenStreetWorldPath(650,650,1290,1290),b=havenStreetWorldPath(670,670,1310,1310);
    expect(a).not.toBe(b);expect(a[0]).toEqual({x:650,y:650});expect(b.at(-1)).toEqual({x:1310,y:1310});
    const lane=havenStreetWorldPathLaned(650,650,1290,1290,1);expect(lane[0]).toEqual(a[0]);expect(lane.at(-1)).toEqual(a.at(-1));
  });
  it('keeps a sampled walker on its current segment instead of skipping the next corner',()=>{
    expect(nearestWorldPathSegment([{x:0,y:0},{x:100,y:0},{x:100,y:100}],80,0)).toBe(0);
    expect(nearestWorldPathSegment([{x:0,y:0},{x:100,y:0},{x:100,y:100}],100,80)).toBe(1);
  });

  it('assigns stable opposite sidewalk lanes', () => {
    expect(havenActorLane(0)).toBe(-1);
    expect(havenActorLane(1)).toBe(1);
    expect(havenActorLane('town_merchant')).toBe(havenActorLane('town_merchant'));
    expect(havenActorLane('a')).not.toBe(havenActorLane('b'));
  });

  it('offsets path onto sidewalk without changing point count', () => {
    const base = havenStreetWorldPath(12 * 64 + 32, 20 * 64 + 32, 40 * 64 + 32, 20 * 64 + 32);
    const left = offsetWorldPathForLane(base, -1, 14);
    const right = offsetWorldPathForLane(base, 1, 14);
    expect(left.length).toBe(base.length);
    expect(right.length).toBe(base.length);
    const mid = Math.floor(base.length / 2);
    expect(Math.hypot(left[mid]!.x - right[mid]!.x, left[mid]!.y - right[mid]!.y)).toBeGreaterThan(10);
    const laned = havenStreetWorldPathLaned(
      12 * 64 + 32,
      20 * 64 + 32,
      40 * 64 + 32,
      20 * 64 + 32,
      -1,
    );
    expect(laned.length).toBe(base.length);
  });

  it('soft-separates overlapping bodies', () => {
    const next = softSeparatePosition(100, 100, [{ x: 105, y: 100 }], { radius: 30, strength: 0.5 });
    expect(next.x).toBeLessThan(100);
    expect(next.y).toBeCloseTo(100, 0);
  });
});
