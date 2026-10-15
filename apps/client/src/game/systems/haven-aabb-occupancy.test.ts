import { havenScene } from '../../sprites/haven-navigation.test-fixture.js';
import { ambientPlacement } from '../../sprites/ambient-placement.js';
import { isInsidePropAabb } from '../../sprites/prop-colliders.js';
import { isTileBlockedAt } from '../../sprites/world-tiles.js';
import { describe, expect, it } from 'vitest';
import { HAVEN_CITY_PROPS } from '../../sprites/haven-city-data.js';
import { HAVEN_AMBIENT_CITIZEN_DEFS } from '../../sprites/haven-ambient-defs.js';
import { HAVEN_NPC_BUILDINGS, havenLandmarkFootprint } from '../../sprites/haven-npc-buildings.js';
import { footprintForProp, PROP_PASS } from '../../sprites/prop-footprint.js';
import { HAVEN_NPC_POSTS, HAVEN_TENEMENT, havenPropSpriteAabb } from '@empery/shared';
import { HAVEN } from '../../../../../scripts/layouts/empery_haven.mjs';

const TW = 64;
function overlap(a: { L: number; R: number; T: number; B: number }, b: typeof a, pad: number): boolean {
  return a.R > b.L + pad && a.L < b.R - pad && a.B > b.T + pad && a.T < b.B - pad;
}

describe('Haven AABB occupancy', () => {
  it('keeps colossus footprints a tile apart', () => {
    const boxes = [
      ...HAVEN_NPC_BUILDINGS.map((b) => ({ id: b.prop, ...havenLandmarkFootprint(b.x, b.y, b.size) })),
      { id: 'tenement', ...havenLandmarkFootprint(HAVEN_TENEMENT.x, HAVEN_TENEMENT.y, HAVEN_TENEMENT.size) },
    ];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlap(boxes[i]!, boxes[j]!, TW), `${boxes[i]!.id} ∩ ${boxes[j]!.id}`).toBe(false);
      }
    }
  });

  it('stands named NPCs south of the colossus, not inside the footprint', () => {
    const map: Record<string, string> = {
      town_merchant: 'prop_trade_hall',
      town_butcher: 'prop_butcher',
      town_blacksmith: 'prop_blacksmith',
      town_miller: 'prop_windmill',
      town_stable: 'prop_stable',
      town_priest: 'prop_cathedral',
      town_healer: 'prop_healer_hall',
      town_innkeeper: 'prop_inn',
    };
    for (const [id, prop] of Object.entries(map)) {
      const npc = HAVEN.npcs.find((n: { id: string }) => n.id === id);
      const land = HAVEN_NPC_BUILDINGS.find((b) => b.prop === prop);
      expect(npc, id).toBeTruthy();
      const fp = havenLandmarkFootprint(land!.x, land!.y, land!.size);
      expect(npc!.y, id).toBeGreaterThan(fp.B + 16);
    }
  });

  it('does not stack house sprite quads (terrace may touch, not overlap)', () => {
    const houses = HAVEN_CITY_PROPS.filter((p) => p[0].startsWith('prop_house_'));
    for (let i = 0; i < houses.length; i++) {
      const a = houses[i]!;
      const ab = havenPropSpriteAabb(a[1], a[2], a[3]);
      for (let j = i + 1; j < houses.length; j++) {
        const b = houses[j]!;
        const bb = havenPropSpriteAabb(b[1], b[2], b[3]);
        // pad 0: touching edges OK for terrace; interior overlap fails
        expect(overlap(ab, bb, 0), `${a[0]}@${a[1]},${a[2]} ∩ ${b[0]}@${b[1]},${b[2]}`).toBe(false);
      }
    }
  });

  it('forms organic terrace abutments (0-gap X or Y, allow 1–2 tile facade shift)', () => {
    const houses = HAVEN_CITY_PROPS.filter((p) => p[0].startsWith('prop_house_'));
    let abutting = 0;
    for (let i = 0; i < houses.length; i++) {
      const a = houses[i]!;
      const aSize = Number(a[3]);
      for (let j = i + 1; j < houses.length; j++) {
        const b = houses[j]!;
        const bSize = Number(b[3]);
        const dx = Math.abs(Number(b[1]) - Number(a[1]));
        const dy = Math.abs(Number(b[2]) - Number(a[2]));
        const xAbut = Math.abs(dx - (aSize / 2 + bSize / 2)) < 3;
        const yAbut = Math.abs(dy - (aSize / 2 + bSize / 2)) < 3;
        // Органика: встык по одной оси, сдвиг по другой ≤ 2 тайла
        if (xAbut && dy <= TW * 2 + 2) abutting += 1;
        if (yAbut && dx <= TW * 2 + 2) abutting += 1;
      }
    }
    expect(abutting).toBeGreaterThanOrEqual(7);
  });

  it('keeps solid prop origins off colossus interiors', () => {
    const lands = HAVEN_NPC_BUILDINGS.map((b) => havenLandmarkFootprint(b.x, b.y, b.size));
    const hits: string[] = [];
    for (const [id, x, y, size] of HAVEN_CITY_PROPS) {
      if (PROP_PASS.has(id) || !footprintForProp(id, size)) continue;
      if (size < 55) continue;
      for (const fp of lands) {
        if (x > fp.L && x < fp.R && y > fp.T && y < fp.B) {
          hits.push(`${id}@${x},${y}`);
        }
      }
    }
    expect(hits.slice(0, 12)).toEqual([]);
  });

  it('keeps resolved actor anchors off physical collision geometry', () => {
    const scene=havenScene();
    for(const post of HAVEN_NPC_POSTS) {
      expect(isInsidePropAabb(scene,post.postX,post.postY,13),post.id).toBe(false);
      expect(isTileBlockedAt(scene,post.postX,post.postY),post.id).toBe(false);
    }
    for(let i=0;i<HAVEN_AMBIENT_CITIZEN_DEFS.length;i++) {
      const placement=ambientPlacement(scene,HAVEN_AMBIENT_CITIZEN_DEFS[i]!,i);
      expect(placement,`resident_${i}`).not.toBeNull();
      for(const point of [placement!.post,placement!.door,...placement!.path]) {
        expect(isInsidePropAabb(scene,point.x,point.y,13),`resident_${i}`).toBe(false);
        expect(isTileBlockedAt(scene,point.x,point.y),`resident_${i}`).toBe(false);
      }
    }
  });

});
