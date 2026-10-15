import { describe, it, expect, vi } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { DialogueService } from './dialogue.js';
import type { LlamaStack } from '@empery/llm';
import {
  BOARD_BOUNTY_ACTIVE_FLAG,
  BOARD_BOUNTY_COMPLETE_FLAG,
  BOARD_BOUNTY_KILLS_FLAG,
  BOARD_BOUNTY_TARGET_KILLS,
} from './notice-board.js';

function mockLlm(): LlamaStack {
  return {
    chat: vi.fn().mockResolvedValue('LLM fallback'),
    embed: vi.fn().mockResolvedValue([0.1, 0.2]),
    healthCheck: vi.fn().mockResolvedValue([{ ok: true, message: 'ok', name: 'llama' }]),
  } as unknown as LlamaStack;
}

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-player',
    name: 'Explorer',
    race: 'human',
    profession: 'warrior',
    level: 2,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'empery_haven',
    adena: 50,
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

describe('haven notice board dialogue', () => {
  it('generates initial menu with bounty accept, news, and guide', async () => {
    const service = new DialogueService(mockLlm());
    const save = testSave();
    const res = await service.generate({
      npcId: 'town_notice_board',
      save,
    });

    expect(res.text).toContain('ГОРОДСКАЯ ДОСКА ОБЪЯВЛЕНИЙ');
    const choiceIds = res.choices.map((c) => c.id);
    expect(choiceIds).toContain('board_bounty_accept');
    expect(choiceIds).toContain('board_news');
    expect(choiceIds).toContain('board_guide');
    expect(choiceIds).not.toContain('board_bounty_claim');
  });

  it('shows claim option and progress when bounty is active', async () => {
    const service = new DialogueService(mockLlm());
    const save = testSave({
      questFlags: {
        [BOARD_BOUNTY_ACTIVE_FLAG]: true,
        [BOARD_BOUNTY_KILLS_FLAG]: 2,
      },
    });
    const res = await service.generate({
      npcId: 'town_notice_board',
      save,
    });

    expect(res.text).toContain('2/3');
    const choiceIds = res.choices.map((c) => c.id);
    expect(choiceIds).toContain('board_bounty_claim');
    expect(choiceIds).not.toContain('board_bounty_accept');
  });

  it('applies accept choice and starts bounty contract', async () => {
    const service = new DialogueService(mockLlm());
    const save = testSave();
    const res = await service.applyChoice(save, 'town_notice_board', 'board_bounty_accept');

    expect(res.save.questFlags[BOARD_BOUNTY_ACTIVE_FLAG]).toBe(true);
    expect(res.townMessage).toContain('Контракт подписан');
  });

  it('reads board news and guide nodes without LLM call', async () => {
    const service = new DialogueService(mockLlm());
    const save = testSave();

    const newsRes = await service.applyChoice(save, 'town_notice_board', 'board_news');
    expect(newsRes.followUp?.text).toContain('ВЕСТНИК ИМПЕРСКОЙ ГАВАНИ');

    const guideRes = await service.applyChoice(save, 'town_notice_board', 'board_guide');
    expect(guideRes.followUp?.text).toContain('ПУТЕВОДИТЕЛЬ ПО ГАВАНИ');
    expect(guideRes.followUp?.choices.map((choice) => choice.id)).toContain('dir_blacksmith');

    const routeRes = await service.applyChoice(save, 'town_notice_board', 'dir_harbor');
    expect(routeRes.followUp?.navigationTarget).toEqual({
      locationId: 'empery_haven',
      x: 4256,
      y: 2976,
      label: 'Речной порт',
    });
    expect(routeRes.followUp?.choices.map((choice) => choice.id)).toContain('board_guide');
  });

  it('claims bounty reward and marks complete', async () => {
    const service = new DialogueService(mockLlm());
    const save = testSave({
      adena: 10,
      questFlags: {
        [BOARD_BOUNTY_ACTIVE_FLAG]: true,
        [BOARD_BOUNTY_KILLS_FLAG]: BOARD_BOUNTY_TARGET_KILLS,
      },
    });
    const res = await service.applyChoice(save, 'town_notice_board', 'board_bounty_claim');

    expect(res.save.questFlags[BOARD_BOUNTY_COMPLETE_FLAG]).toBe(true);
    expect(res.save.adena).toBe(130);
    expect(res.followUp?.portrait).toContain('happy');
  });
});
