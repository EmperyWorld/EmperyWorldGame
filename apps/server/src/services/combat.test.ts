import { describe, expect, it } from 'vitest';
import {
  calcHitChance,
  calcMagicDamage,
  calcPhysicalDamage,
  playerDefensiveEvasion,
  resolveEnemyHit,
} from './combat.js';
import { EMPTY_EQUIPMENT, calcMagicHitChance, magicLevelDamageMultiplier } from '@empery/shared';
import type { PlayerStats } from './stats.js';
import { applyStatsToSave } from './stats.js';

describe('calcHitChance', () => {
  it('returns higher chance when attacker has more accuracy', () => {
    const low = calcHitChance(20, 30);
    const high = calcHitChance(50, 30);
    expect(high).toBeGreaterThan(low);
  });

  it('allows full dodge for player defense mode', () => {
    expect(calcHitChance(10, 200, true)).toBe(0);
  });

  it('clamps to minimum 20% hit for enemies', () => {
    expect(calcHitChance(1, 999, false)).toBe(0.2);
  });
});

describe('calcMagicHitChance', () => {
  it('is high at equal levels', () => {
    expect(calcMagicHitChance(10, 10)).toBeGreaterThanOrEqual(0.95);
  });

  it('heavily penalizes underleveled caster vs high target (10 vs 18)', () => {
    const vsHigher = calcMagicHitChance(10, 18);
    expect(vsHigher).toBeLessThanOrEqual(0.1);
    expect(vsHigher).toBeGreaterThanOrEqual(0.05);
  });

  it('is nearly impossible vs very high target (10 vs 26)', () => {
    expect(calcMagicHitChance(10, 26)).toBeLessThanOrEqual(0.04);
  });

  it('accuracy slightly improves success vs higher target', () => {
    const plain = calcMagicHitChance(10, 12, 0);
    const accurate = calcMagicHitChance(10, 12, 40);
    expect(accurate).toBeGreaterThan(plain);
  });
});

describe('magicLevelDamageMultiplier', () => {
  it('reduces damage when target is higher level', () => {
    expect(magicLevelDamageMultiplier(10, 18)).toBeLessThan(0.45);
    expect(magicLevelDamageMultiplier(10, 10)).toBe(1);
  });
});

describe('calcPhysicalDamage', () => {
  it('scales with attack and mitigates by defense', () => {
    const attacker = {
      pAtk: 20,
      pDef: 0,
      mAtk: 5,
      mDef: 5,
      accuracy: 20,
      evasion: 10,
      critRate: 5,
      level: 5,
    };
    const soft = {
      pAtk: 0,
      pDef: 5,
      mAtk: 0,
      mDef: 5,
      accuracy: 0,
      evasion: 0,
      critRate: 0,
      level: 1,
    };
    const tank = {
      pAtk: 0,
      pDef: 40,
      mAtk: 0,
      mDef: 40,
      accuracy: 0,
      evasion: 0,
      critRate: 0,
      level: 1,
    };

    const vsSoft = calcPhysicalDamage(attacker, soft);
    const vsTank = calcPhysicalDamage(attacker, tank);
    expect(vsSoft).toBeGreaterThan(vsTank);
    expect(calcPhysicalDamage(attacker, soft, { crit: true })).toBeGreaterThan(vsSoft);
  });
});

describe('calcMagicDamage', () => {
  it('uses mAtk vs mDef (L2-style sqrt)', () => {
    const caster = {
      pAtk: 5,
      pDef: 2,
      mAtk: 25,
      mDef: 10,
      accuracy: 30,
      evasion: 5,
      critRate: 5,
      level: 5,
    };
    const soft = {
      pAtk: 0,
      pDef: 40,
      mAtk: 0,
      mDef: 10,
      accuracy: 0,
      evasion: 0,
      critRate: 0,
      level: 1,
    };
    const resist = {
      pAtk: 0,
      pDef: 5,
      mAtk: 0,
      mDef: 40,
      accuracy: 0,
      evasion: 0,
      critRate: 0,
      level: 1,
    };
    const vsSoft = calcMagicDamage(caster, soft);
    const vsResist = calcMagicDamage(caster, resist);
    expect(vsSoft).toBeGreaterThan(vsResist);
    expect(vsSoft).toBeGreaterThan(10);
  });
});

describe('playerDefensiveEvasion', () => {
  const baseStats: PlayerStats = {
    maxHp: 100,
    maxMp: 40,
    damage: 10,
    defense: 5,
    pAtk: 10,
    pDef: 5,
    mAtk: 5,
    mDef: 8,
    accuracy: 30,
    evasion: 20,
    critRate: 5,
    speed: 200,
    attackDelayMs: 400,
    attackSpeed: 50,
    str: 10,
    dex: 12,
    con: 10,
    evasionWhileMoving: 0,
    evasionWhileIdle: 0,
  };

  it('adds idle bonus when standing still', () => {
    const idle = playerDefensiveEvasion(baseStats, { moving: false, dashing: false });
    const moving = playerDefensiveEvasion(baseStats, { moving: true, dashing: false });
    expect(idle).toBeGreaterThan(moving);
  });
});

describe('resolveEnemyHit dash i-frames', () => {
  it('forces a perfect dodge while dashing', () => {
    const now = new Date().toISOString();
    const save = applyStatsToSave({
      id: 'dash-dodge',
      name: 'Dash',
      race: 'human',
      profession: 'rogue',
      level: 5,
      xp: 0,
      hp: 80,
      maxHp: 80,
      location: 'adena_fields',
      inventory: [],
      equipment: { ...EMPTY_EQUIPMENT },
      skillLevels: {},
      skillCooldowns: {},
      questFlags: {},
      createdAt: now,
      updatedAt: now,
    });
    const result = resolveEnemyHit(save, 'field_scavenger', { dashing: true, moving: true });
    expect(result.hit).toBe(false);
    expect(result.dodged).toBe(true);
    expect(result.perfectDodge).toBe(true);
    expect(result.damage).toBe(0);
    expect(result.save.hp).toBe(save.hp);
  });
});
