import { describe, it, expect, vi } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { DialogueService } from './dialogue.js';
import { DayNightService } from './day-night.js';
import type { LlamaStack } from '@empery/llm';

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

describe('npc schedule walking dialogue', () => {
  it('generates walking home conversation on evening commute', async () => {
    const dayNight = new DayNightService({
      cycleMs: 24 * 60_000,
      epochMs: 0,
    });
    // At epochMs + 21 * 60_000 + 1_000 -> 21:00 + 1s, Loren is walking home
    const eveningMs = 21 * 60_000 + 1_000;
    const save = testSave();
    const service = new DialogueService(mockLlm(), dayNight);

    // Mock Date.now to eveningMs
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(eveningMs);
    try {
      const res = await service.generate({
        npcId: 'town_merchant',
        save,
      });

      expect(res.text).toContain('Лорен спешит домой');
      expect(res.text).toContain('Товар убран');
      expect(res.choices.length).toBe(1);
      expect(res.choices[0]?.id).toBe('walk_bye');
      expect(res.choices[0]?.label).toContain('Доброй ночи');

      // Test applyChoice cleanly closes dialogue
      const choiceRes = service.applyChoice(save, 'town_merchant', 'walk_bye');
      expect(choiceRes.save).toBeDefined();
    } finally {
      dateSpy.mockRestore();
    }
  });

  it('generates cheerful morning conversation on dawn commute to work', async () => {
    const dayNight = new DayNightService({
      cycleMs: 24 * 60_000,
      epochMs: 0,
    });
    // At epochMs + 7 * 60_000 + 1_000 -> 07:00 + 1s, Loren is walking to work
    const morningMs = 7 * 60_000 + 1_000;
    const save = testSave();
    const service = new DialogueService(mockLlm(), dayNight);

    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(morningMs);
    try {
      const res = await service.generate({
        npcId: 'town_merchant',
        save,
      });

      expect(res.text).toContain('Лорен бодро шагает к торговым рядам');
      expect(res.text).toContain('Утро доброе');
      expect(res.choices.length).toBe(1);
      expect(res.choices[0]?.id).toBe('walk_bye');
      expect(res.choices[0]?.label).toContain('Хорошего дня');

      const choiceRes = service.applyChoice(save, 'town_merchant', 'walk_bye');
      expect(choiceRes.save).toBeDefined();
    } finally {
      dateSpy.mockRestore();
    }
  });
});
