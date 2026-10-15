import { describe, expect, it } from 'vitest';
import { HAVEN_RESIDENTIAL_COURT } from '@empery/shared';
import { COURT_CITIZEN_DEFS, HAVEN_AMBIENT_CITIZEN_DEFS } from './haven-ambient-defs.js';
import { ambientPlacement } from './ambient-placement.js';
import { havenScene } from './haven-navigation.test-fixture.js';
import { buildNpcRoute } from './npc-pathing.js';
import { worldProps } from '@empery/shared/world-props';
import { PROP_OPAQUE_BOUNDS } from '../../../../packages/shared/src/prop-opaque-bounds.js';
import { resolveNpcHomeEntrance } from './npc-home-entrance.js';

describe('residential families on the actual city geometry', () => {
  it('keeps the visible court clear of house silhouettes, including the tenement', () => {
    const { x, y, size } = HAVEN_RESIDENTIAL_COURT;
    const bounds = PROP_OPAQUE_BOUNDS.prop_basketball_court!;
    const court = { l: x + (bounds.minX - 0.5) * size, r: x + (bounds.maxX - 0.5) * size,
      t: y + (bounds.minY - 0.72) * size, b: y + (bounds.maxY - 0.72) * size };
    for (const [id, hx, hy, hs] of worldProps('empery_haven')) {
      if (!id.startsWith('prop_house_') && id !== 'prop_tenement_block') continue;
      const house = PROP_OPAQUE_BOUNDS[id]!;
      const overlaps = hx + (house.minX - 0.5) * hs < court.r + 8 && hx + (house.maxX - 0.5) * hs > court.l - 8
        && hy + (house.minY - 0.72) * hs < court.b + 8 && hy + (house.maxY - 0.72) * hs > court.t - 8;
      expect(overlaps, `${id} at ${hx},${hy} overlaps the court`).toBe(false);
    }
  });

  it('connects every residential house entrance to the courtyard streets', () => {
    const scene = havenScene(), failures: string[] = [];
    for (const [id, x, y] of worldProps('empery_haven')) {
      if ((!id.startsWith('prop_house_') && id !== 'prop_tenement_block') || x > 2200 || y < 2200 || y > 3200) continue;
      const door = resolveNpcHomeEntrance(scene, x, y);
      if (!door) { failures.push(`${id}: no entrance`); continue; }
      const route = buildNpcRoute(scene, door.x, door.y, HAVEN_RESIDENTIAL_COURT.x, HAVEN_RESIDENTIAL_COURT.y, 1);
      if (route.length < 2) failures.push(`${id} ${x},${y}: no courtyard route`);
    }
    expect(failures).toEqual([]);
  });
  it('keeps four children and three parents in the scheduled population', () => {
    expect(COURT_CITIZEN_DEFS.filter(d => d.courtyardRole === 'child')).toHaveLength(4);
    expect(COURT_CITIZEN_DEFS.filter(d => d.courtyardRole === 'parent')).toHaveLength(3);
  });
  it.each(COURT_CITIZEN_DEFS.map((def, i) => ({ def, i })))('keeps court resident $i near the court with a reachable home', ({ def }) => {
    const scene = havenScene();
    const placement = ambientPlacement(scene, def, HAVEN_AMBIENT_CITIZEN_DEFS.indexOf(def));
    expect(placement).not.toBeNull();
    if (!placement) return;
    for (const point of placement.path) {
      expect(Math.abs(point.x - HAVEN_RESIDENTIAL_COURT.x)).toBeLessThan(160);
      expect(Math.abs(point.y - HAVEN_RESIDENTIAL_COURT.y)).toBeLessThan(110);
    }
    const route = buildNpcRoute(scene, placement.post.x, placement.post.y, placement.door.x, placement.door.y, 1);
    expect(route.length).toBeGreaterThan(1);
    expect(Math.hypot(route.at(-1)!.x - placement.door.x, route.at(-1)!.y - placement.door.y)).toBeLessThan(20);
  });
});
