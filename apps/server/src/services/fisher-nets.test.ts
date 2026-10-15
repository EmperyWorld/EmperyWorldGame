import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT, PLAYER_STAMINA_MAX } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { getItem } from './items.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  FISH_QUEST_ACTIVE_FLAG,
  FISH_QUEST_COMPLETE_FLAG,
  FISH_QUEST_DELIVERED_FLAG,
} from './haven-services.js';
import {
  FISHER_BAIT_COST,
  FISHER_NETS_REWARD_ADENA,
  FISHER_NETS_STAMINA_COST,
  ULF_BAIT_ITEM,
  ULF_NETS_COMPLETE_FLAG,
  fisherBuyBait,
  fisherMendNets,
} from './fisher-nets.js';
import { applyFisherNetsChoice, generateFisherNetsDialogue } from './fisher-nets-dialogue.js';

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
    stamina: PLAYER_STAMINA_MAX,
    staminaAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function fisherNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_fisher.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('ulf_bait item', () => {
  it('loads ulf_bait from haven-fisher.yaml', () => {
    expect(getItem(ULF_BAIT_ITEM)?.name).toBe('Наживка Ульфа');
    expect(getItem(ULF_BAIT_ITEM)?.slot).toBe('material');
    expect(getItem(ULF_BAIT_ITEM)?.icon).toBe('/media/assets/item_ulf_bait.webp');
  });
});

describe('haven_fish shop ids', () => {
  it('keeps existing fish offers', () => {
    const shop = parseYaml(
      readFileSync(join(contentRoot, 'shops/haven_fish.yaml'), 'utf8'),
    ) as { offers: Array<{ id: string }> };
    expect(shop.offers.map((o) => o.id)).toEqual(['raw_fish', 'cooked_fish', 'dried_fish']);
  });
});

describe('fisherBuyBait', () => {
  it('fails when player cannot pay', () => {
    const s0 = testSave({ adena: 5, inventory: ['raw_fish'] });
    const res = fisherBuyBait(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(5);
    expect(res.save.inventory).toEqual(['raw_fish']);
    expect(res.message).toContain(String(FISHER_BAIT_COST));
  });

  it('deducts 6 adena and grants ulf_bait (repeatable)', () => {
    const first = fisherBuyBait(testSave({ adena: 20 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(20 - FISHER_BAIT_COST);
    expect(first.save.inventory).toEqual([ULF_BAIT_ITEM]);

    const second = fisherBuyBait(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(20 - FISHER_BAIT_COST * 2);
    expect(second.save.inventory.filter((id) => id === ULF_BAIT_ITEM)).toHaveLength(2);
  });
});

describe('fisherMendNets', () => {
  it('fails when stamina is below 40', () => {
    const s0 = testSave({ adena: 10, stamina: 39 });
    const res = fisherMendNets(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(10);
    expect(res.save.stamina).toBe(39);
    expect(res.save.questFlags[ULF_NETS_COMPLETE_FLAG]).toBeFalsy();
    expect(res.message).toContain('выносливости');
    expect(res.message).toContain(String(FISHER_NETS_STAMINA_COST));
  });

  it('pays 45 adena, drains 40 stamina, sets complete flag', () => {
    const s0 = testSave({ adena: 7, stamina: 80 });
    const res = fisherMendNets(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(7 + FISHER_NETS_REWARD_ADENA);
    expect(res.save.stamina).toBe(80 - FISHER_NETS_STAMINA_COST);
    expect(res.save.questFlags[ULF_NETS_COMPLETE_FLAG]).toBe(true);
    expect(res.message).toContain(String(FISHER_NETS_REWARD_ADENA));
  });

  it('treats undefined stamina as PLAYER_STAMINA_MAX', () => {
    const base = testSave({ adena: 0 });
    const { stamina: _stamina, staminaAt: _staminaAt, ...rest } = base;
    const s0 = rest as PlayerSave;
    expect(s0.stamina).toBeUndefined();
    const res = fisherMendNets(s0);
    expect(res.ok).toBe(true);
    expect(res.save.stamina).toBe(PLAYER_STAMINA_MAX - FISHER_NETS_STAMINA_COST);
    expect(res.save.questFlags[ULF_NETS_COMPLETE_FLAG]).toBe(true);
  });

  it('rejects a second mend after complete', () => {
    const first = fisherMendNets(testSave({ adena: 0, stamina: 50 }));
    expect(first.ok).toBe(true);
    const second = fisherMendNets(first.save);
    expect(second.ok).toBe(false);
    expect(second.save.adena).toBe(FISHER_NETS_REWARD_ADENA);
    expect(second.save.stamina).toBe(50 - FISHER_NETS_STAMINA_COST);
    expect(second.message).toContain('уже');
  });
});

describe('fisher nets dialogue plugin', () => {
  it('generateFisherNetsDialogue returns null for other npcs', () => {
    expect(generateFisherNetsDialogue(fisherNpc({ id: 'town_miller' }), testSave())).toBeNull();
  });

  it('generate includes fisher_shop, bait, nets and YAML flavor', () => {
    const dlg = generateFisherNetsDialogue(fisherNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('fisher_shop');
    expect(ids).toContain('fisher_bait');
    expect(ids).toContain('fisher_nets');
    expect(ids).toContain('fisher_catch');
    expect(ids).toContain('fisher_tide');
    expect(ids).toContain('fisher_leave');
    expect(ids).toContain('fisher_quest_start');
    expect(ids).not.toContain('fisher_quest_claim');
  });

  it('hides fisher_nets after complete', () => {
    const dlg = generateFisherNetsDialogue(
      fisherNpc(),
      testSave({ questFlags: { [ULF_NETS_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('fisher_shop');
    expect(ids).toContain('fisher_bait');
    expect(ids).not.toContain('fisher_nets');
  });

  it('keeps fish delivery claim visible while delivered', () => {
    const dlg = generateFisherNetsDialogue(
      fisherNpc(),
      testSave({
        questFlags: {
          [FISH_QUEST_ACTIVE_FLAG]: true,
          [FISH_QUEST_DELIVERED_FLAG]: true,
        },
      }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('fisher_quest_claim');
    expect(ids).not.toContain('fisher_quest_start');
    expect(ids).toContain('fisher_shop');
  });

  it('hides fish delivery choices after complete', () => {
    const dlg = generateFisherNetsDialogue(
      fisherNpc(),
      testSave({ questFlags: { [FISH_QUEST_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).not.toContain('fisher_quest_start');
    expect(ids).not.toContain('fisher_quest_claim');
    expect(ids).toContain('fisher_shop');
  });

  it('applyFisherNetsChoice returns null for unknown npc', () => {
    expect(
      applyFisherNetsChoice(fisherNpc({ id: 'town_miller' }), testSave(), 'fisher_bait'),
    ).toBeNull();
  });

  it('apply returns null for fisher_shop and fisher_quest_start', () => {
    const npc = fisherNpc();
    const save = testSave();
    expect(applyFisherNetsChoice(npc, save, 'fisher_shop')).toBeNull();
    expect(applyFisherNetsChoice(npc, save, 'fisher_quest_start')).toBeNull();
    expect(applyFisherNetsChoice(npc, save, 'fisher_quest_claim')).toBeNull();
    expect(applyFisherNetsChoice(npc, save, 'fisher_catch')).toBeNull();
    expect(applyFisherNetsChoice(npc, save, 'fisher_tide')).toBeNull();
    expect(applyFisherNetsChoice(npc, save, 'fisher_leave')).toBeNull();
    expect(applyFisherNetsChoice(npc, save, 'fisher_catch_bye')).toBeNull();
  });

  it('buys bait via apply and keeps remaining choices', () => {
    const npc = fisherNpc();
    const failed = applyFisherNetsChoice(npc, testSave({ adena: 3 }), 'fisher_bait');
    expect(failed?.followUp?.text).toContain(String(FISHER_BAIT_COST));
    expect(failed?.save.adena).toBe(3);
    expect(failed?.save.inventory).toEqual([]);

    const bought = applyFisherNetsChoice(npc, testSave({ adena: 12 }), 'fisher_bait');
    expect(bought?.save.adena).toBe(12 - FISHER_BAIT_COST);
    expect(bought?.save.inventory).toContain(ULF_BAIT_ITEM);
    const followIds = bought?.followUp?.choices.map((c) => c.id) ?? [];
    expect(followIds).toContain('fisher_shop');
    expect(followIds).toContain('fisher_bait');
    expect(followIds).toContain('fisher_nets');
  });

  it('fails nets via apply when stamina is low', () => {
    const npc = fisherNpc();
    const failed = applyFisherNetsChoice(npc, testSave({ stamina: 10, adena: 4 }), 'fisher_nets');
    expect(failed?.save.adena).toBe(4);
    expect(failed?.save.stamina).toBe(10);
    expect(failed?.save.questFlags[ULF_NETS_COMPLETE_FLAG]).toBeFalsy();
    expect(failed?.followUp?.text).toContain('выносливости');
    expect(failed?.followUp?.choices.map((c) => c.id)).toContain('fisher_nets');
  });

  it('mends nets via apply: pay, flag, then hides fisher_nets', () => {
    const npc = fisherNpc();
    const mended = applyFisherNetsChoice(npc, testSave({ adena: 1, stamina: 40 }), 'fisher_nets');
    expect(mended?.save.adena).toBe(1 + FISHER_NETS_REWARD_ADENA);
    expect(mended?.save.stamina).toBe(0);
    expect(mended?.save.questFlags[ULF_NETS_COMPLETE_FLAG]).toBe(true);
    const followIds = mended?.followUp?.choices.map((c) => c.id) ?? [];
    expect(followIds).toContain('fisher_shop');
    expect(followIds).not.toContain('fisher_nets');
  });
});
