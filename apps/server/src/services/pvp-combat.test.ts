import { describe, expect, it, vi, afterEach } from 'vitest';
import type { PlayerSave } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import { resolvePvpStrike } from './pvp-combat.js';
import { activateShieldRiposte, getShieldRiposte } from './shield-skills.js';
import { computeStats } from './stats.js';

function baseSave(over: Partial<PlayerSave> = {}): PlayerSave {
  return {
    id: 'atk',
    name: 'Atk',
    race: 'human',
    profession: 'warrior',
    level: 30,
    xp: 0,
    hp: 400,
    maxHp: 400,
    mp: 80,
    maxMp: 80,
    location: 'adena_fields',
    adena: 0,
    inventory: [],
    equipment: {
      ...EMPTY_EQUIPMENT,
      weapon: 'rusty_sword',
      shield: 'wooden_buckler',
    },
    skillLevels: {
      weapon_mastery: 3,
      shield_riposte: 2,
      shield_mastery: 2,
    },
    skillCooldowns: {},
    questFlags: {},
    karma: 0,
    pkCount: 0,
    pvpCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolvePvpStrike passives', () => {
  it('applies passive pAtk from skillLevels (weapon_mastery)', () => {
    const withSkill = baseSave({ skillLevels: { weapon_mastery: 3 } });
    const bare = baseSave({ skillLevels: {} });
    expect(computeStats(withSkill).pAtk).toBeGreaterThan(computeStats(bare).pAtk);
  });

  it('consumes shield riposte on the next PvP hit and boosts damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // always hit, never crit/block

    const armed = activateShieldRiposte(
      baseSave({ id: 'a', skillLevels: { shield_riposte: 1, weapon_mastery: 3 } }),
    );
    expect(getShieldRiposte(armed).active).toBe(true);

    const defender = baseSave({
      id: 'b',
      name: 'Def',
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
      skillLevels: {},
    });

    const withRiposte = resolvePvpStrike({ attacker: armed, defender });
    expect(withRiposte.hit).toBe(true);
    expect(withRiposte.riposteConsumed).toBe(true);
    expect(getShieldRiposte(withRiposte.attacker).active).toBe(false);

    const plain = resolvePvpStrike({
      attacker: baseSave({
        id: 'a',
        skillLevels: { shield_riposte: 1, weapon_mastery: 3 },
      }),
      defender,
    });
    expect(withRiposte.damage).toBeGreaterThan(plain.damage);
  });

  it('arms riposte on the defender after a successful block', () => {
    // hit + crit off, then block
    const rnd = vi.spyOn(Math, 'random');
    rnd.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0);

    const attacker = baseSave({
      id: 'a',
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
      skillLevels: { weapon_mastery: 1 },
    });
    const defender = baseSave({
      id: 'b',
      name: 'Def',
      skillLevels: { shield_riposte: 1, shield_mastery: 3 },
    });
    // Force blockChance ≈ 100% via mocking random after hit/crit rolls
    const defStats = computeStats(defender, { moving: false });
    expect(defStats.blockChance).toBeGreaterThan(0);

    // Always hit, no crit, always block, no full block
    rnd.mockReset();
    rnd
      .mockReturnValueOnce(0) // hit
      .mockReturnValueOnce(0.99) // no crit
      .mockReturnValueOnce(0) // block
      .mockReturnValueOnce(0.99); // no full block

    const strike = resolvePvpStrike({
      attacker,
      defender,
      defenderCtx: { moving: false },
    });
    expect(strike.hit).toBe(true);
    expect(strike.blocked).toBe(true);
    expect(strike.shieldRiposteProc).toBe(true);
    expect(getShieldRiposte(strike.defender).active).toBe(true);
    expect(strike.targetShieldRiposteRemainingMs).toBeGreaterThan(0);
  });
});
