import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  HAVEN_BREW_TASTINGS_FLAG,
  HAVEN_BREW_TOAST_CLAIMED_FLAG,
  HOLM_STOUT_ITEM_ID,
  HOLM_TASTE_COST,
  HOLM_TASTE_THRESHOLD,
  HOLM_TOAST_COST,
  buyHolmToast,
  tasteHolmAle,
} from './brewery-tasting.js';
import { applyBrewerChoice, generateBrewerDialogue } from './brewery-tasting-dialogue.js';

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

function brewerNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_brewer.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('holm_stout item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads holm_stout from haven-brewery.yaml', () => {
    const item = getItem(HOLM_STOUT_ITEM_ID);
    expect(item?.name).toBe('Стаут Хольма');
    expect(item?.slot).toBe('consumable');
    expect(item?.rarity).toBe('uncommon');
    expect(item?.survival?.hydration).toBeGreaterThan(28);
  });
});

describe('tasteHolmAle', () => {
  it('rejects tasting if player cannot pay', () => {
    const s0 = testSave({ adena: 5 });
    const res = tasteHolmAle(s0);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(5);
    expect(res.save.questFlags[HAVEN_BREW_TASTINGS_FLAG]).toBeUndefined();
    expect(res.save.questFlags.buff_sup_holm_taste_val).toBeUndefined();
    expect(res.message).toContain('8');
  });

  it('applies critRate buff, deducts adena and increments tasting counter', () => {
    const s0 = testSave({ adena: 40 });
    const res = tasteHolmAle(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(40 - HOLM_TASTE_COST);
    expect(res.save.questFlags.buff_sup_holm_taste_val).toBe(8);
    expect(res.save.questFlags.buff_sup_holm_taste_stat).toBe('critRate');
    expect(res.save.questFlags.buff_sup_holm_taste_name).toBe('Хмельной задор');
    expect(res.save.questFlags[HAVEN_BREW_TASTINGS_FLAG]).toBe(1);
    expect(res.message).toContain('Хмельной задор');
  });

  it('increments haven_brew_tastings on each successful tasting', () => {
    const first = tasteHolmAle(testSave({ adena: 30 }));
    const second = tasteHolmAle(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.questFlags[HAVEN_BREW_TASTINGS_FLAG]).toBe(2);
    expect(second.save.adena).toBe(30 - HOLM_TASTE_COST * 2);
  });
});

describe('buyHolmToast', () => {
  it('sells toast for 20 adena before three tastings', () => {
    const res = buyHolmToast(testSave({ adena: 50 }));
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(50 - HOLM_TOAST_COST);
    expect(res.save.inventory).toContain(HOLM_STOUT_ITEM_ID);
    expect(res.save.questFlags.buff_sup_holm_toast_val).toBe(10);
    expect(res.save.questFlags.buff_sup_holm_toast_stat).toBe('mDef');
    expect(res.save.questFlags.buff_sup_holm_toast_name).toBe('Тост за Гавань');
    expect(res.save.questFlags[HAVEN_BREW_TOAST_CLAIMED_FLAG]).toBeFalsy();
  });

  it('rejects paid toast if player is poor and tastings are below threshold', () => {
    const res = buyHolmToast(testSave({ adena: 10 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(10);
    expect(res.save.inventory).not.toContain(HOLM_STOUT_ITEM_ID);
    expect(res.message).toContain('20');
  });

  it('gives first toast free after three tastings, then charges 20', () => {
    const free = buyHolmToast(
      testSave({
        adena: 5,
        questFlags: { [HAVEN_BREW_TASTINGS_FLAG]: HOLM_TASTE_THRESHOLD },
      }),
    );
    expect(free.ok).toBe(true);
    expect(free.save.adena).toBe(5);
    expect(free.save.inventory).toContain(HOLM_STOUT_ITEM_ID);
    expect(free.save.questFlags[HAVEN_BREW_TOAST_CLAIMED_FLAG]).toBe(true);

    const paid = buyHolmToast(free.save);
    expect(paid.ok).toBe(false);
    expect(paid.message).toContain('20');

    const paidOk = buyHolmToast({ ...free.save, adena: 40 });
    expect(paidOk.ok).toBe(true);
    expect(paidOk.save.adena).toBe(20);
    expect(paidOk.save.inventory.filter((id) => id === HOLM_STOUT_ITEM_ID)).toHaveLength(2);
  });
});

describe('brewer dialogue plugin', () => {
  it('generateBrewerDialogue returns null for other npcs', () => {
    expect(generateBrewerDialogue(brewerNpc({ id: 'town_butcher' }), testSave())).toBeNull();
  });

  it('keeps brew_shop and flavor, adds tasting and toast', () => {
    const dlg = generateBrewerDialogue(brewerNpc(), testSave());
    expect(dlg).not.toBeNull();
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('brew_shop');
    expect(ids).toContain('brew_tasting');
    expect(ids).toContain('brew_toast');
    expect(ids).toContain('brew_taste');
    expect(ids).toContain('brew_craft');
    expect(ids).toContain('brew_leave');
    expect(ids).not.toContain('brew_taste_ale');
  });

  it('mentions tasting count in greeting when > 0', () => {
    const dlg = generateBrewerDialogue(
      brewerNpc(),
      testSave({ questFlags: { [HAVEN_BREW_TASTINGS_FLAG]: 2 } }),
    );
    expect(dlg?.text).toContain('2');
    expect(dlg?.text).toContain('пробовал');
  });

  it('applyBrewerChoice returns null for unknown npc', () => {
    expect(applyBrewerChoice(testSave(), brewerNpc({ id: 'town_butcher' }), 'brew_tasting')).toBeNull();
  });

  it('brew_shop returns save without follow-up', () => {
    const save = testSave();
    const res = applyBrewerChoice(save, brewerNpc(), 'brew_shop');
    expect(res).not.toBeNull();
    expect(res!.followUp).toBeUndefined();
    expect(res!.save).toBe(save);
  });

  it('falls through YAML flavor choices', () => {
    const npc = brewerNpc();
    const save = testSave();
    expect(applyBrewerChoice(save, npc, 'brew_taste')).toBeNull();
    expect(applyBrewerChoice(save, npc, 'brew_craft')).toBeNull();
    expect(applyBrewerChoice(save, npc, 'brew_leave')).toBeNull();
    expect(applyBrewerChoice(save, npc, 'brew_taste_bye')).toBeNull();
    expect(applyBrewerChoice(save, npc, 'brew_craft_bye')).toBeNull();
  });

  it('applies tasting via dialogue and keeps shop choice', () => {
    const npc = brewerNpc();
    const poor = applyBrewerChoice(testSave({ adena: 3 }), npc, 'brew_tasting');
    expect(poor?.save.adena).toBe(3);
    expect(poor?.followUp?.text).toContain('8');

    const ok = applyBrewerChoice(testSave({ adena: 20 }), npc, 'brew_tasting');
    expect(ok?.save.questFlags.buff_sup_holm_taste_val).toBe(8);
    expect(ok?.save.questFlags[HAVEN_BREW_TASTINGS_FLAG]).toBe(1);
    expect(ok?.followUp?.choices.map((c) => c.id)).toContain('brew_shop');
    expect(ok?.followUp?.choices.map((c) => c.id)).toContain('brew_toast');
  });

  it('gates toast through applyBrewerChoice', () => {
    const npc = brewerNpc();
    const paid = applyBrewerChoice(testSave({ adena: 25 }), npc, 'brew_toast');
    expect(paid?.save.inventory).toContain(HOLM_STOUT_ITEM_ID);
    expect(paid?.save.adena).toBe(5);

    const free = applyBrewerChoice(
      testSave({
        adena: 0,
        questFlags: { [HAVEN_BREW_TASTINGS_FLAG]: 3 },
      }),
      npc,
      'brew_toast',
    );
    expect(free?.save.adena).toBe(0);
    expect(free?.save.questFlags[HAVEN_BREW_TOAST_CLAIMED_FLAG]).toBe(true);
    expect(free?.save.questFlags.buff_sup_holm_toast_stat).toBe('mDef');
  });
});
