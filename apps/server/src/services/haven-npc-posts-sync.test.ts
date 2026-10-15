import { describe, expect, it } from 'vitest';
import { HAVEN_NPC_POSTS } from '@empery/shared';
import { getLocation } from './locations.js';

/** Static props / stage — YAML spawn only, not the commute table. */
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

describe('HAVEN_NPC_POSTS vs empery_haven.yaml', () => {
  it('work posts match location NPC coordinates after the district rebuild', () => {
    const haven = getLocation('empery_haven');
    expect(haven).toBeTruthy();
    const byId = new Map((haven!.npcs ?? []).map((n) => [n.id, n]));

    for (const post of HAVEN_NPC_POSTS) {
      const npc = byId.get(post.id);
      expect(npc, `YAML missing ${post.id}`).toBeTruthy();
      expect(npc!.x, post.id).toBe(post.postX);
      expect(npc!.y, post.id).toBe(post.postY);
    }

    for (const npc of haven!.npcs ?? []) {
      if (YAML_ONLY.has(npc.id)) continue;
      const post = HAVEN_NPC_POSTS.find((p) => p.id === npc.id);
      expect(post, `HAVEN_NPC_POSTS missing ${npc.id}`).toBeTruthy();
    }
  });
});
