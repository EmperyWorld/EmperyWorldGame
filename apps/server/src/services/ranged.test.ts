import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT, MELEE_ATTACK_RANGE, resolveAttackRange, canEquipBow, canEquipQuiver, canEquipStaff, canEquipArmorType } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import {
  attackRangeForSave,
  consumeQuiverAmmo,
  requireRangedReady,
  applyArcherStarterGear,
  applyMysticStarterGear,
  isRangedWeaponEquipped,
  isStaffEquipped,
} from './ranged.js';
import { computeStats } from './stats.js';
import { canAttackPlayer, distance2d } from './pvp.js';
import { attackReach } from '@empery/shared';

function baseSave(over: Partial<PlayerSave> = {}): PlayerSave {
  return {
    id: 'a',
    name: 'Archer',
    race: 'human',
    profession: 'archer',
    level: 5,
    xp: 0,
    hp: 150,
    maxHp: 150,
    mp: 40,
    maxMp: 40,
    location: 'adena_fields',
    adena: 0,
    inventory: ['wooden_arrow', 'wooden_arrow'],
    equipment: {
      ...EMPTY_EQUIPMENT,
      weapon: 'short_bow',
      quiver: 'wooden_arrow',
    },
    skillLevels: { bow_mastery: 1, power_shot: 1 },
    skillCooldowns: {},
    questFlags: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe('resolveAttackRange', () => {
  it('defaults to melee', () => {
    expect(resolveAttackRange({})).toBe(MELEE_ATTACK_RANGE);
  });

  it('uses weapon or skill max', () => {
    expect(resolveAttackRange({ weaponAttackRange: 160 })).toBe(160);
    expect(resolveAttackRange({ weaponAttackRange: 160, skillAttackRange: 200 })).toBe(200);
  });

  it('adds range bonus only when ranged base exists', () => {
    expect(resolveAttackRange({ rangeBonus: 40 })).toBe(MELEE_ATTACK_RANGE);
    expect(resolveAttackRange({ weaponAttackRange: 160, rangeBonus: 40 })).toBe(200);
  });
});

describe('ranged ammo', () => {
  it('requires bow and quiver', () => {
    expect(requireRangedReady(baseSave()).ok).toBe(true);
    expect(requireRangedReady(baseSave({ equipment: { ...EMPTY_EQUIPMENT, weapon: 'short_bow' } })).ok).toBe(
      false,
    );
  });

  it('consumes inventory arrow then unequips last', () => {
    let save = baseSave({ inventory: ['wooden_arrow'] });
    let spent = consumeQuiverAmmo(save);
    expect(spent.ok).toBe(true);
    expect(spent.save.inventory).toEqual([]);
    expect(spent.save.equipment.quiver).toBe('wooden_arrow');

    spent = consumeQuiverAmmo(spent.save);
    expect(spent.ok).toBe(true);
    expect(spent.save.equipment.quiver).toBeNull();
  });

  it('applyArcherStarterGear sets bow and arrows', () => {
    const raw = baseSave({
      profession: 'archer',
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
      inventory: ['rusty_sword'],
    });
    const next = applyArcherStarterGear(raw);
    expect(next.equipment.weapon).toBe('short_bow');
    expect(next.equipment.quiver).toBe('wooden_arrow');
    expect(next.inventory.every((id) => id === 'wooden_arrow')).toBe(true);
    expect(next.inventory.length).toBe(19);
  });
});

describe('equip rules', () => {
  it('bows and quiver only for archer', () => {
    expect(canEquipBow('archer')).toBe(true);
    expect(canEquipBow('warrior')).toBe(false);
    expect(canEquipQuiver('archer')).toBe(true);
    expect(canEquipQuiver('rogue')).toBe(false);
  });
});

describe('attack range for save + pvp distance', () => {
  it('short_bow has longer reach than melee', () => {
    const range = attackRangeForSave(baseSave());
    expect(range).toBeGreaterThan(MELEE_ATTACK_RANGE);
    const withSkill = attackRangeForSave(baseSave(), 'power_shot');
    expect(withSkill).toBeGreaterThanOrEqual(range);
  });

  it('better bow and range passives extend reach', () => {
    const short = attackRangeForSave(baseSave());
    const hunter = attackRangeForSave(
      baseSave({
        equipment: { ...baseSave().equipment, weapon: 'hunter_bow' },
      }),
    );
    expect(hunter).toBeGreaterThan(short);

    const withFarReach = attackRangeForSave(
      baseSave({
        skillLevels: { ...baseSave().skillLevels, eagle_eye: 3, far_reach: 2 },
      }),
    );
    expect(withFarReach).toBeGreaterThan(short);
  });

  it('rejects out of melee range but allows bow range', () => {
    const dist = 120;
    const meleeGate = canAttackPlayer({
      attackerId: 'a',
      targetId: 'b',
      safeZone: false,
      sameParty: false,
      sameLocation: true,
      attackerHp: 100,
      targetHp: 100,
      distance: dist,
      range: MELEE_ATTACK_RANGE,
    });
    expect(meleeGate.ok).toBe(false);

    const bowRange = attackReach(attackRangeForSave(baseSave()));
    expect(dist).toBeLessThanOrEqual(bowRange);
    const bowGate = canAttackPlayer({
      attackerId: 'a',
      targetId: 'b',
      safeZone: false,
      sameParty: false,
      sameLocation: true,
      attackerHp: 100,
      targetHp: 100,
      distance: dist,
      range: bowRange,
    });
    expect(bowGate.ok).toBe(true);
    expect(distance2d(0, 0, dist, 0)).toBe(dist);
  });
});

describe('mystic ranged staff', () => {
  it('applyMysticStarterGear sets staff and robe', () => {
    const raw = baseSave({
      profession: 'mystic',
      inventory: ['rusty_sword'],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
    });
    const next = applyMysticStarterGear(raw);
    expect(next.equipment.weapon).toBe('apprentice_staff');
    expect(next.equipment.body).toBe('novice_robe');
    expect(isStaffEquipped(next)).toBe(true);
    expect(isRangedWeaponEquipped(next)).toBe(true);
  });

  it('staff has longer reach than melee and no ammo gate', () => {
    const mystic = applyMysticStarterGear(
      baseSave({ profession: 'mystic', equipment: { ...EMPTY_EQUIPMENT }, inventory: [] }),
    );
    expect(attackRangeForSave(mystic)).toBeGreaterThan(MELEE_ATTACK_RANGE);
    expect(requireRangedReady(mystic).ok).toBe(false); // лук-гейт, посоху не нужен
  });

  it('mystic has weak evasion and zero block', () => {
    const mystic = applyMysticStarterGear(
      baseSave({ profession: 'mystic', equipment: { ...EMPTY_EQUIPMENT }, inventory: [] }),
    );
    const stats = computeStats(mystic);
    expect(stats.blockChance ?? 0).toBe(0);
    expect(stats.rangedKind).toBe('magic');
    expect(stats.rangedWeapon).toBe(true);
    const rogue = computeStats(
      baseSave({ profession: 'rogue', equipment: { ...EMPTY_EQUIPMENT }, inventory: [] }),
    );
    expect(stats.evasion).toBeLessThan(rogue.evasion);
  });

  it('equip gates for staff and robe', () => {
    expect(canEquipStaff('mystic')).toBe(true);
    expect(canEquipStaff('support')).toBe(true);
    expect(canEquipStaff('archer')).toBe(false);
    expect(canEquipArmorType('mystic', 'robe')).toBe(true);
    expect(canEquipArmorType('warrior', 'robe')).toBe(false);
    expect(canEquipArmorType('mystic', 'heavy')).toBe(false);
  });
});
