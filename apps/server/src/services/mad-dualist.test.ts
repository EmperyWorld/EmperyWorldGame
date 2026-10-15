import { describe, expect, it } from 'vitest';
import type { PlayerSave } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import {
  MAD_DUALIST_ID,
  activateMadDualist,
  canUseMadDualist,
  madDualistDesiredLevel,
  madDualistDurationMs,
} from './mad-dualist.js';

function baseSave(over: Partial<PlayerSave> = {}): PlayerSave {
  return {
    id: 't',
    name: 'Rogue',
    race: 'human',
    profession: 'rogue',
    level: 30,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'empery_haven',
    inventory: [],
    equipment: {
      ...EMPTY_EQUIPMENT,
      weapon: 'shadow_dagger',
      weapon2: 'falchion',
    },
    skillLevels: { [MAD_DUALIST_ID]: 1 },
    skillCooldowns: {},
    questFlags: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe('mad_dualist', () => {
  it('scales duration by skill level', () => {
    expect(madDualistDurationMs(baseSave({ skillLevels: { [MAD_DUALIST_ID]: 1 } }))).toBe(3000);
    expect(madDualistDurationMs(baseSave({ skillLevels: { [MAD_DUALIST_ID]: 2 } }))).toBe(4000);
    expect(madDualistDurationMs(baseSave({ skillLevels: { [MAD_DUALIST_ID]: 3 } }))).toBe(5000);
  });

  it('desired level every +10 from 30', () => {
    expect(madDualistDesiredLevel(29)).toBe(0);
    expect(madDualistDesiredLevel(30)).toBe(1);
    expect(madDualistDesiredLevel(39)).toBe(1);
    expect(madDualistDesiredLevel(40)).toBe(2);
    expect(madDualistDesiredLevel(50)).toBe(3);
  });

  it('requires two light blades', () => {
    expect(canUseMadDualist(baseSave())).toBe(true);
    expect(
      canUseMadDualist(
        baseSave({
          equipment: {
            ...baseSave().equipment,
            weapon2: 'bronze_sword',
          },
        }),
      ),
    ).toBe(false);
  });

  it('extends active buff', () => {
    const first = activateMadDualist(baseSave());
    const until1 = new Date(String(first.questFlags.buff_mad_dualist_until)).getTime();
    const second = activateMadDualist(first);
    const until2 = new Date(String(second.questFlags.buff_mad_dualist_until)).getTime();
    expect(until2 - until1).toBeGreaterThanOrEqual(2900);
  });
});
