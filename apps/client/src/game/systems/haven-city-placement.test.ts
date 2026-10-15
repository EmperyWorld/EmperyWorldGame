import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HAVEN_AMBIENT_ACTOR_COUNT,
  HAVEN_APARTMENT_DOOR,
  HAVEN_HQ_GATE,
  HAVEN_HQ_STREET,
  HAVEN_NIGHT_PATROL_COUNT,
  HAVEN_NIGHT_VENUE_COUNT,
  HAVEN_TENEMENT,
  isLeakedApartmentPoseOnHaven,
  isLeakedHqPoseOnHaven,
} from '@empery/shared';
import {
  HAVEN_AMBIENT_CITIZEN_DEFS,
  havenAmbientNightRole,
} from '../../sprites/haven-ambient-defs.js';
import { HAVEN_NPC_BUILDINGS, havenLandmarkFootprint } from '../../sprites/haven-npc-buildings.js';
import { havenPropPlacements } from '../../../../../scripts/layouts/empery_haven.mjs';

const TW = 64;
const inBox = (
  tx: number,
  ty: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1;

const NPC_LANDMARK: Record<string, string> = {
  town_captain: 'prop_barracks',
  town_guard: 'prop_barracks',
  town_merchant: 'prop_trade_hall',
  town_butcher: 'prop_butcher',
  town_radio: 'prop_radio_booth',
  town_blacksmith: 'prop_blacksmith',
  town_miller: 'prop_windmill',
  town_stable: 'prop_stable',
  town_priest: 'prop_cathedral',
  town_scribe: 'prop_library',
  town_healer: 'prop_healer_hall',
  town_teacher: 'prop_schoolhouse',
  town_innkeeper: 'prop_inn',
  town_innkeeper_day: 'prop_inn',
  town_bathkeeper: 'prop_bathhouse',
  town_brewer: 'prop_brewery',
  town_fisher: 'prop_fishmonger',
  town_dockhand: 'prop_warehouse',
};

function yamlNpcs(): Array<{ id: string; x: number; y: number }> {
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../content/locations/empery_haven.yaml',
  );
  const text = readFileSync(path, 'utf8');
  const npcBlock = text.split('\nnpcs:\n')[1]?.split('\nzones:\n')[0] ?? '';
  const out: Array<{ id: string; x: number; y: number }> = [];
  const blocks = `\n${npcBlock}`.split(/\n  - id: /).slice(1);
  for (const block of blocks) {
    const id = block.split('\n', 1)[0]?.trim();
    const xm = block.match(/\n    x: (\d+)/);
    const ym = block.match(/\n    y: (\d+)/);
    if (!id || !xm || !ym) continue;
    out.push({ id, x: Number(xm[1]), y: Number(ym[1]) });
  }
  return out;
}

describe('Haven ambient count', () => {
  it('keeps every scheduled ambient slot represented', () => {
    expect(HAVEN_AMBIENT_CITIZEN_DEFS.length).toBe(HAVEN_AMBIENT_ACTOR_COUNT);
  });

  it('keeps venue patrons distinct from lantern guards', () => {
    const roles = HAVEN_AMBIENT_CITIZEN_DEFS.map((_, index) =>
      havenAmbientNightRole(index),
    );
    expect(roles.filter((role) => role === 'venue')).toHaveLength(HAVEN_NIGHT_VENUE_COUNT);
    expect(roles.filter((role) => role === 'guard')).toHaveLength(HAVEN_NIGHT_PATROL_COUNT);
  });
});

describe('Haven protected city features', () => {
  it('keeps named shops, monuments, and residential play objects after packing', () => {
    const ids = new Set(havenPropPlacements().map((placement) => String(placement[0])));
    for (const id of [
      'prop_apothecary',
      'prop_tailor',
      'prop_cheese_shop',
      'prop_captain_hut',
      'prop_statue_imperial',
      'prop_neighborhood_gate',
      'prop_playground_sandbox',
      'prop_hopscotch',
      'prop_market_canopy',
      'prop_villa_garden',
    ]) {
      expect(ids.has(id), `${id} was silently dropped by the Haven packer`).toBe(true);
    }
  });
});

describe('Haven ambient tiles vs rebuilt districts', () => {
  it('keeps HQ snipers on campus and not in the port', () => {
    const hq = HAVEN_AMBIENT_CITIZEN_DEFS.filter((d) =>
      d.tiles.some(([tx, ty]) => inBox(tx, ty, 58, 31, 70, 41)),
    );
    expect(hq.length).toBeGreaterThanOrEqual(5);
    for (const def of hq) {
      const [tx, ty] = def.tiles[0]!;
      expect(ty, `HQ actor at ${tx},${ty} drifted into harbor`).toBeLessThan(42);
      expect(def.sleepTile?.[0]).toBe(tx);
      expect(def.sleepTile?.[1]).toBe(ty);
    }
  });

  it('puts garrison extras on the NW plaza, not the forum north axis', () => {
    const drill = HAVEN_AMBIENT_CITIZEN_DEFS.find(
      (d) => d.bark === 'Стройся!' && !d.nightPatrolOnly,
    );
    expect(drill).toBeTruthy();
    const [tx, ty] = drill!.tiles[0]!;
    expect(inBox(tx, ty, 6, 5, 22, 14)).toBe(true);
  });

  it('walks garden loiterers at the community garden, not inside the keep', () => {
    const garden = HAVEN_AMBIENT_CITIZEN_DEFS.find((d) => d.bark === 'Сквер родной.');
    expect(garden).toBeTruthy();
    const [tx, ty] = garden!.tiles[0]!;
    // Keep this loiterer in the south residential/community belt.
    expect(inBox(tx, ty, 22, 39, 31, 48)).toBe(true);
    expect(inBox(tx, ty, 6, 5, 22, 14)).toBe(false);
  });

  it('does not send the east night patrol along the HQ east fence', () => {
    const east = HAVEN_AMBIENT_CITIZEN_DEFS.find((d) => {
      if (!d.nightPatrolOnly) return false;
      return d.tiles.some(([tx, ty]) => tx >= 72 && ty >= 25 && ty <= 29);
    });
    expect(east).toBeTruthy();
    expect(east!.tiles.some(([tx, ty]) => tx === 70 && ty === 28)).toBe(false);
  });
});

describe('Haven named NPCs vs landmark buildings', () => {
  it('stands each shop NPC at their colossus, not an old plaza slot', () => {
    const npcs = yamlNpcs();
    for (const [id, prop] of Object.entries(NPC_LANDMARK)) {
      const npc = npcs.find((n) => n.id === id);
      const land = HAVEN_NPC_BUILDINGS.find((b) => b.prop === prop);
      expect(npc, id).toBeTruthy();
      expect(land, prop).toBeTruthy();
      const dist = Math.hypot(npc!.x - land!.x, npc!.y - land!.y);
      expect(dist, `${id} vs ${prop}`).toBeLessThan(220);
    }
  });

  it('puts shop NPCs south of the colossus footprint (south-facing door, origin 0.72)', () => {
    const npcs = yamlNpcs();
    for (const [id, prop] of Object.entries(NPC_LANDMARK)) {
      const npc = npcs.find((n) => n.id === id);
      const land = HAVEN_NPC_BUILDINGS.find((b) => b.prop === prop);
      expect(npc, id).toBeTruthy();
      expect(land, prop).toBeTruthy();
      const fp = havenLandmarkFootprint(land!.x, land!.y, land!.size);
      expect(npc!.y, `${id} inside ${prop} (y<=foot.B)`).toBeGreaterThan(fp.B);
      expect(npc!.y, `${id} north of ${prop} origin`).toBeGreaterThan(land!.y);
    }
  });

  it('keeps the HQ sentry on the south gate, not in the harbor', () => {
    const sentry = yamlNpcs().find((n) => n.id === 'town_hq_sentry');
    expect(sentry).toBeTruthy();
    expect(sentry!.x).toBe(64 * TW + TW / 2);
    expect(sentry!.y).toBe(40 * TW + TW / 2);
    expect(sentry!.y).toBeLessThan(44 * TW);
  });

  it('puts the apartment door south of the tenement, not behind it', () => {
    const fp = havenLandmarkFootprint(HAVEN_TENEMENT.x, HAVEN_TENEMENT.y, HAVEN_TENEMENT.size);
    expect(HAVEN_APARTMENT_DOOR.y).toBeGreaterThan(fp.B);
    expect(HAVEN_APARTMENT_DOOR.y).toBeGreaterThan(HAVEN_TENEMENT.y);
    expect(isLeakedApartmentPoseOnHaven(640, 780)).toBe(true);
    expect(isLeakedApartmentPoseOnHaven(928, 736)).toBe(false);
  });

  it('puts HQ exit south of the campus, not toward the forum', () => {
    expect(HAVEN_HQ_STREET.y).toBeGreaterThan(HAVEN_HQ_GATE.y);
    expect(HAVEN_HQ_STREET.y).toBeGreaterThanOrEqual(40 * TW);
    expect(isLeakedHqPoseOnHaven(1312, 1824)).toBe(true);
    expect(isLeakedHqPoseOnHaven(4128, 2720)).toBe(false);
  });
});
