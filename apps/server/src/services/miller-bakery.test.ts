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
  MILLER_BREAD_ITEM,
  MILLER_FLOUR_ITEM,
  MILLER_GRAIN_ITEM,
  MILLER_ORDER_ACTIVE_FLAG,
  MILLER_ORDER_COMPLETE_FLAG,
  MILLER_ORDER_REWARD_ADENA,
  acceptMillerOrder,
  claimMillerOrder,
  millerBakeBread,
  millerMillGrain,
} from './miller-bakery.js';
import { applyMillerChoice, generateMillerDialogue } from './miller-bakery-dialogue.js';

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

function millerNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_miller.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('miller bakery items', () => {
  it('loads mill_grain and mill_flour from haven-miller.yaml', () => {
    expect(getItem(MILLER_GRAIN_ITEM)?.name).toBe('Рожь');
    expect(getItem(MILLER_FLOUR_ITEM)?.name).toBe('Мука');
    expect(getItem(MILLER_GRAIN_ITEM)?.slot).toBe('material');
    expect(getItem(MILLER_FLOUR_ITEM)?.slot).toBe('material');
  });
});

describe('millerMillGrain', () => {
  it('fails when bag has no grain', () => {
    const res = millerMillGrain(testSave({ inventory: ['bread_loaf'] }));
    expect(res.ok).toBe(false);
    expect(res.save.inventory).toEqual(['bread_loaf']);
    expect(res.message).toContain('зерна');
  });

  it('consumes one mill_grain and gives one mill_flour', () => {
    const res = millerMillGrain(testSave({ inventory: [MILLER_GRAIN_ITEM, MILLER_GRAIN_ITEM] }));
    expect(res.ok).toBe(true);
    expect(res.save.inventory.filter((id) => id === MILLER_GRAIN_ITEM)).toHaveLength(1);
    expect(res.save.inventory.filter((id) => id === MILLER_FLOUR_ITEM)).toHaveLength(1);
  });
});

describe('millerBakeBread', () => {
  it('fails without flour', () => {
    const res = millerBakeBread(testSave({ inventory: [MILLER_GRAIN_ITEM] }));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Муки нет');
  });

  it('consumes flour, gives bread_loaf and miller_fresh buff', () => {
    const res = millerBakeBread(testSave({ inventory: [MILLER_FLOUR_ITEM] }));
    expect(res.ok).toBe(true);
    expect(res.save.inventory).toContain(MILLER_BREAD_ITEM);
    expect(res.save.inventory).not.toContain(MILLER_FLOUR_ITEM);
    expect(res.save.questFlags.buff_sup_miller_fresh_val).toBe(6);
    expect(res.save.questFlags.buff_sup_miller_fresh_name).toBe('Свежий каравай');
    expect(res.save.questFlags.buff_sup_miller_fresh_stat).toBe('mpRegen');
    expect(res.message).toContain('каравай');
  });
});

describe('miller flour order', () => {
  it('accepts a one-time order', () => {
    const res = acceptMillerOrder(testSave());
    expect(res.ok).toBe(true);
    expect(res.save.questFlags[MILLER_ORDER_ACTIVE_FLAG]).toBe(true);
  });

  it('claims 3 flour for adena and marks complete', () => {
    const accepted = acceptMillerOrder(testSave({ adena: 10 }));
    const withFlour = testSave({
      adena: accepted.save.adena,
      questFlags: accepted.save.questFlags,
      inventory: [MILLER_FLOUR_ITEM, MILLER_FLOUR_ITEM, MILLER_FLOUR_ITEM, MILLER_GRAIN_ITEM],
    });
    const claimed = claimMillerOrder(withFlour);
    expect(claimed.ok).toBe(true);
    expect(claimed.save.adena).toBe(10 + MILLER_ORDER_REWARD_ADENA);
    expect(claimed.save.questFlags[MILLER_ORDER_COMPLETE_FLAG]).toBe(true);
    expect(claimed.save.questFlags[MILLER_ORDER_ACTIVE_FLAG]).toBeFalsy();
    expect(claimed.save.inventory.filter((id) => id === MILLER_FLOUR_ITEM)).toHaveLength(0);
    expect(claimed.save.inventory).toContain(MILLER_GRAIN_ITEM);
  });

  it('rejects claim without enough flour', () => {
    const res = claimMillerOrder(
      testSave({
        questFlags: { [MILLER_ORDER_ACTIVE_FLAG]: true },
        inventory: [MILLER_FLOUR_ITEM, MILLER_FLOUR_ITEM],
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.message).toContain('3');
    expect(res.save.inventory.filter((id) => id === MILLER_FLOUR_ITEM)).toHaveLength(2);
  });

  it('rejects a second claim after complete', () => {
    const first = claimMillerOrder(
      testSave({
        adena: 0,
        questFlags: { [MILLER_ORDER_ACTIVE_FLAG]: true },
        inventory: [MILLER_FLOUR_ITEM, MILLER_FLOUR_ITEM, MILLER_FLOUR_ITEM],
      }),
    );
    expect(first.ok).toBe(true);
    const second = claimMillerOrder(first.save);
    expect(second.ok).toBe(false);
    expect(second.message).toContain('уже');
    expect(second.save.adena).toBe(MILLER_ORDER_REWARD_ADENA);
  });
});

describe('miller dialogue plugin', () => {
  it('generateMillerDialogue returns null for other npcs', () => {
    expect(generateMillerDialogue(millerNpc({ id: 'town_butcher' }), testSave())).toBeNull();
  });

  it('shows miller_shop, mill and bake; accept until order is taken', () => {
    const dlg = generateMillerDialogue(millerNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('miller_shop');
    expect(ids).toContain('miller_mill');
    expect(ids).toContain('miller_bake');
    expect(ids).toContain('miller_order_accept');
    expect(ids).not.toContain('miller_order_claim');
    expect(ids).toContain('miller_grain');
    expect(ids).toContain('miller_leave');
  });

  it('hides accept and shows claim while order is active', () => {
    const dlg = generateMillerDialogue(
      millerNpc(),
      testSave({ questFlags: { [MILLER_ORDER_ACTIVE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('miller_shop');
    expect(ids).toContain('miller_order_claim');
    expect(ids).not.toContain('miller_order_accept');
  });

  it('hides accept and claim after complete', () => {
    const dlg = generateMillerDialogue(
      millerNpc(),
      testSave({ questFlags: { [MILLER_ORDER_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('miller_shop');
    expect(ids).not.toContain('miller_order_accept');
    expect(ids).not.toContain('miller_order_claim');
  });

  it('applyMillerChoice returns null for unknown npc', () => {
    expect(applyMillerChoice(testSave(), millerNpc({ id: 'town_butcher' }), 'miller_mill')).toBeNull();
  });

  it('miller_shop returns save without follow-up', () => {
    const save = testSave();
    const res = applyMillerChoice(save, millerNpc(), 'miller_shop');
    expect(res).not.toBeNull();
    expect(res!.followUp).toBeUndefined();
    expect(res!.save).toBe(save);
  });

  it('falls through YAML flavor choices', () => {
    const npc = millerNpc();
    const save = testSave();
    expect(applyMillerChoice(save, npc, 'miller_grain')).toBeNull();
    expect(applyMillerChoice(save, npc, 'miller_storm')).toBeNull();
    expect(applyMillerChoice(save, npc, 'miller_leave')).toBeNull();
    expect(applyMillerChoice(save, npc, 'miller_grain_bye')).toBeNull();
  });

  it('applies mill via dialogue and keeps remaining choices', () => {
    const npc = millerNpc();
    const failed = applyMillerChoice(testSave(), npc, 'miller_mill');
    expect(failed?.followUp?.text).toContain('зерна');
    expect(failed?.save.inventory).toEqual([]);

    const milled = applyMillerChoice(
      testSave({ inventory: [MILLER_GRAIN_ITEM] }),
      npc,
      'miller_mill',
    );
    expect(milled?.save.inventory).toContain(MILLER_FLOUR_ITEM);
    expect(milled?.followUp?.choices.map((c) => c.id)).toContain('miller_shop');
    expect(milled?.followUp?.choices.map((c) => c.id)).toContain('miller_bake');
  });

  it('accepts and claims order through applyMillerChoice', () => {
    const npc = millerNpc();
    const accepted = applyMillerChoice(testSave(), npc, 'miller_order_accept');
    expect(accepted?.save.questFlags[MILLER_ORDER_ACTIVE_FLAG]).toBe(true);
    expect(accepted?.followUp?.choices.map((c) => c.id)).toContain('miller_order_claim');
    expect(accepted?.followUp?.choices.map((c) => c.id)).not.toContain('miller_order_accept');

    const claimed = applyMillerChoice(
      testSave({
        adena: 5,
        questFlags: { [MILLER_ORDER_ACTIVE_FLAG]: true },
        inventory: [MILLER_FLOUR_ITEM, MILLER_FLOUR_ITEM, MILLER_FLOUR_ITEM],
      }),
      npc,
      'miller_order_claim',
    );
    expect(claimed?.save.questFlags[MILLER_ORDER_COMPLETE_FLAG]).toBe(true);
    expect(claimed?.save.adena).toBe(5 + MILLER_ORDER_REWARD_ADENA);
    expect(claimed?.followUp?.choices.map((c) => c.id)).not.toContain('miller_order_claim');
  });
});
