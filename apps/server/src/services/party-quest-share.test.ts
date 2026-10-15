import { describe, expect, it } from 'vitest';
import type { PlayerSave } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import { applySharedQuestActivation } from './party-quest-share.js';

function base(over: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return {
    id: 'a',
    name: 'A',
    race: 'human',
    profession: 'warrior',
    level: 5,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mp: 20,
    maxMp: 40,
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

describe('applySharedQuestActivation', () => {
  it('grants active+started flags', () => {
    const next = applySharedQuestActivation(base(), 'quest_grove_active');
    expect(next).toBeTruthy();
    expect(next!.questFlags.quest_grove_active).toBe(true);
    expect(next!.questFlags.quest_grove_started).toBe(true);
  });

  it('skips if already complete', () => {
    const next = applySharedQuestActivation(
      base({ questFlags: { quest_grove_complete: true } }),
      'quest_grove_active',
    );
    expect(next).toBeNull();
  });

  it('skips if already active', () => {
    const next = applySharedQuestActivation(
      base({ questFlags: { quest_grove_active: true } }),
      'quest_grove_active',
    );
    expect(next).toBeNull();
  });
});
