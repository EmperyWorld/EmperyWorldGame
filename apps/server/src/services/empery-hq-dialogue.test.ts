import { describe, it, expect, vi } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { DialogueService } from './dialogue.js';
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
    level: 1,
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

describe('empery_hq dialogue & access flow', () => {
  it('town_hq_receptionist provides structured static dialogue without LLM', async () => {
    const llm = mockLlm();
    const service = new DialogueService(llm);
    const save = testSave({ location: 'empery_hq_lobby' });

    const dialogue = await service.generate({ npcId: 'town_hq_receptionist', save });
    expect(llm.chat).not.toHaveBeenCalled();
    expect(dialogue.text).toContain('Добро пожаловать в кампус EmperyWorld');
    const choiceIds = dialogue.choices.map((c) => c.id);
    expect(choiceIds).toContain('hq_lobby_tour');
    expect(choiceIds).toContain('hq_lobby_mission');
    expect(choiceIds).toContain('hq_lobby_leave');

    const tour = service.applyChoice(save, 'town_hq_receptionist', 'hq_lobby_tour');
    expect(tour.followUp?.text).toContain('главный корпус');
    expect(tour.followUp?.text).toContain('лаборатории');

    const mission = service.applyChoice(save, 'town_hq_receptionist', 'hq_lobby_mission');
    expect(mission.followUp?.text).toContain('матрицы стабильности');
  });

  it.each([
    ['town_hq_founder_lady_boss', 'Lady_Boss', 'lady_team', 'po&T'],
    ['town_hq_founder_pot', 'po&T', 'pot_team', 'Lady_Boss'],
  ])('keeps %s identity and authored branches without LLM or paid side effects', async (id, name, choice, partner) => {
    const llm = mockLlm(), service = new DialogueService(llm);
    const save = testSave({location: 'empery_hq_lobby'});
    const greeting = await service.generate({npcId: id, save});
    expect(greeting.npcName).toBe(name);
    expect(greeting.text).toContain(name);
    expect(greeting.portrait).toBe(`dialogue_${id}_neutral`);
    expect(llm.chat).not.toHaveBeenCalled();
    const next = service.applyChoice(save, id, choice);
    expect(next.followUp?.text).toContain(partner);
    expect(next.save).toEqual(save);
    expect(next.followUp?.choices.some(c => c.id.endsWith('_leave'))).toBe(true);
  });

  it('introduces both authors through reception and the campus archive', async () => {
    const service = new DialogueService(mockLlm()), save = testSave({location: 'empery_hq'});
    for (const [npcId, choice] of [['town_hq_receptionist','hq_meet_founders'], ['town_hq_terminal','hq_term_archives']]) {
      const result = service.applyChoice(save, npcId!, choice!);
      expect(result.followUp?.text).toContain('Lady_Boss');
      expect(result.followUp?.text).toContain('po&T');
    }
  });

  it('town_hq_sentry gates access until credentials / level are proven', async () => {
    const llm = mockLlm();
    const service = new DialogueService(llm);

    // 1. Unqualified recruit
    const rookie = testSave({ level: 1, questFlags: {} });
    const rookieDialogue = await service.generate({ npcId: 'town_hq_sentry', save: rookie });
    expect(rookieDialogue.choices.map((c) => c.id)).not.toContain('hq_verify_credentials');

    const failedAttempt = service.applyChoice(rookie, 'town_hq_sentry', 'hq_verify_credentials');
    expect(failedAttempt.save.questFlags.quest_empery_hq_access).toBeFalsy();
    expect(failedAttempt.followUp?.text).toContain('Запрос отклонён');

    // 2. Qualified hero (level 5 or grove complete)
    const hero = testSave({ level: 5, questFlags: { quest_grove_complete: true } });
    const heroDialogue = await service.generate({ npcId: 'town_hq_sentry', save: hero });
    expect(heroDialogue.choices.map((c) => c.id)).toContain('hq_verify_credentials');

    const verified = service.applyChoice(hero, 'town_hq_sentry', 'hq_verify_credentials');
    expect(verified.save.questFlags.quest_empery_hq_access).toBe(true);
    expect(verified.townMessage).toContain('Допуск EmperyWorld HQ получен');

    // 3. When access already granted
    const sentryAfterAccess = await service.generate({ npcId: 'town_hq_sentry', save: verified.save });
    expect(sentryAfterAccess.text).toContain('Допуск подтверждён. Ворота открыты');
    expect(sentryAfterAccess.choices.map((c) => c.id)).toContain('hq_leave');
  });

  it('town_hq_researcher and town_hq_terminal handle static dialogue and quests', async () => {
    const llm = mockLlm();
    const service = new DialogueService(llm);
    const save = testSave({
      location: 'empery_hq',
      questFlags: { quest_empery_hq_access: true },
    });

    // 1. Dr. Vane initial greeting
    const researcherGreeting = await service.generate({ npcId: 'town_hq_researcher', save });
    expect(llm.chat).not.toHaveBeenCalled();
    expect(researcherGreeting.choices.map((c) => c.id)).toContain('hq_research_accept');
    expect(researcherGreeting.choices.map((c) => c.id)).not.toContain('hq_research_submit');

    // 2. Accept quest
    const accepted = service.applyChoice(save, 'town_hq_researcher', 'hq_research_accept');
    expect(accepted.save.questFlags.quest_hq_lab_active).toBe(true);

    // 3. Greeting when quest active
    const activeGreeting = await service.generate({ npcId: 'town_hq_researcher', save: accepted.save });
    expect(activeGreeting.choices.map((c) => c.id)).toContain('hq_research_submit');
    expect(activeGreeting.choices.map((c) => c.id)).not.toContain('hq_research_accept');

    // 4. Terminal telemetry and archives
    const termGreeting = await service.generate({ npcId: 'town_hq_terminal', save });
    expect(termGreeting.choices.map((c) => c.id)).toContain('hq_term_telemetry');
    expect(termGreeting.choices.map((c) => c.id)).toContain('hq_term_archives');
    expect(termGreeting.choices.map((c) => c.id)).not.toContain('hq_term_reboot');

    const telemetry = service.applyChoice(save, 'town_hq_terminal', 'hq_term_telemetry');
    expect(telemetry.followUp?.text).toContain('ОТЧЁТ ДАТЧИКОВ');

    // 5. Terminal reboot unlocked after lab complete
    const withLabDone = testSave({
      location: 'empery_hq',
      questFlags: { quest_empery_hq_access: true, quest_hq_lab_complete: true },
    });
    const termWithPerk = await service.generate({ npcId: 'town_hq_terminal', save: withLabDone });
    expect(termWithPerk.choices.map((c) => c.id)).toContain('hq_term_reboot');
  });
});
