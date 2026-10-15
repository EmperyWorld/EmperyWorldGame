import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isWalkableTileGid } from './world-geodata.js';
import { HAVEN_DISTRICTS } from '../../sprites/haven-npc-buildings.js';

const HQ_TX0 = 58;
const HQ_TY0 = 31;
const HQ_TX1 = 70;
const HQ_TY1 = 39;
const HQ_GATE_TX = 64;
const HQ_GATE_TY = 39;
const MAP_W = 120;

describe('Haven EmperyWorld campus geodata', () => {
  const mapPath = join(dirname(fileURLToPath(import.meta.url)), '../../../public/maps/empery_haven.json');
  const tiled = JSON.parse(readFileSync(mapPath, 'utf8')) as {
    width: number;
    layers: Array<{ data?: number[] }>;
  };
  const data = tiled.layers[0]?.data ?? [];
  const gid = (tx: number, ty: number): number => data[ty * MAP_W + tx] ?? 0;

  it('keeps a solid perimeter with a south gate gap (art faces south)', () => {
    expect(tiled.width).toBe(MAP_W);
    expect(isWalkableTileGid(gid(HQ_TX0, HQ_TY0))).toBe(false);
    expect(isWalkableTileGid(gid(HQ_TX1, HQ_TY1))).toBe(false);
    expect(isWalkableTileGid(gid(HQ_TX0, 35))).toBe(false);
    expect(isWalkableTileGid(gid(HQ_GATE_TX, HQ_GATE_TY))).toBe(true);
    expect(isWalkableTileGid(gid(HQ_GATE_TX, HQ_GATE_TY + 1))).toBe(true);
    expect(isWalkableTileGid(gid(HQ_GATE_TX, HQ_GATE_TY + 3))).toBe(true);
    expect(isWalkableTileGid(gid(HQ_TX0 + 2, 35))).toBe(true);
  });
});

describe('Haven EmperyWorld district overlay', () => {
  it('keeps the HQ halo on the campus, not the harbor', () => {
    const hq = HAVEN_DISTRICTS.find((d) => d.label === 'EmperyWorld HQ');
    expect(hq).toBeTruthy();
    expect(hq!.x).toBe(4128);
    expect(hq!.y).toBe(2272);
    const campusSouth = 40 * 64;
    const portNorth = 44 * 64;
    expect(hq!.y + hq!.h / 2).toBeLessThanOrEqual(campusSouth);
    expect(hq!.signY).toBeLessThan(portNorth);
    expect(hq!.signY).toBeGreaterThan(31 * 64);
    for (const [x1, y1, x2, y2] of hq!.path ?? []) {
      expect(Math.max(y1, y2)).toBeLessThanOrEqual(campusSouth);
      expect(x1).toBe(4128);
      expect(x2).toBe(4128);
    }
  });
});
