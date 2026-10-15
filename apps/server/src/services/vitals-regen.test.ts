import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyVitalsRegen } from './vitals-regen.js';

function save(partial: Partial<PlayerSave> = {}): PlayerSave {
  return {
    id: 's1',
    name: 'Hero',
    race: 'human',
    profession: 'warrior',
    level: 1,
    xp: 0,
    hp: 50,
    maxHp: 100,
    mp: 10,
    maxMp: 40,
    location: 'starter_grove',
    adena: 0,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

function stats(partial: { hpRegen?: number; mpRegen?: number; maxHp?: number; maxMp?: number } = {}) {
  return {
    maxHp: 100,
    maxMp: 40,
    hpRegen: 4,
    mpRegen: 3,
    ...partial,
  };
}

describe('applyVitalsRegen', () => {
  it('heals hp and mp up to caps', () => {
    const next = applyVitalsRegen(save(), stats());
    expect(next.hp).toBe(54);
    expect(next.mp).toBe(13);
  });

  it('skips dead characters and no-ops at full vitals', () => {
    expect(applyVitalsRegen(save({ hp: 0 }), stats())).toMatchObject({ hp: 0, mp: 10 });
    const full = save({ hp: 100, mp: 40 });
    expect(applyVitalsRegen(full, stats())).toBe(full);
  });
});
