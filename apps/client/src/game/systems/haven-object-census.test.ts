/**
 * Factual census: every Haven object vs layout / YAML / Tiled / client tables.
 * Does not invent coordinates. Failures are source mismatches, not taste.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GUARD_PATROL_TILES,
  HAVEN_AMBIENT_ACTOR_COUNT,
  HAVEN_MAP_TILES_H,
  HAVEN_MAP_TILES_W,
  HAVEN_NPC_POSTS,
  HAVEN_STAGE_LAYOUT,
  HAVEN_RESIDENTIAL_COURT,
  NPC_SLEEP_HOME_TILES,
  havenWorldFromTile,
  worldToHavenTile,
} from '@empery/shared';
import { ALL_CITIZEN_DEFS } from '../../sprites/haven-ambient-defs.js';
import { HAVEN_CITY_BANNER, HAVEN_CITY_PROPS } from '../../sprites/haven-city-data.js';
import { HAVEN_TILE_WASHES } from '../../sprites/haven-district-washes.js';
import { HAVEN_DISTRICTS, HAVEN_NPC_BUILDINGS } from '../../sprites/haven-npc-buildings.js';
import { isWalkableTileGid } from './world-geodata.js';
import {
  HAVEN,
  HAVEN_NPC_LANDMARK_EXCLUSIONS,
  c,
  havenPropPlacements,
  havenYamlFragment,
} from '../../../../../scripts/layouts/empery_haven.mjs';

const TW = 64;
const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../../');
const YAML_ONLY = new Set([
  'town_notice_board',
  'stage_bard',
  'town_hq_sentry',
  'harbor_skipper_barge',
  'harbor_skipper_cog',
  'harbor_skipper_fishing',
  'harbor_skipper_caravel',
  'harbor_skipper_ferry',
  'harbor_skipper_skiff',
  'harbor_skipper_brig',
]);

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

type Issue = { layer: string; id: string; detail: string };

function parseYamlCensus(): {
  spawn: { x: number; y: number };
  npcs: Array<{ id: string; x: number; y: number; label: string }>;
  zones: Array<{ x: number; y: number; label: string; travelTo?: string; radius?: number }>;
  stations: Array<{ id: string; kind: string; x: number; y: number; radius: number }>;
  landmarks: Array<{ kind: string; x: number; y: number }>;
} {
  const text = readFileSync(join(root, 'content/locations/empery_haven.yaml'), 'utf8');
  const spawnM = text.match(/spawn:\n  x: (\d+)\n  y: (\d+)/);
  if (!spawnM) throw new Error('yaml spawn missing');
  const npcBlock = text.split('\nnpcs:\n')[1]?.split('\nzones:\n')[0] ?? '';
  const npcs: Array<{ id: string; x: number; y: number; label: string }> = [];
  for (const block of `\n${npcBlock}`.split(/\n  - id: /).slice(1)) {
    const id = block.split('\n', 1)[0]?.trim();
    const xm = block.match(/\n    x: (\d+)/);
    const ym = block.match(/\n    y: (\d+)/);
    const lm = block.match(/\n    label: (.+)/);
    if (!id || !xm || !ym) continue;
    npcs.push({
      id,
      x: Number(xm[1]),
      y: Number(ym[1]),
      label: (lm?.[1] ?? '').trim(),
    });
  }
  const zoneBlock = text.split('\nzones:\n')[1]?.split('\nstations:\n')[0] ?? '';
  const zones: Array<{ x: number; y: number; label: string; travelTo?: string; radius?: number }> = [];
  for (const block of `\n${zoneBlock}`.split(/\n  - x: /).slice(1)) {
    const x = Number(block.split('\n', 1)[0]);
    const ym = block.match(/\n    y: (\d+)/);
    const lab = block.match(/\n    label: '([^']+)'/);
    const travel = block.match(/\n    travelTo: (\S+)/);
    const rad = block.match(/\n    radius: (\d+)/);
    if (!ym || !lab) continue;
    zones.push({
      x,
      y: Number(ym[1]),
      label: lab[1],
      travelTo: travel?.[1],
      radius: rad ? Number(rad[1]) : undefined,
    });
  }
  const stBlock = text.split('\nstations:\n')[1]?.split('\nlandmarks:\n')[0] ?? '';
  const stations: Array<{ id: string; kind: string; x: number; y: number; radius: number }> = [];
  for (const block of `\n${stBlock}`.split(/\n  - id: /).slice(1)) {
    const id = block.split('\n', 1)[0]?.trim();
    const kind = block.match(/\n    kind: (\S+)/)?.[1];
    const x = Number(block.match(/\n    x: (\d+)/)?.[1]);
    const y = Number(block.match(/\n    y: (\d+)/)?.[1]);
    const radius = Number(block.match(/\n    radius: (\d+)/)?.[1]);
    if (!id || !kind) continue;
    stations.push({ id, kind, x, y, radius });
  }
  const lmBlock = text.split('\nlandmarks:\n')[1]?.split('\nenemies:')[0] ?? '';
  const landmarks: Array<{ kind: string; x: number; y: number }> = [];
  for (const block of `\n${lmBlock}`.split(/\n  - kind: /).slice(1)) {
    const kind = block.split('\n', 1)[0]?.trim();
    const x = Number(block.match(/\n    x: (\d+)/)?.[1]);
    const y = Number(block.match(/\n    y: (\d+)/)?.[1]);
    if (!kind) continue;
    landmarks.push({ kind, x, y });
  }
  return {
    spawn: { x: Number(spawnM[1]), y: Number(spawnM[2]) },
    npcs,
    zones,
    stations,
    landmarks,
  };
}

function loadTiles(): { width: number; height: number; data: number[] } {
  const tiled = JSON.parse(
    readFileSync(join(root, 'apps/client/public/maps/empery_haven.json'), 'utf8'),
  ) as { width: number; height: number; layers: Array<{ name?: string; data?: number[] }> };
  const layer = tiled.layers.find((l) => l.name === 'ground') ?? tiled.layers[0];
  return { width: tiled.width, height: tiled.height, data: layer?.data ?? [] };
}

function gidAt(tiles: { width: number; data: number[] }, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= tiles.width) return 0;
  return tiles.data[ty * tiles.width + tx] ?? 0;
}

function isTileCenter(x: number, y: number): boolean {
  return (x - 32) % TW === 0 && (y - 32) % TW === 0;
}

function inMapTiles(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < HAVEN_MAP_TILES_W && ty < HAVEN_MAP_TILES_H;
}

function inMapWorld(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < HAVEN_MAP_TILES_W * TW && y < HAVEN_MAP_TILES_H * TW;
}

describe('Haven object census', () => {
  const yaml = parseYamlCensus();
  const tiles = loadTiles();
  const layoutNpcs = HAVEN.npcs as Array<{ id: string; x: number; y: number; label: string }>;
  const issues: Issue[] = [];
  const add = (layer: string, id: string, detail: string): void => {
    issues.push({ layer, id, detail });
  };

  it('prints a full layer inventory, then zero source mismatches', () => {
    expect(tiles.width).toBe(HAVEN_MAP_TILES_W);
    expect(tiles.height).toBe(HAVEN_MAP_TILES_H);
    expect(tiles.data.length).toBe(HAVEN_MAP_TILES_W * HAVEN_MAP_TILES_H);

    const generated = havenYamlFragment() as string;
    const liveFragment = readFileSync(join(root, 'content/locations/empery_haven.yaml'), 'utf8');
    if (!liveFragment.includes(generated)) {
      add('yaml', 'fragment', 'content/locations/empery_haven.yaml is not havenYamlFragment() from layout');
    }

    if (yaml.spawn.x !== HAVEN.spawn[0] || yaml.spawn.y !== HAVEN.spawn[1]) {
      add('spawn', 'yaml', `yaml ${yaml.spawn.x},${yaml.spawn.y} ≠ layout ${HAVEN.spawn[0]},${HAVEN.spawn[1]}`);
    }
    const spawnTile = worldToHavenTile(yaml.spawn.x, yaml.spawn.y);
    if (!isWalkableTileGid(gidAt(tiles, spawnTile[0], spawnTile[1]))) {
      add('spawn', 'gid', `spawn tile ${spawnTile} gid=${gidAt(tiles, spawnTile[0], spawnTile[1])} not walkable`);
    }

    const layoutById = new Map(layoutNpcs.map((n) => [n.id, n]));
    const yamlById = new Map(yaml.npcs.map((n) => [n.id, n]));
    for (const n of layoutNpcs) {
      const y = yamlById.get(n.id);
      if (!y) add('npc', n.id, 'in layout, missing from YAML');
      else if (y.x !== n.x || y.y !== n.y) add('npc', n.id, `YAML ${y.x},${y.y} ≠ layout ${n.x},${n.y}`);
    }
    for (const n of yaml.npcs) {
      if (!layoutById.has(n.id)) add('npc', n.id, 'in YAML, missing from layout');
      if (!isTileCenter(n.x, n.y)) add('npc', n.id, `not tile center ${n.x},${n.y}`);
      if (!inMapWorld(n.x, n.y)) add('npc', n.id, `out of map ${n.x},${n.y}`);
      const [tx, ty] = worldToHavenTile(n.x, n.y);
      const g = gidAt(tiles, tx, ty);
      if (!isWalkableTileGid(g)) add('npc', n.id, `tile ${tx},${ty} gid=${g} not walkable`);
    }

    const posts = new Map(HAVEN_NPC_POSTS.map((p) => [p.id, p]));
    for (const n of yaml.npcs) {
      if (YAML_ONLY.has(n.id)) {
        if (posts.has(n.id)) add('posts', n.id, 'yaml-only NPC should not be in HAVEN_NPC_POSTS');
        continue;
      }
      const p = posts.get(n.id);
      if (!p) add('posts', n.id, 'missing HAVEN_NPC_POSTS');
      else if (p.postX !== n.x || p.postY !== n.y) {
        add('posts', n.id, `post ${p.postX},${p.postY} ≠ yaml ${n.x},${n.y}`);
      }
    }
    for (const p of HAVEN_NPC_POSTS) {
      if (!yamlById.has(p.id)) add('posts', p.id, 'post without YAML NPC');
    }

    for (const [id, prop] of Object.entries(NPC_LANDMARK)) {
      const npc = yamlById.get(id);
      const land = HAVEN_NPC_BUILDINGS.find((b) => b.prop === prop);
      if (!npc || !land) {
        add('landmark', id, `missing npc or ${prop}`);
        continue;
      }
      const dist = Math.hypot(npc.x - land.x, npc.y - land.y);
      if (dist >= 220) add('landmark', id, `${dist.toFixed(0)}px from ${prop} origin ${land.x},${land.y}`);
    }

    for (const b of HAVEN_NPC_BUILDINGS) {
      if (!inMapWorld(b.x, b.y)) add('colossus', b.prop, `out of map ${b.x},${b.y}`);
      if (!isTileCenter(b.x, b.y)) add('colossus', b.prop, `not tile center ${b.x},${b.y}`);
      const ex = (HAVEN_NPC_LANDMARK_EXCLUSIONS as Array<{ prop: string; x: number; y: number }>).find(
        (e) => e.prop === b.prop,
      );
      if (!ex) add('colossus', b.prop, 'missing from layout HAVEN_NPC_LANDMARK_EXCLUSIONS');
      else if (ex.x !== b.x || ex.y !== b.y) {
        add('colossus', b.prop, `exclusion ${ex.x},${ex.y} ≠ building ${b.x},${b.y}`);
      }
    }

    const layoutZones = HAVEN.zones as Array<{
      x: number;
      y: number;
      label: string;
      travelTo?: string;
      radius?: number;
    }>;
    if (layoutZones.length !== yaml.zones.length) {
      add('zones', 'count', `layout ${layoutZones.length} ≠ yaml ${yaml.zones.length}`);
    }
    layoutZones.forEach((z, i) => {
      const yz = yaml.zones[i];
      if (!yz) return;
      if (yz.x !== z.x || yz.y !== z.y || yz.label !== z.label || yz.travelTo !== z.travelTo) {
        add('zones', z.label, `yaml ${yz.x},${yz.y} ${yz.label} ≠ layout ${z.x},${z.y}`);
      }
    });

    const layoutStations = HAVEN.stations as Array<{
      id: string;
      kind: string;
      x: number;
      y: number;
      radius: number;
    }>;
    for (const st of layoutStations) {
      const ys = yaml.stations.find((s) => s.id === st.id);
      if (!ys) add('stations', st.id, 'missing from YAML');
      else if (ys.x !== st.x || ys.y !== st.y || ys.kind !== st.kind) {
        add('stations', st.id, `yaml ${ys.x},${ys.y} ≠ layout ${st.x},${st.y}`);
      }
    }

    for (const st of yaml.stations) {
      if (!isTileCenter(st.x, st.y)) add('stations', st.id, `not tile center ${st.x},${st.y}`);
      const [tx, ty] = worldToHavenTile(st.x, st.y);
      if (!inMapTiles(tx, ty)) add('stations', st.id, `tile OOB ${tx},${ty}`);
    }

    for (const lm of yaml.landmarks) {
      if (!isTileCenter(lm.x, lm.y)) add('landmarks', lm.kind, `not tile center ${lm.x},${lm.y}`);
      if (!inMapWorld(lm.x, lm.y)) add('landmarks', lm.kind, `OOB ${lm.x},${lm.y}`);
    }

    const overridePath = join(root, 'content/layouts/empery_haven-props.override.json');
    const liveProps = havenPropPlacements() as Array<[string, number, number, number, number]>;
    if (existsSync(overridePath)) {
      // Override is SoT for city props — do not demand packer index equality
      // (wholesale regenerate wipes the rest of the city). Lock harbor marine rows.
      const dock = (HAVEN.dock ?? []) as Array<[string, number, number, ...number[]]>;
      for (const row of dock) {
        const id = String(row[0]);
        if (!id.startsWith('prop_pier') && !id.startsWith('prop_ship_')) continue;
        const [x, y] = c(Number(row[1]), Number(row[2])) as [number, number];
        const found = HAVEN_CITY_PROPS.some((p) => p[0] === id && p[1] === x && p[2] === y);
        if (!found) add('props', id, `override missing harbor ${id} at ${row[1]},${row[2]}`);
      }
    } else if (liveProps.length !== HAVEN_CITY_PROPS.length) {
      add(
        'props',
        'count',
        `havenPropPlacements() ${liveProps.length} ≠ HAVEN_CITY_PROPS ${HAVEN_CITY_PROPS.length}`,
      );
    } else {
      let propMismatch = 0;
      for (let i = 0; i < liveProps.length; i++) {
        const a = liveProps[i]!;
        const b = HAVEN_CITY_PROPS[i]!;
        if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || a[3] !== b[3] || a[4] !== b[4]) {
          propMismatch += 1;
          if (propMismatch <= 8) {
            add('props', `${i}:${String(a[0])}`, `generated ${a.slice(0, 3)} ≠ city-data ${[b[0], b[1], b[2]]}`);
          }
        }
      }
      if (propMismatch > 8) add('props', 'more', `${propMismatch - 8} further prop mismatches`);
    }

    for (const [id, x, y] of HAVEN_CITY_PROPS) {
      if (!inMapWorld(x, y)) add('props', id, `OOB ${x},${y}`);
      if (!isTileCenter(x, y)) add('props', id, `not tile center ${x},${y}`);
    }

    if (HAVEN_CITY_BANNER.x !== 40 * TW + 32 || HAVEN_CITY_BANNER.y !== 8 * TW + 32) {
      add('banner', 'pos', `${HAVEN_CITY_BANNER.x},${HAVEN_CITY_BANNER.y} ≠ c(40,8)`);
    }

    if (ALL_CITIZEN_DEFS.length !== HAVEN_AMBIENT_ACTOR_COUNT) {
      add('ambient', 'count', `${ALL_CITIZEN_DEFS.length} ≠ ${HAVEN_AMBIENT_ACTOR_COUNT}`);
    }
    ALL_CITIZEN_DEFS.forEach((def, i) => {
      if (def.tiles.length === 0) add('ambient', `#${i}`, 'empty tiles');
      def.tiles.forEach(([tx, ty], wi) => {
        if (!inMapTiles(tx, ty)) add('ambient', `#${i}.${wi}`, `tile OOB ${tx},${ty}`);
      });
      const [tx, ty] = def.tiles[0] ?? [-1, -1];
      const g = gidAt(tiles, tx, ty);
      if (!isWalkableTileGid(g)) add('ambient', `#${i}`, `start ${tx},${ty} gid=${g} not walkable look=${def.look}`);
      if (def.sleepTile) {
        const [sx, sy] = def.sleepTile;
        if (!inMapTiles(sx, sy)) add('ambient', `#${i}-sleep`, `OOB ${sx},${sy}`);
        const sg = gidAt(tiles, sx, sy);
        if (sg === 3) add('ambient', `#${i}-sleep`, `sleep on water ${sx},${sy}`);
      }
    });

    for (const [npcId, tile] of Object.entries(NPC_SLEEP_HOME_TILES)) {
      if (!inMapTiles(tile[0], tile[1])) add('homes', npcId, `OOB ${tile}`);
      const g = gidAt(tiles, tile[0], tile[1]);
      if (g === 3) add('homes', npcId, `sleep on water ${tile} gid=${g}`);
      if (!YAML_ONLY.has(npcId) && !yamlById.has(npcId) && npcId !== 'town_innkeeper') {
        if (!yamlById.has(npcId)) add('homes', npcId, 'home for unknown NPC id');
      }
    }

    GUARD_PATROL_TILES.forEach(([tx, ty], i) => {
      if (!inMapTiles(tx, ty)) add('patrol', `#${i}`, `OOB ${tx},${ty}`);
      const g = gidAt(tiles, tx, ty);
      if (!isWalkableTileGid(g)) add('patrol', `#${i}`, `${tx},${ty} gid=${g} not walkable`);
    });

    for (const w of HAVEN_TILE_WASHES) {
      if (!inMapTiles(w.tx, w.ty)) add('washes', w.label, `OOB ${w.tx},${w.ty}`);
    }

    for (const d of HAVEN_DISTRICTS) {
      if (!inMapWorld(d.x, d.y)) add('districts', d.label, `center OOB ${d.x},${d.y}`);
      if (d.x - d.w / 2 > HAVEN_MAP_TILES_W * TW || d.y - d.h / 2 > HAVEN_MAP_TILES_H * TW) {
        add('districts', d.label, 'ellipse fully outside map');
      }
    }

    const decor = readFileSync(join(root, 'apps/client/src/sprites/location-decor.ts'), 'utf8');
    if (!decor.includes('placeHavenStage(scene, HAVEN_STAGE_LAYOUT.x, HAVEN_STAGE_LAYOUT.y, HAVEN_STAGE_LAYOUT.size)') ||
      HAVEN_STAGE_LAYOUT.x !== 2720 || HAVEN_STAGE_LAYOUT.y !== 1952 || HAVEN_STAGE_LAYOUT.size !== 380) {
      add('anchors', 'stage', 'stage rendering does not use the canonical layout');
    }
    if (!decor.includes('placeHavenGarrison(scene, HAVEN_GARRISON_LAYOUT.origin.x, HAVEN_GARRISON_LAYOUT.origin.y)')) {
      add('anchors', 'garrison', 'garrison rendering does not use the canonical layout');
    }
    if (!decor.includes('const tenementX = 1056') || !decor.includes('const tenementY = 2720')) {
      add('anchors', 'tenement', 'tenement literals drifted from 1056,2720');
    }
    if (!decor.includes('const hx = 58 * tw') || !decor.includes('const hy = 31 * tw')) {
      add('anchors', 'hq-plate', 'HQ fillRect origin drifted from 58*tw,31*tw');
    }
    if (!decor.includes('placeHavenResidentialCourt(scene, HAVEN_RESIDENTIAL_COURT.x, HAVEN_RESIDENTIAL_COURT.y)')) {
      add('anchors', 'court', 'court rendering does not use the canonical layout');
    }

    const bard = yamlById.get('stage_bard');
    if (bard && (bard.x !== 2720 || bard.y !== 1952)) {
      add('anchors', 'stage_bard', `bard ${bard.x},${bard.y} ≠ stage origin 2720,1952`);
    }
    if (!inMapWorld(HAVEN_RESIDENTIAL_COURT.x, HAVEN_RESIDENTIAL_COURT.y)) {
      add('anchors', 'court', 'court center is outside the map');
    }

    const inventory = {
      tiled: `${tiles.width}×${tiles.height}`,
      yamlNpcs: yaml.npcs.length,
      layoutNpcs: layoutNpcs.length,
      posts: HAVEN_NPC_POSTS.length,
      colossi: HAVEN_NPC_BUILDINGS.length,
      props: HAVEN_CITY_PROPS.length,
      ambient: ALL_CITIZEN_DEFS.length,
      homes: Object.keys(NPC_SLEEP_HOME_TILES).length,
      patrol: GUARD_PATROL_TILES.length,
      zones: yaml.zones.length,
      stations: yaml.stations.length,
      landmarks: yaml.landmarks.length,
      washes: HAVEN_TILE_WASHES.length,
      districts: HAVEN_DISTRICTS.length,
      issues: issues.length,
    };
    // Inventory is the audit header — keep it in the assertion message.
    expect(issues, JSON.stringify({ inventory, issues }, null, 2)).toEqual([]);
  });

  it('keeps layout c() identical to havenWorldFromTile for every layout NPC', () => {
    for (const n of layoutNpcs) {
      const [tx, ty] = worldToHavenTile(n.x, n.y);
      const w = havenWorldFromTile(tx, ty);
      const [cx, cy] = c(tx, ty) as [number, number];
      expect(w).toEqual({ x: n.x, y: n.y });
      expect([cx, cy]).toEqual([n.x, n.y]);
    }
  });
});
