import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import { applyHqGateChoice, generateHqGateDialogue } from './hq-gate-dialogue.js';
import {
  HQ_ACCESS_FLAG,
  HQ_ACCESS_GREETING,
  HQ_BADGE_ALREADY_MESSAGE,
  HQ_BADGE_COST,
  HQ_BADGE_FLAG,
  HQ_BADGE_NO_ACCESS_MESSAGE,
  HQ_BRIEFING_TEXT,
  HQ_DEPTHS_BOSS_COMPLETE_FLAG,
  HQ_GROVE_COMPLETE_FLAG,
  HQ_VISITOR_BADGE_ID,
  buyHqVisitorBadge,
  hqGateBriefing,
  isHqGateQualified,
} from './hq-gate.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import { applyStatsToSave } from './stats.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-haven-player',
    name: 'HavenAdventurer',
    race: 'human',
    profession: 'warrior',
    level: 1,
    xp: 0,
    hp: 40,
    maxHp: 100,
    mp: 10,
    maxMp: 50,
    location: 'empery_haven',
    adena: 100,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    karma: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function sentryNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_hq_sentry.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

function choiceIds(save: PlayerSave, npc: HavenNpcLike = sentryNpc()): string[] {
  return generateHqGateDialogue(npc, save)?.choices.map((c) => c.id) ?? [];
}

describe('hq_visitor_badge item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads from haven-hq.yaml as material', () => {
    const item = getItem(HQ_VISITOR_BADGE_ID);
    expect(item?.name).toBe('Гостевой жетон HQ');
    expect(item?.slot).toBe('material');
    expect(item?.icon).toBe('/media/assets/item_hq_visitor_badge.webp');
  });
});

describe('hqGateBriefing', () => {
  it('is free, repeatable and does not set a flag', () => {
    const save = testSave();
    const first = hqGateBriefing(save);
    expect(first.ok).toBe(true);
    expect(first.save).toBe(save);
    expect(first.message).toBe(HQ_BRIEFING_TEXT);
    expect(first.message).toMatch(/кампус|лаборатор|антенн/i);

    const second = hqGateBriefing(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.questFlags).toEqual({});
  });
});

describe('buyHqVisitorBadge', () => {
  it('rejects without quest_empery_hq_access', () => {
    const res = buyHqVisitorBadge(testSave({ adena: 50 }));
    expect(res.ok).toBe(false);
    expect(res.message).toBe(HQ_BADGE_NO_ACCESS_MESSAGE);
    expect(res.save.adena).toBe(50);
    expect(res.save.inventory).not.toContain(HQ_VISITOR_BADGE_ID);
  });

  it('rejects without enough adena', () => {
    const res = buyHqVisitorBadge(
      testSave({ adena: 5, questFlags: { [HQ_ACCESS_FLAG]: true } }),
    );
    expect(res.ok).toBe(false);
    expect(res.message).toContain(String(HQ_BADGE_COST));
    expect(res.save.adena).toBe(5);
    expect(res.save.inventory).not.toContain(HQ_VISITOR_BADGE_ID);
    expect(res.save.questFlags[HQ_BADGE_FLAG]).toBeFalsy();
  });

  it('sells once then blocks via haven_hq_badge', () => {
    const first = buyHqVisitorBadge(
      testSave({ adena: 40, questFlags: { [HQ_ACCESS_FLAG]: true } }),
    );
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(40 - HQ_BADGE_COST);
    expect(first.save.inventory).toContain(HQ_VISITOR_BADGE_ID);
    expect(first.save.questFlags[HQ_BADGE_FLAG]).toBe(true);

    const second = buyHqVisitorBadge(first.save);
    expect(second.ok).toBe(false);
    expect(second.message).toBe(HQ_BADGE_ALREADY_MESSAGE);
    expect(second.save.adena).toBe(first.save.adena);
    expect(second.save.inventory.filter((id) => id === HQ_VISITOR_BADGE_ID)).toHaveLength(1);
  });
});

describe('isHqGateQualified', () => {
  it('accepts grove, depths boss or level >= 5', () => {
    expect(isHqGateQualified(testSave({ level: 1 }))).toBe(false);
    expect(
      isHqGateQualified(testSave({ level: 1, questFlags: { [HQ_GROVE_COMPLETE_FLAG]: true } })),
    ).toBe(true);
    expect(
      isHqGateQualified(
        testSave({ level: 1, questFlags: { [HQ_DEPTHS_BOSS_COMPLETE_FLAG]: true } }),
      ),
    ).toBe(true);
    expect(isHqGateQualified(testSave({ level: 5 }))).toBe(true);
  });
});

describe('hq gate dialogue plugin', () => {
  it('generateHqGateDialogue returns null for other npcs', () => {
    expect(generateHqGateDialogue(sentryNpc({ id: 'town_miller' }), testSave())).toBeNull();
  });

  it('without access hides badge and shows briefing', () => {
    const ids = choiceIds(testSave({ level: 1 }));
    expect(ids).toContain('hq_briefing');
    expect(ids).toContain('hq_ask_access');
    expect(ids).toContain('hq_leave');
    expect(ids).not.toContain('hq_badge');
    expect(ids).not.toContain('hq_verify_credentials');
  });

  it('qualified shows hq_verify_credentials', () => {
    expect(choiceIds(testSave({ level: 5 }))).toContain('hq_verify_credentials');
    expect(
      choiceIds(testSave({ level: 1, questFlags: { [HQ_GROVE_COMPLETE_FLAG]: true } })),
    ).toContain('hq_verify_credentials');
    expect(
      choiceIds(testSave({ level: 1, questFlags: { [HQ_DEPTHS_BOSS_COMPLETE_FLAG]: true } })),
    ).toContain('hq_verify_credentials');
  });

  it('with access greets and offers leave, briefing and badge', () => {
    const dlg = generateHqGateDialogue(
      sentryNpc(),
      testSave({ questFlags: { [HQ_ACCESS_FLAG]: true } }),
    );
    expect(dlg).not.toBeNull();
    expect(dlg!.text).toBe(HQ_ACCESS_GREETING);
    expect(dlg!.text).toContain('Допуск подтверждён');
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('hq_leave');
    expect(ids).toContain('hq_briefing');
    expect(ids).toContain('hq_badge');
    expect(ids).not.toContain('hq_verify_credentials');
    expect(ids).not.toContain('hq_ask_access');
  });

  it('hides badge after haven_hq_badge', () => {
    const ids = choiceIds(
      testSave({ questFlags: { [HQ_ACCESS_FLAG]: true, [HQ_BADGE_FLAG]: true } }),
    );
    expect(ids).toContain('hq_briefing');
    expect(ids).not.toContain('hq_badge');
  });

  it('apply returns null for hq_verify_credentials and hq_leave', () => {
    const npc = sentryNpc();
    const save = testSave({ level: 5 });
    expect(applyHqGateChoice(npc, save, 'hq_verify_credentials')).toBeNull();
    expect(applyHqGateChoice(npc, save, 'hq_leave')).toBeNull();
    expect(applyHqGateChoice(npc, save, 'hq_ask_access')).toBeNull();
    expect(applyHqGateChoice(sentryNpc({ id: 'town_miller' }), save, 'hq_briefing')).toBeNull();
  });

  it('with access can buy badge once through apply', () => {
    const npc = sentryNpc();
    const bought = applyHqGateChoice(
      npc,
      testSave({ adena: 20, questFlags: { [HQ_ACCESS_FLAG]: true } }),
      'hq_badge',
    );
    expect(bought).not.toBeNull();
    expect(bought!.save.adena).toBe(0);
    expect(bought!.save.inventory).toContain(HQ_VISITOR_BADGE_ID);
    expect(bought!.save.questFlags[HQ_BADGE_FLAG]).toBe(true);
    expect(bought!.followUp?.choices.map((c) => c.id)).not.toContain('hq_badge');
    expect(bought!.followUp?.choices.map((c) => c.id)).toContain('hq_briefing');
    expect(bought!.followUp?.choices.map((c) => c.id)).toContain('hq_leave');

    const again = applyHqGateChoice(npc, bought!.save, 'hq_badge');
    expect(again?.save.adena).toBe(0);
    expect(again?.followUp?.text).toBe(HQ_BADGE_ALREADY_MESSAGE);
    expect(again?.save.inventory.filter((id) => id === HQ_VISITOR_BADGE_ID)).toHaveLength(1);
  });

  it('briefing follow-up is repeatable without a flag', () => {
    const npc = sentryNpc();
    const first = applyHqGateChoice(npc, testSave(), 'hq_briefing');
    expect(first?.followUp?.text).toBe(HQ_BRIEFING_TEXT);
    expect(first?.save.questFlags).toEqual({});
    expect(first?.followUp?.choices.map((c) => c.id)).toContain('hq_briefing');

    const second = applyHqGateChoice(npc, first!.save, 'hq_briefing');
    expect(second?.followUp?.text).toBe(HQ_BRIEFING_TEXT);
    expect(second?.save.questFlags).toEqual({});
  });
});
