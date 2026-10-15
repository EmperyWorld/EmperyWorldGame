import { describe, expect, it } from 'vitest';
import type { PlayerSave } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import { stripIneligibleSkills } from './skills.js';
import { normalizeSave } from './save-normalize.js';

function base(over: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return {
    id: 's1',
    name: 'Test',
    race: 'human',
    profession: 'mystic',
    level: 10,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    location: 'starter_grove',
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
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

describe('stripIneligibleSkills / mystic migrate', () => {
  it('removes healing_light and mystic_ward', () => {
    const next = stripIneligibleSkills(
      base({
        skillLevels: { healing_light: 2, mystic_ward: 1, flame_burst: 1 },
        skillCooldowns: { healing_light: new Date().toISOString() },
        skillHotbar: ['healing_light', 'flame_burst', null, null],
      }),
    );
    expect(next.skillLevels.healing_light).toBeUndefined();
    expect(next.skillLevels.mystic_ward).toBeUndefined();
    expect(next.skillLevels.flame_burst).toBe(1);
    expect(next.skillCooldowns.healing_light).toBeUndefined();
  });

  it('normalizeSave drops obsolete hotbar slots', () => {
    const next = normalizeSave(
      base({
        skillLevels: { healing_light: 1, mystic_ward: 1, flame_burst: 1, robe_mastery: 1 },
        skillHotbar: ['healing_light', 'mystic_ward', null, null],
      }),
    );
    expect(next.skillLevels.healing_light).toBeUndefined();
    expect(next.skillLevels.mystic_ward).toBeUndefined();
    expect(next.skillHotbar?.includes('healing_light')).toBe(false);
    expect(next.skillHotbar?.includes('mystic_ward')).toBe(false);
  });

  it('strips wrong-race support skills', () => {
    const next = stripIneligibleSkills(
      base({
        profession: 'support',
        race: 'orc',
        skillLevels: { support_heal: 1, support_orc_might: 1, support_robe_mastery: 1 },
      }),
    );
    expect(next.skillLevels.support_heal).toBeUndefined();
    expect(next.skillLevels.support_orc_might).toBe(1);
    expect(next.skillLevels.support_robe_mastery).toBe(1);
  });
});
