import { describe, it, expect, vi } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { DialogueService } from './dialogue.js';
import { DayNightService } from './day-night.js';
import type { LlamaStack } from '@empery/llm';
import {
  getCitizenRecognition,
  getCitizenRumors,
  getCitizenAdvice,
  formatCitizenGreeting,
  citizenNightGreeting,
  DISTRICT_RUMORS,
  DISTRICT_ADVICE,
  DISTRICT_NIGHT_RUMORS,
  HAVEN_CITY_DIRECTIONS,
  getCityDirection,
} from './citizen-rumors.js';

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

describe('citizen recognition of player deeds', () => {
  it('detects positive PK karma and warns player', () => {
    const s = testSave({ karma: 5 });
    const rec = getCitizenRecognition(s);
    expect(rec).not.toBeNull();
    expect(rec?.mood).toBe('angry');
    expect(rec?.text).toContain('От тебя за версту разит кровью');
  });

  it('does not treat zero or legacy negative karma as PK', () => {
    expect(getCitizenRecognition(testSave({ karma: 0 }))).toBeNull();
    expect(getCitizenRecognition(testSave({ karma: -5 }))).toBeNull();
  });

  it('recognizes EmperyWorld HQ lab quest completion', () => {
    const s = testSave({ questFlags: { quest_hq_lab_complete: true } });
    const rec = getCitizenRecognition(s);
    expect(rec).not.toBeNull();
    expect(rec?.mood).toBe('happy');
    expect(rec?.text).toContain('запустил биополе в лаборатории Штаба');
  });

  it('recognizes municipal notice board bounty completion', () => {
    const s = testSave({ questFlags: { quest_board_bounty_complete: true } });
    const rec = getCitizenRecognition(s);
    expect(rec).not.toBeNull();
    expect(rec?.mood).toBe('happy');
    expect(rec?.text).toContain('контракт с городской доски закрыт');
  });

  it('recognizes Ulf fish delivery to Marta', () => {
    const s = testSave({ questFlags: { quest_fish_delivery_complete: true } });
    const rec = getCitizenRecognition(s);
    expect(rec).not.toBeNull();
    expect(rec?.mood).toBe('happy');
    expect(rec?.text).toContain('в таверне Марты сегодня подают жареную форель');
  });

  it('recognizes tavern dice master with multiple wins', () => {
    const s = testSave({ questFlags: { haven_dice_wins: 3 } });
    const rec = getCitizenRecognition(s);
    expect(rec).not.toBeNull();
    expect(rec?.mood).toBe('happy');
    expect(rec?.text).toContain('мастер костей — уже 3 побед');
  });

  it('recognizes active cathedral blessing', () => {
    const s = testSave({ questFlags: { buff_sup_cathedral_blessing_val: 30 } });
    const rec = getCitizenRecognition(s);
    expect(rec).not.toBeNull();
    expect(rec?.mood).toBe('happy');
    expect(rec?.text).toContain('благодатью и священным покоем Собора');
  });

  it('recognizes active bard inspiration', () => {
    const s = testSave({ questFlags: { buff_sup_bard_inspiration_val: 25 } });
    const rec = getCitizenRecognition(s);
    expect(rec).not.toBeNull();
    expect(rec?.mood).toBe('happy');
    expect(rec?.text).toContain('бард Кай сыграл для тебя свою лучшую песнь');
  });

  it('recognizes high-level veteran', () => {
    const s = testSave({ level: 12 });
    const rec = getCitizenRecognition(s);
    expect(rec).not.toBeNull();
    expect(rec?.mood).toBe('happy');
    expect(rec?.text).toContain('закалённый воин 12-го ранга');
  });

  it('returns null when player has no deeds or conditions', () => {
    const s = testSave({ level: 2 });
    const rec = getCitizenRecognition(s);
    expect(rec).toBeNull();
  });
});

describe('district rumors and advice', () => {
  const districtIds = [
    'haven_citizen_market',
    'haven_citizen_plaza',
    'haven_citizen_harbor',
    'haven_citizen_cathedral',
    'haven_citizen_craft',
    'haven_citizen_tavern',
    'haven_citizen_guard',
  ];

  it('provides night rumors after rest hours', () => {
    const rumor = getCitizenRumors('haven_citizen_plaza', 22);
    expect(DISTRICT_NIGHT_RUMORS.haven_citizen_plaza).toContain(rumor);
    const dayRumor = getCitizenRumors('haven_citizen_plaza', 12);
    expect(DISTRICT_RUMORS.haven_citizen_plaza).toContain(dayRumor);
  });

  it('uses night greetings at rest hours', () => {
    expect(citizenNightGreeting('haven_citizen_plaza', 23)).toContain('ночной ряд');
    expect(citizenNightGreeting('haven_citizen_plaza', 12)).toBeUndefined();
  });

  it('provides rich rumors for all city districts', () => {
    for (const id of districtIds) {
      const rumor = getCitizenRumors(id);
      expect(rumor).toBeDefined();
      expect(rumor.length).toBeGreaterThan(15);
      expect(DISTRICT_RUMORS[id]?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('provides practical travel advice for all city districts', () => {
    for (const id of districtIds) {
      const advice = getCitizenAdvice(id);
      expect(advice).toBeDefined();
      expect(advice.length).toBeGreaterThan(20);
      expect(DISTRICT_ADVICE[id]).toBeDefined();
    }
  });

  it('formats citizen greeting with deed recognition prefix', () => {
    const sWithDeed = testSave({ questFlags: { quest_board_bounty_complete: true } });
    const greeted = formatCitizenGreeting('Добрый день!', sWithDeed);
    expect(greeted.text).toContain('контракт с городской доски закрыт');
    expect(greeted.text).toContain('Добрый день!');
    expect(greeted.mood).toBe('happy');

    const sPlain = testSave();
    const plainGreeted = formatCitizenGreeting('Добрый день!', sPlain);
    expect(plainGreeted.text).toBe('Добрый день!');
    expect(plainGreeted.mood).toBe('neutral');
  });
});

describe('dialogue service integration for citizens', () => {
  it('generates citizen dialogue with deed recognition', async () => {
    const service = new DialogueService(mockLlm());
    const save = testSave({ questFlags: { quest_hq_lab_complete: true } });

    const dialogue = await service.generate({
      npcId: 'haven_citizen_market',
      save,
    });

    expect(dialogue.npcName).toBe('Торговец Гавани');
    expect(dialogue.text).toContain('запустил биополе в лаборатории Штаба');
    expect(dialogue.choices.map((c) => c.id)).toContain('citizen_rumors');
    expect(dialogue.choices.map((c) => c.id)).toContain('citizen_advice');
    expect(dialogue.choices.map((c) => c.id)).toContain('citizen_directions');
    expect(dialogue.choices.map((c) => c.id)).toContain('citizen_leave');
    expect(dialogue.choices.at(-1)?.id).toBe('citizen_leave');
  });

  it('handles citizen rumors and advice choices', async () => {
    const service = new DialogueService(mockLlm());
    const save = testSave();

    const rumorsRes = service.applyChoice(save, 'haven_citizen_plaza', 'citizen_rumors');
    expect(rumorsRes.followUp?.choices.map((c) => c.id)).toContain('citizen_advice');
    expect(rumorsRes.followUp?.choices.map((c) => c.id)).toContain('citizen_leave');

    const adviceRes = service.applyChoice(save, 'haven_citizen_harbor', 'citizen_advice');
    expect(adviceRes.followUp?.text).toContain('причала');
    expect(adviceRes.followUp?.choices.map((c) => c.id)).toContain('citizen_rumors');

    const leaveRes = service.applyChoice(save, 'haven_citizen_market', 'citizen_leave');
    expect(leaveRes.save).toBeDefined();
  });

  it('makes named guard Leon react to bounty and karma', async () => {
    const service = new DialogueService(mockLlm());

    const badKarmaSave = testSave({ karma: 10 });
    const badGuard = await service.generate({ npcId: 'town_guard', save: badKarmaSave });
    expect(badGuard.text).toContain('чую невинную кровь на твоих руках');
    expect(badGuard.portrait).toContain('serious');

    const heroSave = testSave({ questFlags: { quest_board_bounty_complete: true } });
    const heroGuard = await service.generate({ npcId: 'town_guard', save: heroSave });
    expect(heroGuard.text).toContain('за стенами стало спокойнее благодаря твоим вылазкам');
  });

  it('makes blacksmith Harold praise bounty hunting', async () => {
    const service = new DialogueService(mockLlm());
    const heroSave = testSave({ questFlags: { quest_board_bounty_complete: true } });
    const smith = await service.generate({ npcId: 'town_blacksmith', save: heroSave });
    expect(smith.text).toContain('проредил чудовищ в предместьях');
    expect(smith.portrait).toContain('happy');
  });

  it('uses night plaza greeting after the evening bell', async () => {
    const dayNight = new DayNightService({ cycleMs: 24 * 60_000, epochMs: 0 });
    const service = new DialogueService(mockLlm(), dayNight);
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(22 * 60_000);
    try {
      const dialogue = await service.generate({ npcId: 'haven_citizen_plaza', save: testSave() });
      expect(dialogue.text.toLowerCase()).toContain('ночной ряд');
    } finally {
      dateSpy.mockRestore();
    }
  });

  it('provides city directions through dialogue choices', () => {
    expect(HAVEN_CITY_DIRECTIONS.length).toBeGreaterThanOrEqual(5);
    const smith = getCityDirection('dir_blacksmith');
    expect(smith?.text).toContain('Ремесленном квартале');

    const service = new DialogueService(mockLlm());
    const save = testSave();

    // 1. Ask for directions
    const dirPrompt = service.applyChoice(save, 'haven_citizen_plaza', 'citizen_directions');
    expect(dirPrompt.followUp?.text).toContain('Куда тебе нужно пройти');
    const choiceIds = dirPrompt.followUp?.choices.map((c) => c.id) ?? [];
    expect(choiceIds).toContain('dir_blacksmith');
    expect(choiceIds).toContain('dir_cathedral');
    expect(choiceIds).toContain('dir_tavern');

    // 2. Select a specific destination
    const dirResult = service.applyChoice(save, 'haven_citizen_plaza', 'dir_cathedral');
    expect(dirResult.followUp?.text).toContain('Собор возвышается на севере');
    expect(dirResult.followUp?.navigationTarget).toEqual({
      locationId: 'empery_haven',
      x: 3488,
      y: 800,
      label: 'Собор отца Кассия',
    });
    const followUpChoices = dirResult.followUp?.choices.map((c) => c.id) ?? [];
    expect(followUpChoices).toContain('citizen_directions');
    expect(followUpChoices).toContain('citizen_leave');
  });

  it('rejects path traversal in client-supplied NPC ids', async () => {
    const service = new DialogueService(mockLlm());
    await expect(
      service.generate({
        npcId: '../../config/services',
        save: testSave(),
      }),
    ).rejects.toThrow('Invalid NPC id');
  });
});
