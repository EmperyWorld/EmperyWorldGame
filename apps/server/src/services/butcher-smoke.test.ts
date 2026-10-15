import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { getItem } from './items.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  BUTCHER_JERKY_ACTIVE_FLAG,
  BUTCHER_JERKY_COMPLETE_FLAG,
  BUTCHER_JERKY_REWARD_ADENA,
  RAW_MEAT_ITEM,
  SMOKED_BRISKET_ITEM,
  butcherOrderJerky,
  butcherSmokeMeat,
  claimButcherJerky,
  countRawMeat,
} from './butcher-smoke.js';
import { applyButcherChoice, generateButcherDialogue } from './butcher-smoke-dialogue.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-haven-player',
    name: 'HavenAdventurer',
    race: 'human',
    profession: 'warrior',
    level: 2,
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

function butcherNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_butcher.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('butcher smoke item', () => {
  it('loads smoked_brisket from haven-butcher.yaml', () => {
    const item = getItem(SMOKED_BRISKET_ITEM);
    expect(item?.name).toBe('Копчёная грудинка');
    expect(item?.slot).toBe('consumable');
    expect(item?.survival?.nutrition).toBe(36);
    expect(item?.survival?.warming).toBe(0.2);
    expect(item?.survival?.shelfLifeHours).toBe(96);
  });
});

describe('butcherSmokeMeat', () => {
  it('fails when bag has no raw_meat', () => {
    const res = butcherSmokeMeat(testSave({ inventory: ['cooked_meat'] }));
    expect(res.ok).toBe(false);
    expect(res.save.inventory).toEqual(['cooked_meat']);
    expect(res.message).toContain('Сырого мяса нет');
  });

  it('consumes one raw_meat and gives one smoked_brisket', () => {
    const res = butcherSmokeMeat(testSave({ inventory: [RAW_MEAT_ITEM, RAW_MEAT_ITEM] }));
    expect(res.ok).toBe(true);
    expect(res.save.inventory.filter((id) => id === RAW_MEAT_ITEM)).toHaveLength(1);
    expect(res.save.inventory.filter((id) => id === SMOKED_BRISKET_ITEM)).toHaveLength(1);
  });
});

describe('butcher jerky order', () => {
  it('accepts a one-time order', () => {
    const res = butcherOrderJerky(testSave());
    expect(res.ok).toBe(true);
    expect(res.save.questFlags[BUTCHER_JERKY_ACTIVE_FLAG]).toBe(true);
  });

  it('claims 2 raw_meat for adena and marks complete', () => {
    const accepted = butcherOrderJerky(testSave({ adena: 10 }));
    const withMeat = testSave({
      adena: accepted.save.adena,
      questFlags: accepted.save.questFlags,
      inventory: [RAW_MEAT_ITEM, RAW_MEAT_ITEM, RAW_MEAT_ITEM, 'cooked_meat'],
    });
    const claimed = claimButcherJerky(withMeat);
    expect(claimed.ok).toBe(true);
    expect(claimed.save.adena).toBe(10 + BUTCHER_JERKY_REWARD_ADENA);
    expect(claimed.save.questFlags[BUTCHER_JERKY_COMPLETE_FLAG]).toBe(true);
    expect(claimed.save.questFlags[BUTCHER_JERKY_ACTIVE_FLAG]).toBeFalsy();
    expect(claimed.save.inventory.filter((id) => id === RAW_MEAT_ITEM)).toHaveLength(1);
    expect(claimed.save.inventory).toContain('cooked_meat');
  });

  it('rejects claim without enough raw_meat', () => {
    const res = claimButcherJerky(
      testSave({
        questFlags: { [BUTCHER_JERKY_ACTIVE_FLAG]: true },
        inventory: [RAW_MEAT_ITEM],
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.message).toContain('2');
    expect(res.save.inventory.filter((id) => id === RAW_MEAT_ITEM)).toHaveLength(1);
  });

  it('rejects a second claim after complete', () => {
    const first = claimButcherJerky(
      testSave({
        adena: 0,
        questFlags: { [BUTCHER_JERKY_ACTIVE_FLAG]: true },
        inventory: [RAW_MEAT_ITEM, RAW_MEAT_ITEM],
      }),
    );
    expect(first.ok).toBe(true);
    const second = claimButcherJerky(first.save);
    expect(second.ok).toBe(false);
    expect(second.message).toContain('уже');
    expect(second.save.adena).toBe(BUTCHER_JERKY_REWARD_ADENA);
  });

  it('counts raw_meat for HUD while the order is active', () => {
    const save = testSave({
      questFlags: { [BUTCHER_JERKY_ACTIVE_FLAG]: true },
      inventory: [RAW_MEAT_ITEM, 'cooked_meat', RAW_MEAT_ITEM],
    });
    expect(countRawMeat(save)).toBe(2);
  });
});

describe('butcher dialogue plugin', () => {
  it('generateButcherDialogue returns null for other npcs', () => {
    expect(generateButcherDialogue(butcherNpc({ id: 'town_miller' }), testSave())).toBeNull();
  });

  it('shows shop, smoke and accept until order is taken', () => {
    const dlg = generateButcherDialogue(butcherNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('butcher_shop');
    expect(ids).toContain('butcher_smoke');
    expect(ids).toContain('butcher_jerky_accept');
    expect(ids).not.toContain('butcher_jerky_claim');
    expect(ids).toContain('butcher_tip');
    expect(ids).toContain('butcher_leave');
  });

  it('hides accept and shows claim while order is active', () => {
    const dlg = generateButcherDialogue(
      butcherNpc(),
      testSave({ questFlags: { [BUTCHER_JERKY_ACTIVE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('butcher_shop');
    expect(ids).toContain('butcher_jerky_claim');
    expect(ids).not.toContain('butcher_jerky_accept');
  });

  it('hides accept and claim after complete', () => {
    const dlg = generateButcherDialogue(
      butcherNpc(),
      testSave({ questFlags: { [BUTCHER_JERKY_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('butcher_shop');
    expect(ids).not.toContain('butcher_jerky_accept');
    expect(ids).not.toContain('butcher_jerky_claim');
  });

  it('applyButcherChoice returns null for unknown npc', () => {
    expect(applyButcherChoice(testSave(), butcherNpc({ id: 'town_miller' }), 'butcher_smoke')).toBeNull();
  });

  it('butcher_shop returns save without follow-up', () => {
    const save = testSave();
    const res = applyButcherChoice(save, butcherNpc(), 'butcher_shop');
    expect(res).not.toBeNull();
    expect(res!.followUp).toBeUndefined();
    expect(res!.save).toBe(save);
  });

  it('falls through YAML flavor choices', () => {
    const npc = butcherNpc();
    const save = testSave();
    expect(applyButcherChoice(save, npc, 'butcher_tip')).toBeNull();
    expect(applyButcherChoice(save, npc, 'butcher_leave')).toBeNull();
    expect(applyButcherChoice(save, npc, 'butcher_tip_bye')).toBeNull();
  });

  it('applies smoke via dialogue and keeps remaining choices', () => {
    const npc = butcherNpc();
    const failed = applyButcherChoice(testSave(), npc, 'butcher_smoke');
    expect(failed?.followUp?.text).toContain('Сырого мяса нет');
    expect(failed?.save.inventory).toEqual([]);

    const smoked = applyButcherChoice(
      testSave({ inventory: [RAW_MEAT_ITEM] }),
      npc,
      'butcher_smoke',
    );
    expect(smoked?.save.inventory).toContain(SMOKED_BRISKET_ITEM);
    expect(smoked?.followUp?.choices.map((c) => c.id)).toContain('butcher_shop');
    expect(smoked?.followUp?.choices.map((c) => c.id)).toContain('butcher_jerky_accept');
  });

  it('accepts and claims order through applyButcherChoice', () => {
    const npc = butcherNpc();
    const accepted = applyButcherChoice(testSave(), npc, 'butcher_jerky_accept');
    expect(accepted?.save.questFlags[BUTCHER_JERKY_ACTIVE_FLAG]).toBe(true);
    expect(accepted?.followUp?.choices.map((c) => c.id)).toContain('butcher_jerky_claim');
    expect(accepted?.followUp?.choices.map((c) => c.id)).not.toContain('butcher_jerky_accept');

    const claimed = applyButcherChoice(
      testSave({
        adena: 5,
        questFlags: { [BUTCHER_JERKY_ACTIVE_FLAG]: true },
        inventory: [RAW_MEAT_ITEM, RAW_MEAT_ITEM],
      }),
      npc,
      'butcher_jerky_claim',
    );
    expect(claimed?.save.questFlags[BUTCHER_JERKY_COMPLETE_FLAG]).toBe(true);
    expect(claimed?.save.adena).toBe(5 + BUTCHER_JERKY_REWARD_ADENA);
    expect(claimed?.followUp?.choices.map((c) => c.id)).not.toContain('butcher_jerky_claim');
    expect(claimed?.followUp?.choices.map((c) => c.id)).not.toContain('butcher_jerky_accept');
  });
});
