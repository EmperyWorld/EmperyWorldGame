import { describe, it, expect, vi } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { DialogueService } from './dialogue.js';
import type { LlamaStack } from '@empery/llm';
import {
  requestCathedralBlessing,
  confessAtCathedral,
  takeBathSession,
  buyBathTea,
  startFishDeliveryQuest,
  deliverFishToInn,
  claimFishDeliveryReward,
  requestBardInspiration,
  playHavenDice,
  CATHEDRAL_BLESS_COST,
  CATHEDRAL_CONFESS_COST,
  BATH_SESSION_COST,
  BATH_TEA_COST,
  BARD_INSPIRATION_COST,
  FISH_QUEST_ACTIVE_FLAG,
  FISH_QUEST_DELIVERED_FLAG,
  FISH_QUEST_COMPLETE_FLAG,
  FISH_QUEST_REWARD_ADENA,
} from './haven-services.js';

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
    id: 'test-haven-player',
    name: 'HavenAdventurer',
    race: 'human',
    profession: 'warrior',
    level: 2,
    xp: 0,
    hp: 40,
    maxHp: 100,
    mp: 10,
    maxMp: 50,
    location: 'empery_haven',
    adena: 100,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    karma: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('haven cathedral services (town_priest)', () => {
  it('blesses player, restores HP/MP, applies buff and deducts donation', () => {
    const s0 = testSave({ hp: 20, mp: 5, adena: 50 });
    const res = requestCathedralBlessing(s0);

    expect(res.ok).toBe(true);
    expect(res.save.hp).toBe(res.save.maxHp);
    expect(res.save.mp).toBe(res.save.maxMp);
    expect(res.save.adena).toBe(50 - CATHEDRAL_BLESS_COST);
    expect(res.save.questFlags.buff_sup_cathedral_bless_val).toBe(15);
    expect(res.save.questFlags.buff_sup_cathedral_bless_name).toBe('Благословение Света');
  });

  it('blesses poor player without error when adena is low', () => {
    const s0 = testSave({ hp: 10, adena: 5 });
    const res = requestCathedralBlessing(s0);

    expect(res.ok).toBe(true);
    expect(res.save.hp).toBe(res.save.maxHp);
    expect(res.save.adena).toBe(5);
    expect(res.message).toContain('в дар страннику');
  });

  it('rejects confession if player has no karma', () => {
    const s0 = testSave({ karma: 0 });
    const res = confessAtCathedral(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('чиста');
  });

  it('rejects confession if player lacks adena for donation', () => {
    const s0 = testSave({ karma: 20, adena: 10 });
    const res = confessAtCathedral(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('пожертвование');
  });

  it('cleanses karma and deducts donation upon confession', () => {
    const s0 = testSave({ karma: 40, adena: 100 });
    const res = confessAtCathedral(s0);
    expect(res.ok).toBe(true);
    expect(res.save.karma).toBe(0);
    expect(res.save.adena).toBe(100 - CATHEDRAL_CONFESS_COST);
  });
});

describe('haven bathhouse services (town_bathkeeper)', () => {
  it('takes bath session, restores vitals, and applies steam buff', () => {
    const s0 = testSave({ hp: 30, mp: 5, adena: 80 });
    const res = takeBathSession(s0);

    expect(res.ok).toBe(true);
    expect(res.save.hp).toBe(res.save.maxHp);
    expect(res.save.mp).toBe(res.save.maxMp);
    expect(res.save.adena).toBe(80 - BATH_SESSION_COST);
    expect(res.save.questFlags.buff_sup_bath_steam_val).toBe(10);
    expect(res.save.questFlags.buff_sup_bath_steam_name).toBe('Банный пар');
  });

  it('rejects bath session if player cannot pay', () => {
    const s0 = testSave({ adena: 10 });
    const res = takeBathSession(s0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('стоит');
  });

  it('buys herbal tea to restore MP', () => {
    const s0 = { ...testSave({ adena: 30 }), mp: 10 };
    const res = buyBathTea(s0);
    expect(res.ok).toBe(true);
    expect(res.save.mp).toBe(45);
    expect(res.save.adena).toBe(30 - BATH_TEA_COST);
  });
});

describe('haven fish delivery quest chain', () => {
  it('starts fish delivery quest and gives raw fish', () => {
    const s0 = testSave();
    const res = startFishDeliveryQuest(s0);

    expect(res.ok).toBe(true);
    expect(res.save.questFlags[FISH_QUEST_ACTIVE_FLAG]).toBe(true);
    const rawFishCount = res.save.inventory.filter((id) => id === 'raw_fish').length;
    expect(rawFishCount).toBe(3);
  });

  it('delivers fish to inn, receives cooked fish snack and receipt flag', () => {
    const s0 = testSave({
      inventory: ['raw_fish', 'raw_fish', 'raw_fish'],
      questFlags: { [FISH_QUEST_ACTIVE_FLAG]: true },
    });
    const res = deliverFishToInn(s0);

    expect(res.ok).toBe(true);
    expect(res.save.questFlags[FISH_QUEST_DELIVERED_FLAG]).toBe(true);
    expect(res.save.inventory).not.toContain('raw_fish');
    expect(res.save.inventory).toContain('cooked_fish');
  });

  it('claims reward from Ulf at docks and finishes quest', () => {
    const s0 = testSave({
      adena: 20,
      questFlags: {
        [FISH_QUEST_ACTIVE_FLAG]: true,
        [FISH_QUEST_DELIVERED_FLAG]: true,
      },
    });
    const res = claimFishDeliveryReward(s0);

    expect(res.ok).toBe(true);
    expect(res.save.questFlags[FISH_QUEST_COMPLETE_FLAG]).toBe(true);
    expect(res.save.questFlags[FISH_QUEST_ACTIVE_FLAG]).toBeUndefined();
    expect(res.save.questFlags[FISH_QUEST_DELIVERED_FLAG]).toBeUndefined();
    expect(res.save.adena).toBe(20 + FISH_QUEST_REWARD_ADENA);
  });
});

describe('haven services dialogue integration', () => {
  it('town_priest hides confession when karma is 0, shows when karma > 0', async () => {
    const service = new DialogueService(mockLlm());
    const cleanSave = testSave({ karma: 0 });
    const cleanMenu = await service.generate({ npcId: 'town_priest', save: cleanSave });
    expect(cleanMenu.choices.map((c) => c.id)).toContain('priest_bless');
    expect(cleanMenu.choices.map((c) => c.id)).not.toContain('priest_confess');

    const sinnerSave = testSave({ karma: 50 });
    const sinnerMenu = await service.generate({ npcId: 'town_priest', save: sinnerSave });
    expect(sinnerMenu.choices.map((c) => c.id)).toContain('priest_confess');
  });

  it('town_bathkeeper offers bath session and tea', async () => {
    const service = new DialogueService(mockLlm());
    const save = testSave();
    const menu = await service.generate({ npcId: 'town_bathkeeper', save });
    expect(menu.choices.map((c) => c.id)).toContain('bath_session');
    expect(menu.choices.map((c) => c.id)).toContain('bath_tea');

    const applied = await service.applyChoice(save, 'town_bathkeeper', 'bath_session');
    expect(applied.save.questFlags.buff_sup_bath_steam_val).toBe(10);
    expect(applied.townMessage).toContain('Банный пар');
  });

  it('full fish delivery dialogue flow: Ulf -> Marta -> Ulf', async () => {
    const service = new DialogueService(mockLlm());
    const save0 = testSave();

    // 1. Initial Ulf menu has start choice
    const ulfMenu0 = await service.generate({ npcId: 'town_fisher', save: save0 });
    expect(ulfMenu0.choices.map((c) => c.id)).toContain('fisher_quest_start');
    expect(ulfMenu0.choices.map((c) => c.id)).not.toContain('fisher_quest_claim');

    // 2. Accept quest from Ulf
    const questAccepted = await service.applyChoice(save0, 'town_fisher', 'fisher_quest_start');
    expect(questAccepted.save.questFlags[FISH_QUEST_ACTIVE_FLAG]).toBe(true);

    // 3. Marta at tavern offers delivery choice
    const martaMenu = await service.generate({ npcId: 'town_innkeeper', save: questAccepted.save });
    expect(martaMenu.choices.map((c) => c.id)).toContain('inn_fish_delivery');

    // 4. Deliver fish to Marta
    const delivered = await service.applyChoice(questAccepted.save, 'town_innkeeper', 'inn_fish_delivery');
    expect(delivered.save.questFlags[FISH_QUEST_DELIVERED_FLAG]).toBe(true);

    // 5. Ulf now has claim choice
    const ulfMenuDelivered = await service.generate({ npcId: 'town_fisher', save: delivered.save });
    expect(ulfMenuDelivered.choices.map((c) => c.id)).toContain('fisher_quest_claim');

    // 6. Claim reward at Ulf
    const claimed = await service.applyChoice(delivered.save, 'town_fisher', 'fisher_quest_claim');
    expect(claimed.save.questFlags[FISH_QUEST_COMPLETE_FLAG]).toBe(true);
    expect(claimed.save.adena).toBe(delivered.save.adena + FISH_QUEST_REWARD_ADENA);
  });
});

describe('haven bard services (stage_bard)', () => {
  it('requests bard inspiration buff (+speed, +attackSpeed, +mpRegen)', () => {
    const s0 = testSave({ adena: 20 });
    const res = requestBardInspiration(s0);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(20 - BARD_INSPIRATION_COST);
    expect(res.save.questFlags.buff_sup_bard_inspiration_val).toBe(25);
    expect(res.save.questFlags.buff_sup_bard_tempo_val).toBe(12);
    expect(res.save.questFlags.buff_sup_bard_harmony_val).toBe(10);
    expect(res.message).toContain('Вдохновение барда');
  });

  it('generates stage_bard dialogue and applies choices', async () => {
    const service = new DialogueService(mockLlm());
    const s0 = testSave({ adena: 25 });
    const menu = await service.generate({ npcId: 'stage_bard', save: s0 });
    expect(menu.choices.map((c) => c.id)).toContain('bard_buff');
    expect(menu.choices.map((c) => c.id)).toContain('bard_stories');
    expect(menu.choices.map((c) => c.id)).toContain('bard_song_custom');

    const buffApplied = await service.applyChoice(s0, 'stage_bard', 'bard_buff');
    expect(buffApplied.save.questFlags.buff_sup_bard_inspiration_val).toBe(25);
    expect(buffApplied.save.adena).toBe(20);

    const customSong = await service.applyChoice(s0, 'stage_bard', 'bard_song_custom');
    expect(customSong.followUp?.text).toContain('Пусть ветер в спину страннику поёт');
  });
});

describe('haven tavern dice game (playHavenDice)', () => {
  it('rejects bet if player does not have enough adena', () => {
    const s0 = testSave({ adena: 5 });
    const res = playHavenDice(s0, 10);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('не хватает звонкой адены');
    expect(res.save.adena).toBe(5);
  });

  it('handles regular win with 2x payout and stat tracking', () => {
    const s0 = testSave({ adena: 50 });
    // Player 3+4=7, Host 2+3=5
    const res = playHavenDice(s0, 25, { player: [3, 4], host: [2, 3] });
    expect(res.ok).toBe(true);
    expect(res.won).toBe(true);
    expect(res.doubleWin).toBe(false);
    expect(res.payout).toBe(50);
    expect(res.save.adena).toBe(50 - 25 + 50); // 75
    expect(res.save.questFlags.haven_dice_wins).toBe(1);
    expect(res.save.questFlags.haven_dice_games).toBe(1);
  });

  it('handles double win with 2.5x payout and haven_ale prize', () => {
    const s0 = testSave({ adena: 40 });
    // Player 5+5=10 (double), Host 3+4=7
    const res = playHavenDice(s0, 20, { player: [5, 5], host: [3, 4] });
    expect(res.ok).toBe(true);
    expect(res.won).toBe(true);
    expect(res.doubleWin).toBe(true);
    expect(res.payout).toBe(50); // Math.floor(20 * 2.5)
    expect(res.save.adena).toBe(40 - 20 + 50); // 70
    expect(res.save.inventory).toContain('haven_ale');
    expect(res.message).toContain('Двойной триумф');
  });

  it('handles tie by returning bet', () => {
    const s0 = testSave({ adena: 50 });
    // Player 4+3=7, Host 5+2=7
    const res = playHavenDice(s0, 25, { player: [4, 3], host: [5, 2] });
    expect(res.ok).toBe(true);
    expect(res.tie).toBe(true);
    expect(res.payout).toBe(25);
    expect(res.save.adena).toBe(50);
    expect(res.save.questFlags.haven_dice_games).toBe(1);
  });

  it('handles loss by deducting bet', () => {
    const s0 = testSave({ adena: 50 });
    // Player 1+2=3, Host 4+5=9
    const res = playHavenDice(s0, 25, { player: [1, 2], host: [4, 5] });
    expect(res.ok).toBe(true);
    expect(res.won).toBe(false);
    expect(res.tie).toBe(false);
    expect(res.payout).toBe(0);
    expect(res.save.adena).toBe(25);
    expect(res.save.questFlags.haven_dice_games).toBe(1);
    expect(res.save.questFlags.haven_dice_wins).toBe(0);
  });

  it('integrates tavern dice into innkeeper dialogue choice', async () => {
    const service = new DialogueService(mockLlm());
    const s0 = testSave({ adena: 60 });
    const applied = await service.applyChoice(s0, 'town_innkeeper', 'inn_dice_10');
    expect(applied.townMessage).toContain('🎲');
    expect(applied.save.questFlags.haven_dice_games).toBe(1);
    expect(applied.followUp?.choices.map((c) => c.id)).toContain('inn_dice_10');
    expect(applied.followUp?.choices.map((c) => c.id)).toContain('inn_leave');
  });
});
