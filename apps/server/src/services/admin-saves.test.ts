import { describe, expect, it } from 'vitest';
import type { PlayerSave } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import { applyAdminSavePatch, grantItemToSave } from './admin-saves.js';

function baseSave(over: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return {
    id: 'save-test',
    name: 'Tester',
    race: 'human',
    profession: 'warrior',
    level: 5,
    xp: 100,
    hp: 50,
    maxHp: 100,
    mp: 20,
    maxMp: 40,
    location: 'empery_haven',
    adena: 10,
    inventory: ['rusty_sword'],
    inventoryEnchants: [0],
    equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
    equipmentEnchants: {},
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    karma: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe('applyAdminSavePatch', () => {
  it('clamps hp to maxHp and level to 1..99', () => {
    const patched = applyAdminSavePatch(baseSave({ maxHp: 80, hp: 40 }), {
      hp: 9999,
      level: 500,
      adena: -50,
      karma: -1,
    });
    expect(patched.level).toBe(99);
    expect(patched.adena).toBe(0);
    expect(patched.karma).toBe(0);
    expect(patched.hp).toBeLessThanOrEqual(patched.maxHp);
  });

  it('applies location and xp whitelist only', () => {
    const patched = applyAdminSavePatch(baseSave(), {
      location: 'gods_rift',
      xp: 12345,
    });
    expect(patched.location).toBe('gods_rift');
    expect(patched.xp).toBe(12345);
  });
});

describe('grantItemToSave', () => {
  it('rejects unknown item', () => {
    const result = grantItemToSave(baseSave(), 'no_such_item_zzz', 1);
    expect('error' in result).toBe(true);
  });

  it('grants known item into inventory', () => {
    const result = grantItemToSave(baseSave({ inventory: [], inventoryEnchants: [] }), 'rusty_sword', 3);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.granted).toBe(3);
    expect(result.save.inventory.filter((id) => id === 'rusty_sword')).toHaveLength(3);
  });
});
