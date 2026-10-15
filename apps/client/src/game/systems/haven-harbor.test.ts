import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HAVEN_HARBOR_ARCH_TX,
  HAVEN_HARBOR_ARCH_TY,
  HAVEN_HARBOR_BRAWL_BARK,
  HAVEN_HARBOR_BRAWL_BARKS,
  HAVEN_HARBOR_BRAWL_EXCHANGE_MS,
  HAVEN_HARBOR_BRAWL_HIT_SFX,
  HAVEN_HARBOR_BRAWL_PHASE_MS,
  HAVEN_HARBOR_BRAWL_ROUND_MS,
  HAVEN_HARBOR_BRAWL_TILE,
  havenHarborBrawlHitEdge,
  havenHarborBrawlNextBark,
  havenHarborBrawlPose,
  HAVEN_HARBOR_PATROL_TILES,
  HAVEN_HARBOR_STONE,
  HAVEN_MAP_TILES_H,
  HAVEN_MAP_TILES_W,
  HAVEN_SHIP_AWAY_HOURS_MAX,
  HAVEN_SHIP_AWAY_HOURS_MIN,
  HAVEN_SHIP_BERTH_HEADING,
  HAVEN_SHIP_BERTH_TILES,
  HAVEN_SHIP_DOCK_HOURS_MAX,
  HAVEN_SHIP_DOCK_HOURS_MIN,
  HAVEN_SHIP_FLEET,
  HAVEN_SHIP_HEADINGS,
  HAVEN_SHIP_HULL_IDS,
  HAVEN_WALL_S_TY,
  havenShipHeadingAssetId,
  havenHarborCopingEdges,
  havenShipHeadingFromDelta,
  havenShipSkipperPresent,
  havenShipTimetable,
  isHavenHarborStoneTile,
  isHavenOpenWaterTile,
  isHavenShipHullAsset,
  isHavenShipSkipperNpc,
  parseHavenShipAsset,
  resolveHavenShipVisualId,
  resolveHavenShipVoyage,
  worldToHavenTile,
} from '@empery/shared';
import { HAVEN_CITY_PROPS } from '../../sprites/haven-city-data.js';
import { HAVEN_AMBIENT_CITIZEN_DEFS } from '../../sprites/haven-ambient-defs.js';
import { isWalkableTileGid } from './world-geodata.js';
import { TERRAIN_TILE } from './terrain-tiles.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../../');

function loadTiles(): { width: number; height: number; data: number[] } {
  const raw = JSON.parse(readFileSync(join(root, 'apps/client/public/maps/empery_haven.json'), 'utf8')) as {
    width: number;
    height: number;
    layers: Array<{ data?: number[] }>;
  };
  const data = raw.layers[0]?.data;
  if (!data) throw new Error('missing haven ground layer');
  return { width: raw.width, height: raw.height, data };
}

function gidAt(tiles: { width: number; data: number[] }, tx: number, ty: number): number {
  return tiles.data[ty * tiles.width + tx] ?? 0;
}

describe('Haven harbor port', () => {
  it('keeps the expanded 120×84 map', () => {
    expect(HAVEN_MAP_TILES_W).toBe(120);
    expect(HAVEN_MAP_TILES_H).toBe(84);
  });

  it('puts ships on open water and piers on stone, never on grass', () => {
    const tiles = loadTiles();
    expect(tiles.width).toBe(120);
    expect(tiles.height).toBe(84);

    for (const [tx, ty] of Object.values(HAVEN_SHIP_BERTH_TILES)) {
      expect(isHavenOpenWaterTile(tx, ty), `berth ${tx},${ty} not open water`).toBe(true);
      expect(gidAt(tiles, tx, ty), `berth ${tx},${ty} gid`).toBe(TERRAIN_TILE.water);
    }

    for (const [id, x, y] of HAVEN_CITY_PROPS) {
      if (!isHavenShipHullAsset(id)) continue;
      const [tx, ty] = worldToHavenTile(x, y);
      expect(isHavenOpenWaterTile(tx, ty), `${id}@${tx},${ty} not open water`).toBe(true);
      expect(gidAt(tiles, tx, ty), `${id}@${tx},${ty} gid`).toBe(TERRAIN_TILE.water);
    }

    const dockJunk = HAVEN_CITY_PROPS.filter(
      ([id, x, y]) => {
        if (
          id !== 'prop_dock_crates' &&
          id !== 'prop_dock_nets' &&
          id !== 'prop_dock_barrels' &&
          id !== 'prop_dock_fishboxes'
        ) {
          return false;
        }
        const [tx, ty] = worldToHavenTile(x, y);
        return isHavenHarborStoneTile(tx, ty);
      },
    );
    expect(dockJunk, 'crate/barrel lattice must be off the piers').toEqual([]);

    const dockGear = HAVEN_CITY_PROPS.filter(
      ([id]) =>
        id === 'prop_quay_bollard' ||
        id === 'prop_dock_rope' ||
        id === 'prop_fish_stall' ||
        id === 'prop_harbor_crane' ||
        id === 'prop_lighthouse',
    );
    expect(dockGear.length).toBeGreaterThanOrEqual(20);
    expect(dockGear.filter(([id]) => id === 'prop_harbor_crane')).toHaveLength(1);
    expect(dockGear.filter(([id]) => id === 'prop_lighthouse')).toHaveLength(1);
    expect(dockGear.filter(([id]) => id === 'prop_fish_stall').length).toBeGreaterThanOrEqual(1);
    expect(dockGear.filter(([id]) => id === 'prop_fish_stall').length).toBeLessThanOrEqual(2);
    for (const [id, x, y] of dockGear) {
      const [tx, ty] = worldToHavenTile(x, y);
      expect(isHavenHarborStoneTile(tx, ty), `${id}@${tx},${ty} not on pier/quay stone`).toBe(true);
      expect(gidAt(tiles, tx, ty), `${id}@${tx},${ty} water`).not.toBe(TERRAIN_TILE.water);
    }
  });

  it('keeps patrol loops on open water', () => {
    const tiles = loadTiles();
    for (const [id, path] of Object.entries(HAVEN_HARBOR_PATROL_TILES)) {
      expect(path.length).toBeGreaterThan(2);
      for (const [tx, ty] of path) {
        expect(isHavenOpenWaterTile(tx, ty), `${id} patrol ${tx},${ty}`).toBe(true);
        expect(gidAt(tiles, tx, ty), `${id} patrol gid ${tx},${ty}`).toBe(TERRAIN_TILE.water);
      }
    }
  });

  it('drops the port tower gate but keeps land city gates', () => {
    expect(HAVEN_CITY_PROPS.some(([id]) => id === 'prop_harbor_guard_arch')).toBe(false);
    const land = {
      n: HAVEN_CITY_PROPS.filter(([id]) => id === 'prop_city_gate'),
      s: HAVEN_CITY_PROPS.filter(([id]) => id === 'prop_city_gate_s'),
      e: HAVEN_CITY_PROPS.filter(([id]) => id === 'prop_city_gate_e'),
    };
    expect(land.n).toHaveLength(1);
    expect(land.s).toHaveLength(1);
    expect(land.e).toHaveLength(1);
    const [stx, sty] = worldToHavenTile(land.s[0]![1], land.s[0]![2]);
    expect(sty).toBe(HAVEN_WALL_S_TY);
    expect(stx).toBe(40);

    const portTowers = HAVEN_CITY_PROPS.filter(([id, x, y]) => {
      if (id !== 'prop_guard_tower') return false;
      const [tx, ty] = worldToHavenTile(x, y);
      return ty === HAVEN_WALL_S_TY && tx >= 56 && tx <= 68;
    });
    expect(portTowers).toHaveLength(2);

    const seaGates = HAVEN_CITY_PROPS.filter(([id, x, y]) => {
      if (!id.startsWith('prop_city_gate')) return false;
      const [gtx, gty] = worldToHavenTile(x, y);
      return gty === HAVEN_WALL_S_TY && gtx >= 56 && gtx <= 70;
    });
    expect(seaGates).toEqual([]);
    expect(HAVEN_HARBOR_ARCH_TX).toBe(62);
    expect(HAVEN_HARBOR_ARCH_TY).toBe(HAVEN_WALL_S_TY);
  });

  it('keeps houses north of the seaward wall', () => {
    const south = HAVEN_CITY_PROPS.filter(([id, x, y]) => {
      if (!id.startsWith('prop_house_')) return false;
      const [, ty] = worldToHavenTile(x, y);
      return ty > HAVEN_WALL_S_TY;
    });
    expect(south).toEqual([]);
  });

  it('puts fishermen on the fishing pier stone', () => {
    const tiles = loadTiles();
    const fishers = HAVEN_AMBIENT_CITIZEN_DEFS.filter(
      (d) => d.bark === 'Клюёт!' || d.bark === 'Сеть закинул.' || d.bark === 'Улов к вечеру.',
    );
    expect(fishers.length).toBe(3);
    for (const def of fishers) {
      for (const [tx, ty] of def.tiles) {
        expect(isHavenHarborStoneTile(tx, ty), `fisher ${tx},${ty}`).toBe(true);
        expect(isWalkableTileGid(gidAt(tiles, tx, ty)), `fisher walk ${tx},${ty}`).toBe(true);
      }
    }
  });

  it('authors a deep quay plus two wide piers and a mole', () => {
    const quay = HAVEN_HARBOR_STONE.find((r) => r.ty === HAVEN_WALL_S_TY + 1);
    expect(quay).toBeTruthy();
    expect(quay!.h).toBeGreaterThanOrEqual(4);
    expect(quay!.h).toBeLessThanOrEqual(5);
    expect(quay!.w).toBeGreaterThanOrEqual(30);

    const cargo = HAVEN_HARBOR_STONE.find((r) => r.tx === 51 && r.ty === 55);
    const fish = HAVEN_HARBOR_STONE.find((r) => r.tx === 66 && r.ty === 55);
    const mole = HAVEN_HARBOR_STONE.find((r) => r.tx === 80 && r.ty === 51);
    expect(cargo?.w).toBeGreaterThanOrEqual(8);
    expect(fish?.w).toBeGreaterThanOrEqual(8);
    expect(mole?.w).toBeGreaterThanOrEqual(10);
    expect(mole?.h).toBeGreaterThanOrEqual(18);
    expect(cargo!.tx + cargo!.w).toBeLessThan(fish!.tx);
  });

  it('authors sailing hulls only and keeps fleet occupancy', () => {
    const hulls = HAVEN_CITY_PROPS.filter(([id]) => isHavenShipHullAsset(id));
    expect(hulls.length).toBe(HAVEN_SHIP_HULL_IDS.length);
    expect(new Set(hulls.map(([id]) => id)).size).toBe(HAVEN_SHIP_HULL_IDS.length);
    expect(HAVEN_SHIP_FLEET).toHaveLength(HAVEN_SHIP_HULL_IDS.length);
    expect(hulls.some(([id]) => id === 'prop_rowboat' || id === 'prop_ship_galley')).toBe(false);
    expect(isHavenShipHullAsset('prop_ship_chandler')).toBe(false);
    expect(Object.keys(HAVEN_HARBOR_PATROL_TILES).sort()).toEqual([...HAVEN_SHIP_HULL_IDS].sort());
    expect(Object.keys(HAVEN_SHIP_BERTH_HEADING)).toEqual(Object.keys(HAVEN_SHIP_BERTH_TILES));
    const berths = HAVEN_SHIP_FLEET.map((s) => `${s.berth[0]},${s.berth[1]}`);
    expect(new Set(berths).size).toBe(HAVEN_SHIP_FLEET.length);
  });

  it('gives each hull a refuse-boarding skipper and 1–24 / 24–48 game-hour cycle', () => {
    const skippers = new Set(HAVEN_SHIP_FLEET.map((s) => s.skipperId));
    expect(skippers.size).toBe(HAVEN_SHIP_FLEET.length);
    for (const ship of HAVEN_SHIP_FLEET) {
      expect(isHavenShipSkipperNpc(ship.skipperId)).toBe(true);
      const tt = havenShipTimetable(ship.hullId);
      expect(tt.dockHours).toBeGreaterThanOrEqual(HAVEN_SHIP_DOCK_HOURS_MIN);
      expect(tt.dockHours).toBeLessThanOrEqual(HAVEN_SHIP_DOCK_HOURS_MAX);
      expect(tt.awayHours).toBeGreaterThanOrEqual(HAVEN_SHIP_AWAY_HOURS_MIN);
      expect(tt.awayHours).toBeLessThanOrEqual(HAVEN_SHIP_AWAY_HOURS_MAX);
      const midDock = tt.offsetHours + tt.dockHours * 0.2;
      const midAway = tt.offsetHours + tt.dockHours + tt.awayHours * 0.5;
      expect(resolveHavenShipVoyage(ship.hullId, midDock).state).toBe('in_port');
      expect(havenShipSkipperPresent(ship.skipperId, midDock)).toBe(true);
      expect(resolveHavenShipVoyage(ship.hullId, midAway).state).toBe('at_sea');
      expect(havenShipSkipperPresent(ship.skipperId, midAway)).toBe(false);
    }
    expect(havenShipTimetable('prop_ship_brig')).not.toEqual(havenShipTimetable('prop_ship_cog'));
  });

  it('picks an 8-way heading from velocity and unique art per facing', () => {
    expect(HAVEN_SHIP_HEADINGS).toEqual(['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']);
    expect(havenShipHeadingFromDelta(10, 0)).toBe('e');
    expect(havenShipHeadingFromDelta(10, 10)).toBe('se');
    expect(havenShipHeadingFromDelta(0, 10)).toBe('s');
    expect(havenShipHeadingFromDelta(-10, 10)).toBe('sw');
    expect(havenShipHeadingFromDelta(-10, 0)).toBe('w');
    expect(havenShipHeadingFromDelta(-10, -10)).toBe('nw');
    expect(havenShipHeadingFromDelta(0, -10)).toBe('n');
    expect(havenShipHeadingFromDelta(10, -10)).toBe('ne');
    expect(havenShipHeadingFromDelta(0, 0)).toBe('s');
    expect(havenShipHeadingAssetId('prop_ship_brig', 'nw')).toBe('prop_ship_brig_nw');
    expect(parseHavenShipAsset('prop_ship_brig_se')).toEqual({
      hullId: 'prop_ship_brig',
      heading: 'se',
    });
    const loaded = new Set(['prop_ship_brig_e', 'prop_ship_brig_s']);
    expect(resolveHavenShipVisualId('prop_ship_brig', 'e', (id) => loaded.has(id))).toBe(
      'prop_ship_brig_e',
    );
    expect(resolveHavenShipVisualId('prop_ship_brig', 'w', (id) => loaded.has(id))).toBe(
      'prop_ship_brig_e',
    );
    expect(HAVEN_SHIP_HULL_IDS).not.toContain('prop_ship_galley');
    expect(HAVEN_SHIP_HULL_IDS).not.toContain('prop_rowboat');
  });

  it('puts skippers on pier stone and refuses boarding in YAML', () => {
    const tiles = loadTiles();
    for (const ship of HAVEN_SHIP_FLEET) {
      const [tx, ty] = ship.skipperTile;
      expect(isHavenHarborStoneTile(tx, ty), `skipper ${ship.skipperId} ${tx},${ty}`).toBe(true);
      expect(isWalkableTileGid(gidAt(tiles, tx, ty)), `skipper walk ${tx},${ty}`).toBe(true);
      const yaml = readFileSync(join(root, `content/npcs/${ship.skipperId}.yaml`), 'utf8');
      expect(yaml).toContain('id: skipper_where');
      expect(yaml).toContain('id: skipper_board');
      expect(yaml).toMatch(/Пассажиров не берём/);
    }
  });

  it('has a cobble drop-off coping toward open water, not a raw plaza cut', () => {
    const edges = havenHarborCopingEdges();
    expect(edges.length).toBeGreaterThan(80);
    let waterFacing = 0;
    for (const e of edges) {
      expect(isHavenHarborStoneTile(e.tx, e.ty)).toBe(true);
      expect(isHavenHarborStoneTile(e.tx + e.dx, e.ty + e.dy)).toBe(false);
      if (isHavenOpenWaterTile(e.tx + e.dx, e.ty + e.dy)) waterFacing += 1;
    }
    expect(waterFacing).toBeGreaterThan(40);
  });

  it('puts the sailor brawl on open quay stone, not under the crane', () => {
    const [tx, ty] = HAVEN_HARBOR_BRAWL_TILE;
    expect(isHavenHarborStoneTile(tx, ty)).toBe(true);
    expect([tx, ty]).not.toEqual([54, 57]);
    const crane = HAVEN_CITY_PROPS.find((p) => p[0] === 'prop_harbor_crane');
    if (crane) {
      const [cx, cy] = worldToHavenTile(crane[1], crane[2]);
      expect(Math.hypot(tx - cx, ty - cy)).toBeGreaterThan(2);
    }
  });

  it('keeps the sailor brawl at a boxing-round cadence, not a 520ms smear', () => {
    const phases =
      HAVEN_HARBOR_BRAWL_PHASE_MS.windup +
      HAVEN_HARBOR_BRAWL_PHASE_MS.lunge +
      HAVEN_HARBOR_BRAWL_PHASE_MS.contact +
      HAVEN_HARBOR_BRAWL_PHASE_MS.recoil +
      HAVEN_HARBOR_BRAWL_PHASE_MS.pause;
    expect(HAVEN_HARBOR_BRAWL_EXCHANGE_MS).toBeGreaterThanOrEqual(2000);
    expect(HAVEN_HARBOR_BRAWL_EXCHANGE_MS).toBeLessThanOrEqual(4000);
    expect(phases).toBe(HAVEN_HARBOR_BRAWL_EXCHANGE_MS);
    expect(HAVEN_HARBOR_BRAWL_ROUND_MS).toBe(HAVEN_HARBOR_BRAWL_EXCHANGE_MS * 2);
    expect(HAVEN_HARBOR_BRAWL_PHASE_MS.contact).toBeGreaterThanOrEqual(200);
    expect(HAVEN_HARBOR_BRAWL_PHASE_MS.contact).toBeLessThanOrEqual(400);
    expect(HAVEN_HARBOR_BRAWL_BARK).toBe('Получай!');
    expect(HAVEN_HARBOR_BRAWL_BARKS.length).toBeGreaterThanOrEqual(16);
    expect(new Set(HAVEN_HARBOR_BRAWL_BARKS).size).toBe(HAVEN_HARBOR_BRAWL_BARKS.length);
    expect(HAVEN_HARBOR_BRAWL_BARKS).toContain(HAVEN_HARBOR_BRAWL_BARK);
    expect(HAVEN_HARBOR_BRAWL_HIT_SFX).toBe('harbor_brawl_hit');
    const first = havenHarborBrawlNextBark('Получай!', () => 0.11);
    const again = havenHarborBrawlNextBark(first, () => 0.77);
    expect(HAVEN_HARBOR_BRAWL_BARKS).toContain(first);
    expect(again).not.toBe(first);
    expect(havenHarborBrawlHitEdge(0.1, 0.7)).toBe(true);
    expect(havenHarborBrawlHitEdge(0.8, 0.9)).toBe(false);

    const windup = havenHarborBrawlPose(HAVEN_HARBOR_BRAWL_PHASE_MS.windup * 0.9);
    expect(windup.attacker).toBe(0);
    expect(windup.phase).toBe('windup');
    expect(windup.leftX).toBeLessThan(-36);
    expect(windup.impact).toBe(0);

    const hitAt =
      HAVEN_HARBOR_BRAWL_PHASE_MS.windup + HAVEN_HARBOR_BRAWL_PHASE_MS.lunge + 40;
    const hit = havenHarborBrawlPose(hitAt);
    expect(hit.phase).toBe('contact');
    expect(hit.leftX).toBeGreaterThan(-8);
    expect(hit.rightX).toBeGreaterThan(46);
    expect(hit.impact).toBeGreaterThan(0.5);
    expect(hit.bark).toBe(true);

    const pause = havenHarborBrawlPose(HAVEN_HARBOR_BRAWL_EXCHANGE_MS - 80);
    expect(pause.phase).toBe('pause');
    expect(pause.impact).toBe(0);
    expect(Math.abs(pause.leftX + 32)).toBeLessThan(8);
    expect(Math.abs(pause.rightX - 32)).toBeLessThan(8);

    const answer = havenHarborBrawlPose(
      HAVEN_HARBOR_BRAWL_EXCHANGE_MS +
        HAVEN_HARBOR_BRAWL_PHASE_MS.windup +
        HAVEN_HARBOR_BRAWL_PHASE_MS.lunge +
        40,
    );
    expect(answer.attacker).toBe(1);
    expect(answer.phase).toBe('contact');
    expect(answer.rightX).toBeLessThan(12);
    expect(answer.leftX).toBeLessThan(-40);

    let peaks = 0;
    let prev = 0;
    for (let t = 0; t <= 10_000; t += 16) {
      const imp = havenHarborBrawlPose(t).impact;
      if (prev < 0.5 && imp >= 0.5) peaks += 1;
      prev = imp;
    }
    expect(peaks).toBeGreaterThanOrEqual(2);
    expect(peaks).toBeLessThanOrEqual(5);
  });
});
