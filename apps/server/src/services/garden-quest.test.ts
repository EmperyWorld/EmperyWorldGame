import { describe, it, expect } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import {
  acceptGardenQuest,
  waterGardenBeds,
  GARDEN_ACTIVE_FLAG,
  GARDEN_COMPLETE_FLAG,
  GARDEN_REWARD_ADENA,
  GARDEN_REWARD_ITEM,
} from './garden-quest.js';

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-save',
    name: 'Tester',
    race: 'human',
    profession: 'mystic',
    level: 5,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'empery_haven',
    adena: 10,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('garden-quest', () => {
  it('accepts then waters with inventory water for reward', () => {
    const accepted = acceptGardenQuest(baseSave());
    expect(accepted.ok).toBe(true);
    expect(accepted.save.questFlags[GARDEN_ACTIVE_FLAG]).toBe(true);

    const watered = waterGardenBeds(
      baseSave({
        questFlags: { [GARDEN_ACTIVE_FLAG]: true },
        inventory: ['filtered_water', 'leather_cap'],
        adena: 10,
      }),
    );
    expect(watered.ok).toBe(true);
    expect(watered.save.questFlags[GARDEN_COMPLETE_FLAG]).toBe(true);
    expect(watered.save.questFlags[GARDEN_ACTIVE_FLAG]).toBeFalsy();
    expect(watered.save.inventory).toContain(GARDEN_REWARD_ITEM);
    expect(watered.save.inventory).not.toContain('filtered_water');
    expect(watered.save.adena).toBe(10 + GARDEN_REWARD_ADENA);
  });

  it('blocks watering without water or without accept', () => {
    expect(waterGardenBeds(baseSave()).ok).toBe(false);
    expect(
      waterGardenBeds(
        baseSave({ questFlags: { [GARDEN_ACTIVE_FLAG]: true }, inventory: [] }),
      ).ok,
    ).toBe(false);
  });
});
