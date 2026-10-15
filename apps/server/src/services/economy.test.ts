import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import {
  buyFromMerchant,
  craftItem,
  estimateSellPrice,
  listShopOffers,
  sellAllBagToMerchant,
  sellToMerchant,
} from './town-services.js';
import { canTravel } from './locations.js';
import { QuestService } from './quests.js';
import { computeStats, applyStatsToSave } from './stats.js';
import { resolvePlayerAttack } from './combat.js';
import { getItem } from './items.js';

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-save',
    name: 'Tester',
    race: 'human',
    profession: 'mystic',
    level: 5,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'empery_haven',
    adena: 500,
    inventory: ['rusty_sword', 'leather_scrap', 'leather_scrap', 'leather_scrap'],
    equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
    skillLevels: { flame_burst: 1, focus_mind: 1 },
    skillCooldowns: {},
    questFlags: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('shop', () => {
  it('lists offers from YAML with sell prices', () => {
    const offers = listShopOffers();
    expect(offers.length).toBeGreaterThan(5);
    const bronze = offers.find((o) => o.item.id === 'bronze_sword');
    expect(bronze?.price).toBe(200);
    expect(bronze?.sellPrice).toBe(90);
  });

  it('buys when adena is enough', () => {
    const save = baseSave({ adena: 200 });
    const result = buyFromMerchant(save, 'bronze_sword');
    expect(result.ok).toBe(true);
    expect(result.save.adena).toBe(0);
    expect(result.save.inventory).toContain('bronze_sword');
  });

  it('rejects buy when adena is insufficient', () => {
    const save = baseSave({ adena: 10 });
    const result = buyFromMerchant(save, 'bronze_sword');
    expect(result.ok).toBe(false);
    expect(result.save.adena).toBe(10);
  });

  it('buys arrows in bulk', () => {
    const save = baseSave({ adena: 500, inventory: [] });
    const result = buyFromMerchant(save, 'wooden_arrow', 20);
    expect(result.ok).toBe(true);
    expect(result.save.inventory.filter((id) => id === 'wooden_arrow')).toHaveLength(20);
    expect(result.save.adena).toBeLessThan(500);
  });

  it('buys consumables in bulk', () => {
    const save = baseSave({ adena: 500, inventory: [] });
    const result = buyFromMerchant(save, 'bread_loaf', 10, 'haven_bakery');
    expect(result.ok).toBe(true);
    expect(result.save.inventory.filter((id) => id === 'bread_loaf')).toHaveLength(10);
    expect(result.save.adena).toBe(500 - 14 * 10);
  });

  it('sells inventory item for estimated price', () => {
    const scrap = getItem('leather_scrap')!;
    const price = estimateSellPrice(scrap);
    const save = baseSave({ inventory: ['leather_scrap'], adena: 0 });
    const result = sellToMerchant(save, 0);
    expect(result.ok).toBe(true);
    expect(result.save.adena).toBe(price);
    expect(result.save.inventory).not.toContain('leather_scrap');
  });

  it('sells entire bag without touching equipment', () => {
    const scrap = getItem('leather_scrap')!;
    const sword = getItem('bronze_sword')!;
    const save = baseSave({
      inventory: ['leather_scrap', 'leather_scrap', 'bronze_sword'],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
      adena: 10,
    });
    const result = sellAllBagToMerchant(save);
    expect(result.ok).toBe(true);
    expect(result.save.inventory).toEqual([]);
    expect(result.save.equipment.weapon).toBe('rusty_sword');
    expect(result.save.adena).toBe(
      10 + estimateSellPrice(scrap) * 2 + estimateSellPrice(sword),
    );
  });
});

describe('craft', () => {
  it('crafts leather gloves from scraps', () => {
    const save = baseSave({
      inventory: ['leather_scrap', 'leather_scrap', 'leather_scrap'],
    });
    const result = craftItem(save, 'craft_leather_gloves');
    expect(result.ok).toBe(true);
    expect(result.save.inventory).toContain('leather_gloves');
    expect(result.save.inventory.filter((id) => id === 'leather_scrap')).toHaveLength(0);
  });

  it('rejects craft without materials', () => {
    const save = baseSave({ inventory: ['leather_scrap'] });
    const result = craftItem(save, 'craft_leather_gloves');
    expect(result.ok).toBe(false);
  });
});

describe('travel unlock', () => {
  it('locks shadow_depths until grove quest complete', () => {
    const locked = canTravel(baseSave({ location: 'starter_grove', questFlags: {} }), 'shadow_depths');
    expect(locked.ok).toBe(false);

    const open = canTravel(
      baseSave({ location: 'starter_grove', questFlags: { quest_grove_complete: true } }),
      'shadow_depths',
    );
    expect(open.ok).toBe(true);
  });
});

describe('quests', () => {
  it('completes depths_clear after required kills', () => {
    const quests = new QuestService();
    let save = baseSave({
      questFlags: { quest_depths_clear_active: true, quest_depths_clear_kills: 3 },
      inventory: [],
    });
    save = quests.onEnemyDefeated(save, 'depths_clear', 'cave_stalker');
    expect(save.questFlags.quest_depths_clear_complete).toBe(true);
    expect(save.inventory).toContain('crystal_helm');
  });
});

describe('mp combat', () => {
  it('blocks mystic skill without enough MP', () => {
    const quests = new QuestService();
    const prepared = baseSave({
      skillLevels: { flame_burst: 1 },
      skillCooldowns: {},
    });
    const save = { ...prepared, mp: 5 };
    const result = resolvePlayerAttack(
      save,
      'goblin_scout',
      30,
      { skillId: 'flame_burst' },
      quests,
    );
    expect(result.insufficientMp).toBe(true);
    expect(result.damage).toBe(0);
    expect(result.save.mp).toBe(5);
  });

  it('spends MP on successful skill cast', () => {
    const quests = new QuestService();
    const prepared = baseSave({
      skillLevels: { flame_burst: 1 },
      skillCooldowns: {},
    });
    const save = { ...prepared, mp: prepared.maxMp ?? 80 };
    const before = save.mp ?? 0;
    const result = resolvePlayerAttack(
      save,
      'goblin_scout',
      30,
      { skillId: 'flame_burst' },
      quests,
    );
    expect(result.insufficientMp).toBeFalsy();
    expect((result.save.mp ?? 0) < before).toBe(true);
  });

  it('spends MP on mystic basic attack', () => {
    const quests = new QuestService();
    const save = { ...baseSave(), mp: 40, skillLevels: {}, skillCooldowns: {} };
    const before = save.mp ?? 0;
    const result = resolvePlayerAttack(save, 'goblin_scout', 30, {}, quests);
    expect(result.insufficientMp).toBeFalsy();
    expect((result.save.mp ?? 0) < before).toBe(true);
  });

  it('blocks mystic basic attack without MP', () => {
    const quests = new QuestService();
    const save = { ...baseSave(), mp: 0, skillLevels: {}, skillCooldowns: {} };
    const result = resolvePlayerAttack(save, 'goblin_scout', 30, {}, quests);
    expect(result.insufficientMp).toBe(true);
    expect(result.damage).toBe(0);
    expect(result.save.mp).toBe(0);
  });

  it('computes maxMp for mystic', () => {
    const stats = computeStats(baseSave({ profession: 'mystic', level: 5 }));
    expect(stats.maxMp).toBeGreaterThan(40);
  });
});
