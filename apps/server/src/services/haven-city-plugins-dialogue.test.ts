import { describe, expect, it, vi } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import type { LlamaStack } from '@empery/llm';
import { DialogueService } from './dialogue.js';
import { applyStatsToSave } from './stats.js';
import { MILLER_GRAIN_ITEM, MILLER_FLOUR_ITEM, MILLER_ORDER_ACTIVE_FLAG } from './miller-bakery.js';
import { DOCK_SHIFT_ACTIVE_FLAG, DOCK_SHIFT_CRATE_ID } from './dock-shift.js';
import { HAVEN_BREW_TASTINGS_FLAG } from './brewery-tasting.js';
import { SCRIBE_FOLIO_ACTIVE_FLAG, TRAVEL_WRIT_ID } from './scribe-archive.js';
import { STABLE_NO_MOUNT_MESSAGE } from './stable-care.js';

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
    id: 'test-city-plugins',
    name: 'HavenAdventurer',
    race: 'human',
    profession: 'warrior',
    level: 2,
    xp: 0,
    hp: 80,
    maxHp: 100,
    mp: 20,
    maxMp: 50,
    location: 'empery_haven',
    adena: 80,
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

describe('haven city NPC plugins wired through DialogueService', () => {
  it('miller: generate skips LLM and mill consumes grain', async () => {
    const service = new DialogueService(mockLlm());
    const menu = await service.generate({ npcId: 'town_miller', save: testSave() });
    expect(menu.text).toContain('Жернова');
    expect(menu.choices.map((c) => c.id)).toContain('miller_mill');

    const milled = service.applyChoice(
      testSave({ inventory: [MILLER_GRAIN_ITEM] }),
      'town_miller',
      'miller_mill',
    );
    expect(milled.save.inventory).toContain(MILLER_FLOUR_ITEM);
    expect(milled.followUp?.text).toContain('мукой');
    expect(milled.followUp?.choices.map((c) => c.id)).toContain('miller_order_accept');
  });

  it('miller: accept order sets quest flag', () => {
    const service = new DialogueService(mockLlm());
    const res = service.applyChoice(testSave(), 'town_miller', 'miller_order_accept');
    expect(res.save.questFlags[MILLER_ORDER_ACTIVE_FLAG]).toBe(true);
  });

  it('stable: groom without a mount fails with Boris copy', () => {
    const service = new DialogueService(mockLlm());
    const res = service.applyChoice(testSave(), 'town_stable', 'stable_groom');
    expect(res.followUp?.text).toBe(STABLE_NO_MOUNT_MESSAGE);
  });

  it('brewer: tasting spends adena and increments counter', () => {
    const service = new DialogueService(mockLlm());
    const res = service.applyChoice(testSave({ adena: 20 }), 'town_brewer', 'brew_tasting');
    expect(res.save.adena).toBe(12);
    expect(res.save.questFlags[HAVEN_BREW_TASTINGS_FLAG]).toBe(1);
    expect(res.followUp?.text).toContain('Хмельной задор');
  });

  it('scribe: copy writ grants the travel document', () => {
    const service = new DialogueService(mockLlm());
    const res = service.applyChoice(testSave({ adena: 30 }), 'town_scribe', 'scribe_copy_writ');
    expect(res.save.inventory).toContain(TRAVEL_WRIT_ID);
    expect(res.save.adena).toBe(10);
  });

  it('scribe generate hides claim until search is active', async () => {
    const service = new DialogueService(mockLlm());
    const idle = await service.generate({ npcId: 'town_scribe', save: testSave() });
    expect(idle.choices.map((c) => c.id)).toContain('scribe_search');
    expect(idle.choices.map((c) => c.id)).not.toContain('scribe_claim_folio');

    const active = await service.generate({
      npcId: 'town_scribe',
      save: testSave({ questFlags: { [SCRIBE_FOLIO_ACTIVE_FLAG]: true } }),
    });
    expect(active.choices.map((c) => c.id)).toContain('scribe_claim_folio');
  });

  it('dock: start shift issues crates; supplies is a no-op save', () => {
    const service = new DialogueService(mockLlm());
    const started = service.applyChoice(testSave(), 'town_dockhand', 'dock_shift_start');
    expect(started.save.questFlags[DOCK_SHIFT_ACTIVE_FLAG]).toBe(true);
    expect(started.save.inventory.filter((id) => id === DOCK_SHIFT_CRATE_ID)).toHaveLength(2);

    const shop = service.applyChoice(testSave(), 'town_dockhand', 'dock_supplies');
    expect(shop.followUp).toBeUndefined();
    expect(shop.save.inventory).toEqual([]);
  });

  it('captain drill and guard fine are wired', () => {
    const service = new DialogueService(mockLlm());
    const drill = service.applyChoice(testSave({ adena: 20, stamina: 100 }), 'town_captain', 'captain_drill');
    expect(drill.save.adena).toBe(8);
    expect(drill.followUp?.text).toContain('Строевая');

    const fine = service.applyChoice(testSave({ karma: 40, adena: 50 }), 'town_guard', 'guard_fine');
    expect(fine.save.karma).toBe(15);
    expect(fine.save.adena).toBe(20);
  });

  it('healer kit, teacher lesson, butcher smoke, and merchant deal are wired', () => {
    const service = new DialogueService(mockLlm());
    const kit = service.applyChoice(testSave({ adena: 40 }), 'town_healer', 'healer_kit');
    expect(kit.save.inventory).toContain('sera_bandage');

    const lesson = service.applyChoice(testSave({ adena: 20 }), 'town_teacher', 'teacher_lesson');
    expect(lesson.save.questFlags.haven_lavr_lessons).toBe(1);

    const smoked = service.applyChoice(testSave({ inventory: ['raw_meat'] }), 'town_butcher', 'butcher_smoke');
    expect(smoked.save.inventory).toContain('smoked_brisket');

    const deal = service.applyChoice(testSave({ adena: 20 }), 'town_merchant', 'merchant_deal');
    expect(deal.save.adena).toBeLessThan(20);
    expect(deal.save.inventory).toHaveLength(1);
    expect(deal.followUp?.text ?? deal.townMessage ?? '').toMatch(/сделка|хлеб|сухар|эль|Лорен|Гаван/i);
  });

  it('quarter plugins: smith, marta stew, bard encore, plaza coin, notice petition', async () => {
    const service = new DialogueService(mockLlm());

    const smithMenu = await service.generate({ npcId: 'town_blacksmith', save: testSave() });
    expect(smithMenu.choices.map((c) => c.id)).toEqual(
      expect.arrayContaining(['forge_armor', 'forge_open', 'forge_sharpen', 'forge_whetstone']),
    );
    const sharpened = service.applyChoice(testSave({ adena: 20 }), 'town_blacksmith', 'forge_sharpen');
    expect(sharpened.save.adena).toBe(5);
    expect(sharpened.followUp?.text).toContain('Острая кромка');

    const stew = service.applyChoice(testSave({ adena: 20 }), 'town_innkeeper', 'marta_stew');
    expect(stew.save.inventory).toContain('marta_stew');

    const encore = service.applyChoice(testSave({ adena: 10 }), 'stage_bard', 'bard_encore');
    expect(encore.save.adena).toBe(2);
    expect(encore.followUp?.text).toContain('Бис');

    const coin = service.applyChoice(testSave({ adena: 10 }), 'haven_citizen_plaza', 'plaza_coin');
    expect(coin.save.adena).toBe(7);

    const petition = service.applyChoice(testSave({ adena: 20 }), 'town_notice_board', 'board_petition');
    expect(petition.save.questFlags.quest_forum_petition_complete).toBe(true);
    expect(petition.save.inventory).toContain('forum_seal');
  });

  it('apartment kit requires housing; rest_here falls through', () => {
    const service = new DialogueService(mockLlm());
    const noHome = service.applyChoice(testSave({ adena: 40 }), 'apartment_chest', 'apt_kit');
    expect(noHome.followUp?.text).toMatch(/квартир/i);

    const tenant = testSave({
      adena: 40,
      housing: {
        tier: 1,
        purchasedAt: new Date().toISOString(),
        storages: { materials: [], gear: [], food: [] },
      },
    });
    const kit = service.applyChoice(tenant, 'apartment_chest', 'apt_kit');
    expect(kit.save.inventory).toContain('apt_travel_kit');

    const rest = service.applyChoice(tenant, 'apartment_bed', 'rest_here');
    expect(rest.followUp).toBeUndefined();
  });

  it('hq sentry with access offers briefing; priest hides confess at karma 0', async () => {
    const service = new DialogueService(mockLlm());
    const gate = await service.generate({
      npcId: 'town_hq_sentry',
      save: testSave({ questFlags: { quest_empery_hq_access: true } }),
    });
    const ids = gate.choices.map((c) => c.id);
    expect(ids).toContain('hq_briefing');
    expect(ids).toContain('hq_leave');

    const priest = await service.generate({ npcId: 'town_priest', save: testSave({ karma: 0 }) });
    expect(priest.choices.map((c) => c.id)).toContain('priest_candle');
    expect(priest.choices.map((c) => c.id)).not.toContain('priest_confess');
  });
});
