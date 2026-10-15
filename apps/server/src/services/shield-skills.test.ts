import { describe, expect, it } from 'vitest';
import type { PlayerSave } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import {
  BLOCK_DAMAGE_TAKEN_BASE,
  SHIELD_BASTION_ID,
  SHIELD_MASTERY_ID,
  SHIELD_RIPOSTE_ID,
  UNYIELDING_WALL_ID,
  activateShieldRiposte,
  blockDamageTaken,
  consumeShieldRiposte,
  getShieldRiposte,
  shieldBastionBlockBonus,
  shieldRiposteModifiers,
  unyieldingFullBlockChance,
  unyieldingWallBlockBonus,
} from './shield-skills.js';

function baseSave(over: Partial<PlayerSave> = {}): PlayerSave {
  return {
    id: 't',
    name: 'Tank',
    race: 'human',
    profession: 'warrior',
    level: 26,
    xp: 0,
    hp: 80,
    maxHp: 200,
    location: 'empery_haven',
    adena: 0,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT, shield: 'wooden_buckler' },
    skillLevels: {
      [SHIELD_MASTERY_ID]: 2,
      [SHIELD_RIPOSTE_ID]: 1,
      [UNYIELDING_WALL_ID]: 1,
      [SHIELD_BASTION_ID]: 1,
    },
    skillCooldowns: {},
    questFlags: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe('shield skills', () => {
  it('improves block mitigation only with a shield', () => {
    expect(blockDamageTaken(baseSave())).toBe(0.26);
    expect(
      blockDamageTaken(baseSave({ equipment: { ...EMPTY_EQUIPMENT } })),
    ).toBe(BLOCK_DAMAGE_TAKEN_BASE);
  });

  it('grants wounded-wall bonuses only below 50% HP', () => {
    expect(unyieldingWallBlockBonus(baseSave(), 0.4)).toBe(8);
    expect(unyieldingWallBlockBonus(baseSave(), 0.6)).toBe(0);
    expect(unyieldingFullBlockChance(baseSave(), 0.4)).toBe(0.12);
    expect(unyieldingFullBlockChance(baseSave(), 0.51)).toBe(0);
  });

  it('grants bastion block only while idle', () => {
    expect(shieldBastionBlockBonus(baseSave(), true)).toBe(10);
    expect(shieldBastionBlockBonus(baseSave(), false)).toBe(0);
  });

  it('arms and consumes riposte on hit', () => {
    const armed = activateShieldRiposte(baseSave());
    expect(getShieldRiposte(armed).active).toBe(true);
    const used = consumeShieldRiposte(armed);
    expect(used.consumed).toBe(true);
    expect(used.rank).toBe(1);
    expect(getShieldRiposte(used.save).active).toBe(false);
    expect(shieldRiposteModifiers(1).damageMult).toBe(1.5);
  });

  it('does not consume expired riposte', () => {
    const stale = baseSave({
      questFlags: { buff_shield_riposte_until: new Date(Date.now() - 1000).toISOString() },
    });
    const used = consumeShieldRiposte(stale);
    expect(used.consumed).toBe(false);
  });
});
