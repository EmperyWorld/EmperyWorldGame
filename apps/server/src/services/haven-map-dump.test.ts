import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HAVEN_NPC_POSTS, havenWorldFromTile } from '@empery/shared';
import { buildHavenMapDump, havenMapDumpAllowed } from './haven-map-dump.js';
import { getLocation } from './locations.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../');

describe('havenMapDumpAllowed', () => {
  it('is off in production unless EMPERY_DEBUG_HAVEN_MAP=1', () => {
    const prevNode = process.env.NODE_ENV;
    const prevFlag = process.env.EMPERY_DEBUG_HAVEN_MAP;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.EMPERY_DEBUG_HAVEN_MAP;
      expect(havenMapDumpAllowed()).toBe(false);
      process.env.EMPERY_DEBUG_HAVEN_MAP = '1';
      expect(havenMapDumpAllowed()).toBe(true);
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevFlag === undefined) delete process.env.EMPERY_DEBUG_HAVEN_MAP;
      else process.env.EMPERY_DEBUG_HAVEN_MAP = prevFlag;
    }
  });
});

describe('buildHavenMapDump', () => {
  it('reads the same Tiled+YAML the game uses, without a second transform', () => {
    const dump = buildHavenMapDump(rootDir);
    expect(dump.locationId).toBe('empery_haven');
    expect(dump.tilesW).toBe(120);
    expect(dump.tilesH).toBe(84);
    expect(dump.tileW).toBe(64);
    expect(dump.mapW).toBe(7680);
    expect(dump.mapH).toBe(5376);
    expect(dump.tiles.data.length).toBe(120 * 84);
    expect(dump.tiles.data.some((gid) => gid === 1)).toBe(true);
    expect(dump.tiles.data.some((gid) => gid === 4)).toBe(true);

    const loc = getLocation('empery_haven');
    expect(loc).toBeTruthy();
    expect(dump.spawn.x).toBe(loc!.spawn.x);
    expect(dump.spawn.y).toBe(loc!.spawn.y);
    expect(dump.spawn).toEqual({ id: 'spawn', x: 2592, y: 1312, source: 'yaml:spawn' });

    const captain = dump.npcs.find((n) => n.id === 'town_captain');
    expect(captain).toMatchObject({ x: 864, y: 736, source: 'yaml:npcs', postMatch: true });
    expect(havenWorldFromTile(13, 11)).toEqual({ x: captain!.x, y: captain!.y });

    const yamlOnly = new Set([
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
    for (const post of HAVEN_NPC_POSTS) {
      const npc = dump.npcs.find((n) => n.id === post.id);
      expect(npc, post.id).toBeTruthy();
      expect(npc!.postMatch).toBe(true);
    }
    for (const npc of dump.npcs) {
      if (yamlOnly.has(npc.id)) {
        expect(npc.postMatch).toBeNull();
        continue;
      }
      expect(npc.postMatch, npc.id).toBe(true);
    }

    const campus = dump.runtimeAnchors.find((a) => a.id === 'hq-campus-plate');
    expect(campus).toMatchObject({ x: 58 * 64, y: 31 * 64, w: 13 * 64, h: 9 * 64 });
    const court = dump.runtimeAnchors.find((a) => a.id === 'court');
    expect(court).toEqual(
      expect.objectContaining({ x: havenWorldFromTile(21, 45).x, y: havenWorldFromTile(21, 45).y }),
    );
  });
});
