import { describe, it, expect } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import {
  acceptBoardBounty,
  claimBoardBounty,
  formatBoardNews,
  BOARD_BOUNTY_ACTIVE_FLAG,
  BOARD_BOUNTY_COMPLETE_FLAG,
  BOARD_BOUNTY_KILLS_FLAG,
  BOARD_BOUNTY_REWARD_ADENA,
  BOARD_BOUNTY_REWARD_ITEM,
  BOARD_BOUNTY_TARGET_KILLS,
} from './notice-board.js';

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-board-save',
    name: 'BountyTester',
    race: 'human',
    profession: 'warrior',
    level: 3,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
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

describe('notice-board service', () => {
  it('accepts bounty contract and sets flag', () => {
    const s0 = baseSave();
    const result = acceptBoardBounty(s0);
    expect(result.ok).toBe(true);
    expect(result.save.questFlags[BOARD_BOUNTY_ACTIVE_FLAG]).toBe(true);
    expect(result.message).toContain(String(BOARD_BOUNTY_TARGET_KILLS));
  });

  it('rejects claim if bounty not active', () => {
    const s0 = baseSave();
    const res = claimBoardBounty(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Сначала сорвите и примите контракт');
  });

  it('rejects claim if kills below target and grove not complete', () => {
    const s0 = baseSave({
      questFlags: {
        [BOARD_BOUNTY_ACTIVE_FLAG]: true,
        [BOARD_BOUNTY_KILLS_FLAG]: 1,
      },
    });
    const res = claimBoardBounty(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('ещё не выполнены');
  });

  it('claims reward upon reaching kill target', () => {
    const s0 = baseSave({
      adena: 20,
      questFlags: {
        [BOARD_BOUNTY_ACTIVE_FLAG]: true,
        [BOARD_BOUNTY_KILLS_FLAG]: BOARD_BOUNTY_TARGET_KILLS,
      },
    });
    const res = claimBoardBounty(s0);
    expect(res.ok).toBe(true);
    expect(res.save.questFlags[BOARD_BOUNTY_COMPLETE_FLAG]).toBe(true);
    expect(res.save.questFlags[BOARD_BOUNTY_ACTIVE_FLAG]).toBeUndefined();
    expect(res.save.adena).toBe(20 + BOARD_BOUNTY_REWARD_ADENA);
    expect(res.save.inventory).toContain(BOARD_BOUNTY_REWARD_ITEM);
  });

  it('claims reward if player already completed grove quest', () => {
    const s0 = baseSave({
      adena: 50,
      questFlags: {
        [BOARD_BOUNTY_ACTIVE_FLAG]: true,
        quest_grove_complete: true,
      },
    });
    const res = claimBoardBounty(s0);
    expect(res.ok).toBe(true);
    expect(res.save.questFlags[BOARD_BOUNTY_COMPLETE_FLAG]).toBe(true);
  });

  it('formats board news cleanly', () => {
    const news = formatBoardNews();
    expect(news).toContain('ВЕСТНИК ИМПЕРСКОЙ ГАВАНИ');
  });
});
