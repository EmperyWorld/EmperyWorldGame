import { describe, expect, it } from 'vitest';
import {
  armorEnchantBonus,
  enchantCost,
  enchantSuccessRate,
  weaponEnchantBonus,
} from '@empery/shared';

describe('enchant formulas', () => {
  it('safe enchant is guaranteed', () => {
    expect(enchantSuccessRate(0)).toBe(1);
    expect(enchantSuccessRate(2)).toBe(1);
  });

  it('risky enchant drops after +3', () => {
    expect(enchantSuccessRate(3)).toBeCloseTo(0.7);
    expect(enchantSuccessRate(4)).toBeCloseTo(0.49);
  });

  it('weapon bonus doubles over-enchant rate from +4', () => {
    expect(weaponEnchantBonus(3)).toEqual({ pAtk: 6 });
    expect(weaponEnchantBonus(4)).toEqual({ pAtk: 12 });
    expect(weaponEnchantBonus(10)).toEqual({ pAtk: 48 });
  });

  it('armor bonus triples pDef and adds HP from +4', () => {
    expect(armorEnchantBonus(3)).toEqual({ pDef: 3, maxHp: 0 });
    expect(armorEnchantBonus(4)).toEqual({ pDef: 6, maxHp: 5 });
    expect(armorEnchantBonus(10)).toEqual({ pDef: 24, maxHp: 35 });
  });

  it('cost doubles each level', () => {
    expect(enchantCost(0)).toBe(100);
    expect(enchantCost(3)).toBe(800);
  });
});
