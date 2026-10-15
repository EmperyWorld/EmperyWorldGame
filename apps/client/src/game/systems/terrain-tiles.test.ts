import { describe, expect, it } from 'vitest';
import {
  diversifyTerrainGid,
  isWalkableTileGid,
  TERRAIN_SHEET_COLUMNS,
  TERRAIN_SHEET_W,
  TERRAIN_TILE,
} from './terrain-tiles.js';

describe('terrain tiles vocabulary', () => {
  it('matches Phaser sheet geometry (8×64)', () => {
    expect(TERRAIN_SHEET_COLUMNS).toBe(8);
    expect(TERRAIN_SHEET_W).toBe(512);
  });

  it('keeps water/wall solid and plaza/road walkable', () => {
    expect(isWalkableTileGid(TERRAIN_TILE.water)).toBe(false);
    expect(isWalkableTileGid(TERRAIN_TILE.wall)).toBe(false);
    expect(isWalkableTileGid(TERRAIN_TILE.plazaB)).toBe(true);
    expect(isWalkableTileGid(TERRAIN_TILE.roadC)).toBe(true);
  });

  it('diversifies plaza/road stably by tile coords', () => {
    const a = diversifyTerrainGid(5, 10, 20);
    const b = diversifyTerrainGid(5, 10, 20);
    expect(a).toBe(b);
    expect([1, 5, 6]).toContain(a);
    expect([2, 7, 8]).toContain(diversifyTerrainGid(2, 3, 4));
    expect(diversifyTerrainGid(3, 0, 0)).toBe(3);
  });
});
