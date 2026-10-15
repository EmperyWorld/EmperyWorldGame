import { describe, expect, it } from 'vitest';
import type { PlayerSave } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import {
  balancePartyHp,
  resolveAllyCast,
  resolveSupportCastWithRange,
} from './ally-skills.js';
import { getAllyBuffBonuses } from './ally-buffs.js';
import { skillsForSave } from './skills.js';

function baseSave(over: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return {
    id: 'caster',
    name: 'Caster',
    race: 'human',
    profession: 'support',
    level: 10,
    xp: 0,
    hp: 80,
    maxHp: 150,
    mp: 80,
    maxMp: 100,
    location: 'starter_grove',
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: { support_heal: 1, support_might: 1, support_balance: 1 },
    skillCooldowns: {},
    questFlags: {},
    adena: 0,
    karma: 0,
    pkCount: 0,
    pvpCount: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe('resolveAllyCast / support', () => {
  it('heals ally in party', () => {
    const caster = baseSave({ skillLevels: { support_heal: 2 } });
    const target = baseSave({
      id: 'ally',
      name: 'Ally',
      profession: 'warrior',
      hp: 40,
      maxHp: 200,
      skillLevels: {},
    });
    const result = resolveAllyCast(caster, target, 'support_heal', {
      sameParty: true,
      sameLocation: true,
      distance: 50,
      range: 240,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.healAmount).toBeGreaterThan(0);
    expect(result.target.hp).toBeGreaterThan(40);
    expect(result.caster.skillCooldowns.support_heal).toBeTruthy();
    expect(result.caster.mp ?? 0).toBeLessThan(result.caster.maxMp ?? 999);
  });

  it('buffs self without party', () => {
    const caster = baseSave({
      id: 'w1',
      profession: 'warrior',
      race: 'human',
      skillLevels: { battle_shout: 2 },
      mp: 10,
    });
    const result = resolveAllyCast(caster, caster, 'battle_shout', {
      sameParty: false,
      sameLocation: true,
      distance: 0,
      range: 200,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.buffApplied).toBe(true);
    const buffs = getAllyBuffBonuses(result.target);
    expect(buffs.pAtk).toBeGreaterThan(0);
  });

  it('rejects out of range ally', () => {
    const caster = baseSave({ skillLevels: { support_heal: 1 } });
    const target = baseSave({ id: 'far', hp: 10, skillLevels: {} });
    const result = resolveAllyCast(caster, target, 'support_heal', {
      sameParty: true,
      sameLocation: true,
      distance: 999,
      range: 240,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('OUT_OF_RANGE');
  });

  it('rejects non-party target', () => {
    const caster = baseSave({ skillLevels: { support_heal: 1 } });
    const target = baseSave({ id: 'stranger', hp: 10, skillLevels: {} });
    const result = resolveAllyCast(caster, target, 'support_heal', {
      sameParty: false,
      sameLocation: true,
      distance: 10,
      range: 240,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_PARTY');
  });

  it('balances party HP', () => {
    const a = baseSave({ id: 'a', hp: 100, maxHp: 200, skillLevels: { support_balance: 1 } });
    const b = baseSave({ id: 'b', hp: 20, maxHp: 200, skillLevels: {} });
    const c = baseSave({ id: 'c', hp: 60, maxHp: 200, skillLevels: {} });
    const balanced = balancePartyHp([a, b, c]);
    const sum = balanced.reduce((s, m) => s + m.hp, 0);
    expect(sum).toBe(180);
    expect(balanced.every((m) => m.hp === 60)).toBe(true);
  });

  it('party heal hits members in range', () => {
    const caster = baseSave({
      skillLevels: { support_group_heal: 1 },
      level: 10,
      mp: 100,
    });
    const near = baseSave({ id: 'near', hp: 30, maxHp: 200, skillLevels: {} });
    const far = baseSave({ id: 'far', hp: 30, maxHp: 200, skillLevels: {} });
    const result = resolveSupportCastWithRange(
      caster,
      'support_group_heal',
      [
        { save: caster, distance: 0, sameLocation: true, sameParty: true },
        { save: near, distance: 100, sameLocation: true, sameParty: true },
        { save: far, distance: 2000, sameLocation: true, sameParty: true },
      ],
      { primaryTargetId: caster.id, range: 900 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets).toHaveLength(2);
    expect(result.targets.every((t) => t.save.id !== 'far')).toBe(true);
    expect(result.targets.some((t) => t.save.id === 'near' && t.healAmount > 0)).toBe(true);
  });

  it('elf restores MP', () => {
    const caster = baseSave({
      race: 'elf',
      skillLevels: { support_recharge: 2 },
      mp: 50,
      maxMp: 100,
    });
    const mage = baseSave({
      id: 'mage',
      race: 'elf',
      profession: 'mystic',
      mp: 10,
      maxMp: 120,
      skillLevels: {},
    });
    const result = resolveAllyCast(caster, mage, 'support_recharge', {
      sameParty: true,
      sameLocation: true,
      distance: 40,
      range: 240,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets[0]?.mpAmount ?? 0).toBeGreaterThan(0);
    expect(result.target.mp ?? 0).toBeGreaterThan(10);
  });

  it('rejects wrong race skill', () => {
    const caster = baseSave({
      race: 'orc',
      skillLevels: { support_heal: 1 },
    });
    const result = resolveAllyCast(caster, caster, 'support_heal', {
      sameParty: true,
      sameLocation: true,
      distance: 0,
      range: 240,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('WRONG_RACE');
  });

  it('skillsForSave filters by race', () => {
    const human = skillsForSave({ profession: 'support', race: 'human' });
    const orc = skillsForSave({ profession: 'support', race: 'orc' });
    expect(human.some((s) => s.id === 'support_heal')).toBe(true);
    expect(human.some((s) => s.id === 'support_orc_might')).toBe(false);
    expect(orc.some((s) => s.id === 'support_orc_might')).toBe(true);
    expect(orc.some((s) => s.id === 'support_heal')).toBe(false);
    expect(orc.some((s) => s.id === 'support_robe_mastery')).toBe(true);
  });

  it('heal mastery passive increases heal', () => {
    const base = baseSave({
      skillLevels: { support_heal: 1 },
      mp: 100,
    });
    const mastered = baseSave({
      skillLevels: { support_heal: 1, support_heal_mastery: 3 },
      mp: 100,
    });
    const target = baseSave({ id: 't', hp: 10, maxHp: 500, skillLevels: {} });
    const a = resolveAllyCast(base, target, 'support_heal', {
      sameParty: true,
      sameLocation: true,
      distance: 10,
      range: 240,
    });
    const b = resolveAllyCast(mastered, { ...target }, 'support_heal', {
      sameParty: true,
      sameLocation: true,
      distance: 10,
      range: 240,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.healAmount).toBeGreaterThan(a.healAmount);
  });

  it('war chant passive increases buff amount', () => {
    const base = baseSave({
      race: 'orc',
      skillLevels: { support_orc_might: 1 },
      mp: 100,
    });
    const chant = baseSave({
      race: 'orc',
      skillLevels: { support_orc_might: 1, support_war_chant: 3 },
      mp: 100,
    });
    const a = resolveAllyCast(base, base, 'support_orc_might', {
      sameParty: true,
      sameLocation: true,
      distance: 0,
      range: 240,
    });
    const b = resolveAllyCast(chant, chant, 'support_orc_might', {
      sameParty: true,
      sameLocation: true,
      distance: 0,
      range: 240,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const ba = getAllyBuffBonuses(a.target).pAtk;
    const bb = getAllyBuffBonuses(b.target).pAtk;
    expect(bb).toBeGreaterThan(ba);
  });
});
