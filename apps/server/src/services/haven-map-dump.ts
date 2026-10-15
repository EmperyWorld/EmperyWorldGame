/**
 * Factual Haven census from YAML + Tiled + shared posts/homes.
 * Client-only tables (props, ambient, districts) are merged in admin UI from the same TS modules the game imports.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  HAVEN_NPC_POSTS,
  HAVEN_TILE_SIZE,
  NPC_SLEEP_HOME_TILES,
  guardPatrolWorldPoints,
  havenMapWorldSize,
  havenTileCenter,
  havenWorldFromTile,
} from '@empery/shared';
import { getLocation } from './locations.js';

export type HavenMapSourceHit = {
  id: string;
  x: number;
  y: number;
  source: string;
  extra?: Record<string, unknown>;
};

export type HavenMapDump = {
  locationId: string;
  name: string;
  mapW: number;
  mapH: number;
  tileW: number;
  tilesW: number;
  tilesH: number;
  sources: string[];
  generatedAt: string;
  propsRevision: string;
  spawn: HavenMapSourceHit;
  tiles: { width: number; height: number; tileSize: number; data: number[] };
  props: HavenPropPlacement[];
  npcs: Array<
    HavenMapSourceHit & {
      label: string;
      postX: number | null;
      postY: number | null;
      postMatch: boolean | null;
    }
  >;
  homes: Array<HavenMapSourceHit & { npcId: string; tile: readonly [number, number] }>;
  guardPatrol: Array<{ x: number; y: number; source: string }>;
  zones: Array<
    HavenMapSourceHit & {
      label: string;
      color?: string;
      travelTo?: string;
      radius?: number;
    }
  >;
  stations: Array<HavenMapSourceHit & { kind: string; radius?: number }>;
  landmarks: Array<HavenMapSourceHit & { kind: string }>;
  runtimeAnchors: Array<HavenMapSourceHit & { note: string; size?: number; w?: number; h?: number }>;
};

export type HavenPropPlacement = readonly [
  id: string,
  x: number,
  y: number,
  size: number,
  depth: number,
];

const YAML_ONLY_NPCS = new Set([
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

/** Dev dump: off in production unless EMPERY_DEBUG_HAVEN_MAP=1. */
export function havenMapDumpAllowed(): boolean {
  if (process.env.EMPERY_DEBUG_HAVEN_MAP === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

function readGroundLayer(rootDir: string): {
  width: number;
  height: number;
  tileSize: number;
  data: number[];
} {
  const mapPath = join(rootDir, 'apps/client/public/maps/empery_haven.json');
  const tiled = JSON.parse(readFileSync(mapPath, 'utf8')) as {
    width?: number;
    height?: number;
    tilewidth?: number;
    layers?: Array<{ name?: string; data?: number[] }>;
  };
  const layer = tiled.layers?.find((l) => l.name === 'ground' && Array.isArray(l.data)) ?? tiled.layers?.[0];
  const data = layer?.data ?? [];
  return {
    width: tiled.width ?? 0,
    height: tiled.height ?? 0,
    tileSize: tiled.tilewidth ?? HAVEN_TILE_SIZE,
    data,
  };
}

export function readGeneratedHavenProps(rootDir: string): HavenPropPlacement[] {
  const path = join(rootDir, 'packages/shared/src/haven-city-data.ts');
  const source = readFileSync(path, 'utf8');
  const assignment = 'export const HAVEN_CITY_PROPS: ReadonlyArray<readonly [string, number, number, number, number]> = ';
  const start = source.indexOf(assignment);
  if (start < 0) throw new Error('HAVEN_CITY_PROPS assignment not found');
  const jsonStart = start + assignment.length;
  const jsonEnd = source.indexOf(';\n', jsonStart);
  if (jsonEnd < 0) throw new Error('HAVEN_CITY_PROPS terminator not found');
  return JSON.parse(source.slice(jsonStart, jsonEnd)) as HavenPropPlacement[];
}

export function havenPropsRevision(props: readonly HavenPropPlacement[]): string {
  return createHash('sha256').update(JSON.stringify(props)).digest('hex').slice(0, 16);
}

export function buildHavenMapDump(rootDir: string): HavenMapDump {
  const loc = getLocation('empery_haven');
  if (!loc) {
    throw new Error('empery_haven location not loaded');
  }
  const tiles = readGroundLayer(rootDir);
  const world = havenMapWorldSize(tiles.tileSize);
  const posts = new Map(HAVEN_NPC_POSTS.map((p) => [p.id, p]));
  const props = readGeneratedHavenProps(rootDir);

  const npcs = (loc.npcs ?? []).map((npc) => {
    const post = posts.get(npc.id);
    const yamlOnly = YAML_ONLY_NPCS.has(npc.id);
    return {
      id: npc.id,
      x: npc.x,
      y: npc.y,
      label: npc.label,
      source: 'yaml:npcs',
      postX: post?.postX ?? null,
      postY: post?.postY ?? null,
      postMatch: yamlOnly ? null : post ? post.postX === npc.x && post.postY === npc.y : false,
    };
  });

  const homes = Object.entries(NPC_SLEEP_HOME_TILES).map(([npcId, tile]) => {
    const c = havenTileCenter(tile[0], tile[1], tiles.tileSize);
    return {
      id: `${npcId}:home`,
      npcId,
      tile,
      x: c.x,
      y: c.y,
      source: 'shared:NPC_SLEEP_HOME_TILES',
    };
  });

  const court = havenWorldFromTile(21, 45, tiles.tileSize);

  return {
    locationId: loc.id,
    name: loc.name,
    mapW: world.w,
    mapH: world.h,
    tileW: tiles.tileSize,
    tilesW: tiles.width,
    tilesH: tiles.height,
    sources: [
      'content/locations/empery_haven.yaml',
      'apps/client/public/maps/empery_haven.json',
      'packages/shared/src/haven-npc-posts.ts',
      'packages/shared/src/haven-npc-homes.ts',
      'apps/client/src/sprites/location-decor.ts (runtime fillRect/place*)',
    ],
    generatedAt: new Date().toISOString(),
    propsRevision: havenPropsRevision(props),
    spawn: { id: 'spawn', x: loc.spawn.x, y: loc.spawn.y, source: 'yaml:spawn' },
    tiles: {
      width: tiles.width,
      height: tiles.height,
      tileSize: tiles.tileSize,
      data: tiles.data,
    },
    props,
    npcs,
    homes,
    guardPatrol: guardPatrolWorldPoints(tiles.tileSize).map((p) => ({
      x: p.x,
      y: p.y,
      source: 'shared:GUARD_PATROL_TILES',
    })),
    zones: (loc.zones ?? []).map((z, i) => ({
      id: z.travelTo ?? `zone-${i}`,
      x: z.x,
      y: z.y,
      label: z.label,
      color: z.color,
      travelTo: z.travelTo,
      radius: z.radius,
      source: 'yaml:zones',
    })),
    stations: (loc.stations ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      x: s.x,
      y: s.y,
      radius: s.radius,
      source: 'yaml:stations',
    })),
    landmarks: (loc.landmarks ?? []).map((lm, i) => ({
      id: `landmark-${lm.kind}-${i}`,
      kind: lm.kind,
      x: lm.x,
      y: lm.y,
      source: 'yaml:landmarks',
    })),
    runtimeAnchors: [
      {
        id: 'stage',
        x: 2720,
        y: 1952,
        size: 380,
        note: 'placeHavenStage(scene, 2720, 1952, 380) — origin of procedural stage, not child props',
        source: 'apps/client/src/sprites/location-decor.ts addHavenDecorations',
      },
      {
        id: 'garrison',
        x: 928,
        y: 672,
        note: 'placeHavenGarrison(scene, 928, 672)',
        source: 'apps/client/src/sprites/location-decor.ts addHavenDecorations',
      },
      {
        id: 'tenement',
        x: 1056,
        y: 2720,
        size: 400,
        note: 'tenementX/Y/Size literals → placeWorldProp prop_tenement_block',
        source: 'apps/client/src/sprites/location-decor.ts addHavenDecorations',
      },
      {
        id: 'court',
        x: court.x,
        y: court.y,
        note: 'placeHavenResidentialCourt(px(21, 45)) — tile center, same as c()',
        source: 'apps/client/src/sprites/haven-residential.ts placeHavenResidentialLife',
      },
      {
        id: 'hq-campus-plate',
        x: 58 * tiles.tileSize,
        y: 31 * tiles.tileSize,
        w: 13 * tiles.tileSize,
        h: 9 * tiles.tileSize,
        note: 'fillRect(58*tw, 31*tw, 13*tw, 9*tw) — NW tile corner, not c()',
        source: 'apps/client/src/sprites/location-decor.ts addHavenDecorations',
      },
    ],
  };
}
