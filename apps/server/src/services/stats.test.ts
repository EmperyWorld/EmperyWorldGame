import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { equipItem, unequipItem } from './quests.js';
import { computeStats } from './stats.js';
import { activateMadDualist } from './mad-dualist.js';

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return {
    id: 'test-save',
    name: 'Tester',
    race: 'human',
    profession: 'warrior',
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'starter_grove',
    adena: 0,
    inventory: ['rusty_sword'],
    equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('computeStats', () => {
  it('includes weapon stats from equipment', () => {
    const bare = computeStats(baseSave({ equipment: { ...EMPTY_EQUIPMENT }, inventory: [] }));
    const armed = computeStats(baseSave());
    expect(armed.pAtk).toBeGreaterThan(bare.pAtk);
  });

  it('applies mystic mana_flow mpRegen', () => {
    const none = computeStats(
      baseSave({ profession: 'mystic', skillLevels: {}, equipment: { ...EMPTY_EQUIPMENT }, inventory: [] }),
    );
    const flow = computeStats(
      baseSave({
        profession: 'mystic',
        skillLevels: { mana_flow: 2 },
        equipment: { ...EMPTY_EQUIPMENT },
        inventory: [],
      }),
    );
    expect(none.mpRegen ?? 0).toBe(0);
    expect(flow.mpRegen).toBe(4);
  });

  it('applies warrior_life_flow hpRegen', () => {
    const none = computeStats(
      baseSave({ profession: 'warrior', skillLevels: {}, equipment: { ...EMPTY_EQUIPMENT }, inventory: [] }),
    );
    const flow = computeStats(
      baseSave({
        profession: 'warrior',
        skillLevels: { warrior_life_flow: 2 },
        equipment: { ...EMPTY_EQUIPMENT },
        inventory: [],
      }),
    );
    expect(none.hpRegen ?? 0).toBe(0);
    expect(flow.hpRegen).toBe(4);
  });

  it('adds leather cap defense when equipped', () => {
    const save = baseSave({
      inventory: ['leather_cap'],
      equipment: { ...EMPTY_EQUIPMENT },
    });
    const before = computeStats(save);
    const after = computeStats(equipItem(save, 'leather_cap'));
    expect(after.pDef).toBeGreaterThan(before.pDef);
  });
});

describe('equipItem', () => {
  it('moves item from bag to slot and swaps previous gear back', () => {
    const save = baseSave({
      inventory: ['rusty_sword', 'shadow_dagger'],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
    });

    const next = equipItem(save, 'shadow_dagger');
    expect(next.equipment.weapon).toBe('shadow_dagger');
    expect(next.inventory).toContain('rusty_sword');
    expect(next.inventory).not.toContain('shadow_dagger');
  });

  it('keeps inventoryEntries in sync when swapping gear', () => {
    const save = baseSave({
      inventory: ['shadow_dagger'],
      inventoryEntries: [
        {
          id: 'e-test',
          itemId: 'shadow_dagger',
          quantity: 1,
          enchant: 2,
          acquiredAt: new Date().toISOString(),
        },
      ],
      inventoryEnchants: [2],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
      equipmentEnchants: { weapon: 1 },
    });
    const next = equipItem(save, 'shadow_dagger');
    expect(next.equipment.weapon).toBe('shadow_dagger');
    expect(next.equipmentEnchants?.weapon).toBe(2);
    expect(next.inventory).toContain('rusty_sword');
    expect(next.inventoryEntries?.some((e) => e.itemId === 'rusty_sword' && e.enchant === 1)).toBe(true);
    expect(next.inventoryEntries?.some((e) => e.itemId === 'shadow_dagger')).toBe(false);
  });

  it('removes only one copy when bag has duplicates', () => {
    const save = baseSave({
      inventory: ['shadow_dagger', 'shadow_dagger'],
      equipment: { ...EMPTY_EQUIPMENT },
      skillLevels: { mad_dualist: 1 },
      level: 30,
    });
    const next = equipItem(save, 'shadow_dagger');
    expect(next.equipment.weapon).toBe('shadow_dagger');
    expect(next.inventory.filter((id) => id === 'shadow_dagger')).toHaveLength(1);
  });

  it('can equip a second identical light blade to weapon2', () => {
    const save = baseSave({
      inventory: ['shadow_dagger'],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'shadow_dagger', weapon2: null },
      skillLevels: { mad_dualist: 1 },
      level: 30,
      profession: 'rogue',
    });
    const next = equipItem(save, 'shadow_dagger', 'weapon2');
    expect(next.equipment.weapon).toBe('shadow_dagger');
    expect(next.equipment.weapon2).toBe('shadow_dagger');
    expect(next.inventory.filter((id) => id === 'shadow_dagger')).toHaveLength(0);
  });

  it('ignores materials', () => {
    const save = baseSave({ inventory: ['leather_scrap', 'rusty_sword'] });
    const next = equipItem(save, 'leather_scrap');
    expect(next).toEqual(save);
  });
});

describe('unequipItem', () => {
  it('returns item to inventory', () => {
    const save = baseSave({ inventory: [], equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' } });
    const next = unequipItem(save, 'weapon');
    expect(next.equipment.weapon).toBeNull();
    expect(next.inventory.filter((id) => id === 'rusty_sword').length).toBe(1);
  });

  it('preserves enchant level when unequipping', () => {
    const save = baseSave({
      inventory: [],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
      equipmentEnchants: { weapon: 5 },
      inventoryEnchants: [],
    });
    const next = unequipItem(save, 'weapon');
    expect(next.equipmentEnchants?.weapon).toBeUndefined();
    expect(next.inventoryEnchants?.[0]).toBe(5);
  });
});

describe('mad dualist attack speed', () => {
  it('halves attackDelayMs while buff is active', () => {
    const save = baseSave({
      profession: 'rogue',
      level: 30,
      inventory: [],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'shadow_dagger', weapon2: 'falchion' },
      skillLevels: { mad_dualist: 1 },
    });
    const off = computeStats(save);
    const on = computeStats(activateMadDualist(save));
    expect(on.attackDelayMs).toBe(Math.max(80, Math.floor(off.attackDelayMs / 2)));
    expect(on.attackSpeed).toBeGreaterThan(off.attackSpeed);
  });
});

describe('enchant stats', () => {
  it('adds weapon enchant pAtk to stats', () => {
    const save = baseSave({
      equipmentEnchants: { weapon: 4 },
    });
    const plain = computeStats(baseSave());
    const enchanted = computeStats(save);
    expect(enchanted.pAtk - plain.pAtk).toBe(12);
  });
});

describe('shield', () => {
  it('lets warrior equip a shield and grants blockChance', () => {
    const save = baseSave({
      inventory: ['wooden_buckler'],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
    });
    const next = equipItem(save, 'wooden_buckler');
    expect(next.equipment.shield).toBe('wooden_buckler');
    expect(computeStats(next).blockChance).toBeGreaterThanOrEqual(8);
  });

  it('applies shield mastery block only while a shield is equipped', () => {
    const withShield = baseSave({
      level: 20,
      inventory: ['wooden_buckler'],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword', shield: 'wooden_buckler' },
      skillLevels: { shield_mastery: 1 },
    });
    const noShield = baseSave({
      level: 20,
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
      skillLevels: { shield_mastery: 1 },
    });
    expect(computeStats(withShield).blockChance).toBeGreaterThanOrEqual(16);
    expect(computeStats(noShield).blockChance).toBe(0);
  });

  it('adds bastion block while idle and unyielding wall when wounded', () => {
    const save = baseSave({
      level: 29,
      hp: 40,
      maxHp: 200,
      inventory: ['wooden_buckler'],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword', shield: 'wooden_buckler' },
      skillLevels: { shield_bastion: 1, unyielding_wall: 1 },
    });
    const idle = computeStats(save, { moving: false });
    const moving = computeStats(save, { moving: true });
    expect(idle.blockChance).toBeGreaterThan(moving.blockChance);
    expect(idle.blockChance).toBeGreaterThanOrEqual(8 + 10 + 8);
  });

  it('blocks shield for non-warriors', () => {
    const save = baseSave({
      profession: 'rogue',
      inventory: ['wooden_buckler'],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'shadow_dagger' },
    });
    const next = equipItem(save, 'wooden_buckler');
    expect(next.equipment.shield).toBeNull();
  });

  it('unequips weapon2 when equipping a shield', () => {
    const save = baseSave({
      profession: 'warrior',
      inventory: ['wooden_buckler'],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'shadow_dagger', weapon2: 'falchion' },
      skillLevels: { mad_dualist: 1 },
    });
    const next = equipItem(save, 'wooden_buckler');
    expect(next.equipment.shield).toBe('wooden_buckler');
    expect(next.equipment.weapon2).toBeNull();
    expect(next.inventory).toContain('falchion');
  });
});

describe('evasion by profession', () => {
  it('gives rogue high evasion; warrior stays low and relies on block', () => {
    const naked = { ...EMPTY_EQUIPMENT };
    const warrior = computeStats(
      baseSave({ profession: 'warrior', equipment: naked, inventory: [], skillLevels: {} }),
    );
    const rogue = computeStats(
      baseSave({ profession: 'rogue', equipment: naked, inventory: [], skillLevels: {} }),
    );
    expect(rogue.evasion).toBeGreaterThan(warrior.evasion * 2);
    expect(warrior.evasion).toBeLessThan(12);
  });

  it('does not grant move/dash evasion bonus to warrior', () => {
    const save = baseSave({
      profession: 'warrior',
      equipment: { ...EMPTY_EQUIPMENT },
      inventory: [],
      skillLevels: {},
    });
    const idle = computeStats(save, { moving: false });
    const moving = computeStats(save, { moving: true });
    const dashing = computeStats(save, { dashing: true });
    expect(moving.evasion).toBe(idle.evasion);
    expect(dashing.evasion).toBe(idle.evasion);
  });

  it('grants move/dash evasion bonus to rogue', () => {
    const save = baseSave({
      profession: 'rogue',
      equipment: { ...EMPTY_EQUIPMENT },
      inventory: [],
      skillLevels: {},
    });
    const idle = computeStats(save, { moving: false });
    const moving = computeStats(save, { moving: true });
    const dashing = computeStats(save, { dashing: true });
    expect(moving.evasion).toBeGreaterThan(idle.evasion);
    expect(dashing.evasion).toBeGreaterThan(moving.evasion);
  });
});
