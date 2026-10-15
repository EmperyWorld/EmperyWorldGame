import { describe, it, expect } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import {
  acceptHqLabQuest,
  submitHqLabComponent,
  rebootHqBiofield,
  HQ_LAB_ACTIVE_FLAG,
  HQ_LAB_COMPLETE_FLAG,
  HQ_LAB_REWARD_ADENA,
  HQ_LAB_REWARD_ITEM,
} from './hq-lab-quest.js';

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-hq-save',
    name: 'ResearcherTester',
    race: 'human',
    profession: 'warrior',
    level: 5,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    location: 'empery_hq',
    adena: 20,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {
      quest_empery_hq_access: true,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('hq-lab-quest', () => {
  it('accepts quest and sets active flag', () => {
    const s0 = baseSave();
    const accepted = acceptHqLabQuest(s0);
    expect(accepted.ok).toBe(true);
    expect(accepted.save.questFlags[HQ_LAB_ACTIVE_FLAG]).toBe(true);
    expect(accepted.save.questFlags[HQ_LAB_COMPLETE_FLAG]).toBeFalsy();
  });

  it('fails submission if active quest is missing or no component in bag', () => {
    const s0 = baseSave();
    const noActive = submitHqLabComponent(s0);
    expect(noActive.ok).toBe(false);

    const withActiveNoItem = baseSave({
      questFlags: { quest_empery_hq_access: true, [HQ_LAB_ACTIVE_FLAG]: true },
      inventory: ['leather_boots'],
    });
    const failed = submitHqLabComponent(withActiveNoItem);
    expect(failed.ok).toBe(false);
  });

  it('submits component, consumes it, awards adena and 24h battery', () => {
    const s0 = baseSave({
      questFlags: { quest_empery_hq_access: true, [HQ_LAB_ACTIVE_FLAG]: true },
      inventory: ['charcoal_filter', 'leather_cap'],
      adena: 50,
    });
    const result = submitHqLabComponent(s0);
    expect(result.ok).toBe(true);
    expect(result.save.inventory).not.toContain('charcoal_filter');
    expect(result.save.inventory).toContain(HQ_LAB_REWARD_ITEM);
    expect(result.save.adena).toBe(50 + HQ_LAB_REWARD_ADENA);
    expect(result.save.questFlags[HQ_LAB_COMPLETE_FLAG]).toBe(true);
    expect(result.save.questFlags[HQ_LAB_ACTIVE_FLAG]).toBeUndefined();
  });

  it('reboots biofield at terminal when completed', () => {
    const uncompleted = baseSave({ hp: 20, mp: 10 });
    const blocked = rebootHqBiofield(uncompleted);
    expect(blocked.ok).toBe(false);

    const ready = baseSave({
      hp: 20,
      mp: 10,
      questFlags: { [HQ_LAB_COMPLETE_FLAG]: true },
    });
    const restored = rebootHqBiofield(ready);
    expect(restored.ok).toBe(true);
    expect(restored.save.hp).toBe(restored.save.maxHp);
    expect(restored.save.mp).toBe(restored.save.maxMp);
  });
});
