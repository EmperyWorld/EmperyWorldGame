import { describe, expect, it } from 'vitest';
import {
  HAVEN_APARTMENT_DOOR,
  HAVEN_APARTMENT_STREET,
  HAVEN_CHAR_DISPLAY_SIZE,
  HAVEN_HQ_GATE,
  HAVEN_HQ_STREET,
  HAVEN_MAP_TILES_H,
  HAVEN_MAP_TILES_W,
  HAVEN_PROP_ORIGIN_Y,
  HAVEN_TILE_SIZE,
  havenCharSpriteAabb,
  havenEllipseAabb,
  havenMapWorldSize,
  havenPropSpriteAabb,
  havenSnapLeakedIndoorPose,
  havenTileAabb,
  havenTravelPadAabb,
  havenWorldFromTile,
  isLeakedApartmentPoseOnHaven,
  isLeakedHqPoseOnHaven,
  worldToHavenTile,
} from '@empery/shared';

describe('Haven coordinate algebra (layout c() / Phaser origins)', () => {
  it('tile center matches layout c(tx,ty) = [tx*64+32, ty*64+32]', () => {
    expect(havenWorldFromTile(14, 11)).toEqual({ x: 928, y: 736 });
    expect(havenWorldFromTile(64, 40)).toEqual({ x: 4128, y: 2592 });
    expect(havenWorldFromTile(40, 20)).toEqual({ x: 2592, y: 1312 });
  });

  it('inverse is floor(world/64) with no Y-flip', () => {
    expect(worldToHavenTile(928, 736)).toEqual([14, 11]);
    expect(worldToHavenTile(927, 735)).toEqual([14, 11]);
    expect(worldToHavenTile(0, 0)).toEqual([0, 0]);
    expect(worldToHavenTile(63, 63)).toEqual([0, 0]);
    expect(worldToHavenTile(64, 64)).toEqual([1, 1]);
  });

  it('map is 120×84 tiles = 7680×5376 px', () => {
    expect(HAVEN_MAP_TILES_W).toBe(120);
    expect(HAVEN_MAP_TILES_H).toBe(84);
    expect(havenMapWorldSize()).toEqual({ w: 7680, h: 5376 });
  });

  it('tile AABB is NW-inclusive SE-exclusive', () => {
    expect(havenTileAabb(14, 11)).toEqual({ L: 896, R: 960, T: 704, B: 768 });
  });

  it('prop origin 0.72 puts the facade north of the stored point', () => {
    expect(HAVEN_PROP_ORIGIN_Y).toBe(0.72);
    const box = havenPropSpriteAabb(1000, 1000, 100);
    expect(box.L).toBe(950);
    expect(box.R).toBe(1050);
    expect(box.T).toBe(928);
    expect(box.B).toBe(1028);
  });

  it('character AABB uses display 48 and origin 0.55', () => {
    expect(HAVEN_CHAR_DISPLAY_SIZE).toBe(48);
    const box = havenCharSpriteAabb(928, 736);
    expect(box.L).toBe(928 - 24);
    expect(box.R).toBe(928 + 24);
    expect(box.T).toBe(736 - 48 * 0.55);
    expect(box.B).toBe(736 + 48 * 0.45);
  });

  it('fillEllipse AABB is centered (not top-left)', () => {
    expect(havenEllipseAabb(100, 200, 40, 20)).toEqual({ L: 80, R: 120, T: 190, B: 210 });
  });

  it('travel pad is a rectangle at (zone.x, zone.y+40), not YAML circle', () => {
    const pad = havenTravelPadAabb(4128, 2592, 56);
    const w = 56 * 1.6;
    const h = 56 * 1.1;
    expect(pad.L).toBeCloseTo(4128 - w / 2);
    expect(pad.R).toBeCloseTo(4128 + w / 2);
    expect(pad.T).toBeCloseTo(2592 + 40 - h / 2);
    expect(pad.B).toBeCloseTo(2592 + 40 + h / 2);
    expect(HAVEN_TILE_SIZE).toBe(64);
  });
});

describe('apartment door vs leaked indoor pose', () => {
  it('door is c(16,45) and street exit is c(17,46)', () => {
    expect(HAVEN_APARTMENT_DOOR).toEqual({ x: 1056, y: 2912 });
    expect(HAVEN_APARTMENT_STREET).toEqual({ x: 1120, y: 2976 });
  });

  it('flags apartment indoor coords that used to land in the garrison', () => {
    expect(isLeakedApartmentPoseOnHaven(640, 780)).toBe(true);
    expect(isLeakedApartmentPoseOnHaven(640, 580)).toBe(true);
    expect(isLeakedApartmentPoseOnHaven(928, 736)).toBe(false);
    expect(isLeakedApartmentPoseOnHaven(1056, 3040)).toBe(false);
  });
});

describe('HQ gate vs leaked indoor pose', () => {
  it('gate is c(64,39) and street exit is c(63,42)', () => {
    expect(HAVEN_HQ_GATE).toEqual({ x: 4128, y: 2528 });
    expect(HAVEN_HQ_STREET).toEqual({ x: 4064, y: 2720 });
    expect(HAVEN_HQ_STREET.y).toBeGreaterThan(HAVEN_HQ_GATE.y);
  });

  it('flags HQ indoor coords that used to land in the west city', () => {
    expect(isLeakedHqPoseOnHaven(1312, 1696)).toBe(true);
    expect(isLeakedHqPoseOnHaven(1312, 1824)).toBe(true);
    expect(isLeakedHqPoseOnHaven(4128, 2720)).toBe(false);
    expect(isLeakedHqPoseOnHaven(2592, 1312)).toBe(false);
    expect(havenSnapLeakedIndoorPose(1312, 1824)).toEqual(HAVEN_HQ_STREET);
    expect(havenSnapLeakedIndoorPose(640, 780)).toEqual(HAVEN_APARTMENT_STREET);
    expect(havenSnapLeakedIndoorPose(4128, 2720)).toBeNull();
  });
});
