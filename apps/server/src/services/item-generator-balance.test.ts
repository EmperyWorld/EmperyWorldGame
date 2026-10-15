import { describe, expect, it } from 'vitest';
import {
  STAT_HARD_CAPS,
  assertSaneStats,
  clampStat,
  clampStats,
  mulberry32,
  rollWeaponStats,
  slugifyId,
} from '@empery/shared';

describe('item-generator-balance', () => {
  it('clamps insane values', () => {
    expect(clampStat('pAtk', 65535)).toBe(STAT_HARD_CAPS.pAtk);
    expect(clampStat('pDef', -999)).toBe(0);
    const s = clampStats({ pAtk: 99999, critRate: 500, maxHp: 12 });
    expect(s.pAtk).toBeLessThanOrEqual(STAT_HARD_CAPS.pAtk!);
    expect(s.critRate).toBeLessThanOrEqual(STAT_HARD_CAPS.critRate!);
    expect(s.maxHp).toBe(12);
  });

  it('weapon rolls stay under hard caps', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const stats = rollWeaponStats('daedric', 'melee', 'heavy', rng);
      assertSaneStats(stats);
      expect(stats.pAtk!).toBeLessThanOrEqual(STAT_HARD_CAPS.pAtk!);
    }
  });

  it('slugifyId transliterates', () => {
    expect(slugifyId('Клинок Разлома')).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
