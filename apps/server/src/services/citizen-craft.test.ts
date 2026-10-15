import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT, PLAYER_STAMINA_MAX } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { clearItemsCache, getItem } from './items.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  CRAFT_BELLOWS_COMPLETE_FLAG,
  CRAFT_BELLOWS_REWARD_ADENA,
  CRAFT_BELLOWS_STAMINA_COST,
  CRAFT_NPC_ID,
  CRAFT_SCRAP_COST,
  CRAFT_SCRAP_ITEM,
  buyCraftScrap,
  countCraftScrap,
  pumpCraftBellows,
} from './citizen-craft.js';
import { applyCitizenCraftChoice, generateCitizenCraftDialogue } from './citizen-craft-dialogue.js';

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
    stamina: PLAYER_STAMINA_MAX,
    staminaAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function craftNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/haven_citizen_craft.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

describe('craft scrap item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads craft_scrap from haven-citizen-craft.yaml', () => {
    expect(getItem(CRAFT_SCRAP_ITEM)?.name).toBe('Обрезки с горна');
    expect(getItem(CRAFT_SCRAP_ITEM)?.slot).toBe('material');
    expect(getItem(CRAFT_SCRAP_ITEM)?.icon).toBe('/media/assets/item_craft_scrap.webp');
  });
});

describe('buyCraftScrap', () => {
  it('fails when adena is short', () => {
    const res = buyCraftScrap(testSave({ adena: 3 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(3);
    expect(res.save.inventory).toEqual([]);
    expect(res.message).toContain(String(CRAFT_SCRAP_COST));
  });

  it('costs 4 adena and grants craft_scrap, repeatable', () => {
    const first = buyCraftScrap(testSave({ adena: 20 }));
    expect(first.ok).toBe(true);
    expect(first.save.adena).toBe(20 - CRAFT_SCRAP_COST);
    expect(countCraftScrap(first.save)).toBe(1);
    expect(first.save.inventory).toContain(CRAFT_SCRAP_ITEM);

    const second = buyCraftScrap(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(20 - CRAFT_SCRAP_COST * 2);
    expect(countCraftScrap(second.save)).toBe(2);
  });
});

describe('pumpCraftBellows', () => {
  it('fails when stamina is below 40', () => {
    const res = pumpCraftBellows(testSave({ stamina: 39, adena: 10 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(10);
    expect(res.save.stamina).toBe(39);
    expect(res.save.questFlags[CRAFT_BELLOWS_COMPLETE_FLAG]).toBeFalsy();
    expect(res.message).toContain(String(CRAFT_BELLOWS_STAMINA_COST));
  });

  it('drains 40 stamina, pays 35 adena, sets complete flag once', () => {
    const first = pumpCraftBellows(testSave({ stamina: 80, adena: 10 }));
    expect(first.ok).toBe(true);
    expect(first.save.stamina).toBe(80 - CRAFT_BELLOWS_STAMINA_COST);
    expect(first.save.adena).toBe(10 + CRAFT_BELLOWS_REWARD_ADENA);
    expect(first.save.questFlags[CRAFT_BELLOWS_COMPLETE_FLAG]).toBe(true);

    const second = pumpCraftBellows(first.save);
    expect(second.ok).toBe(false);
    expect(second.save.adena).toBe(10 + CRAFT_BELLOWS_REWARD_ADENA);
    expect(second.save.stamina).toBe(80 - CRAFT_BELLOWS_STAMINA_COST);
    expect(second.message).toContain('уже');
  });

  it('clamps stamina at 0 when pumping at exactly 40', () => {
    const res = pumpCraftBellows(testSave({ stamina: CRAFT_BELLOWS_STAMINA_COST, adena: 0 }));
    expect(res.ok).toBe(true);
    expect(res.save.stamina).toBe(0);
    expect(res.save.adena).toBe(CRAFT_BELLOWS_REWARD_ADENA);
  });
});

describe('citizen craft dialogue plugin', () => {
  it('generateCitizenCraftDialogue returns null for other npcs', () => {
    expect(generateCitizenCraftDialogue(craftNpc({ id: 'haven_citizen_harbor' }), testSave())).toBeNull();
    expect(generateCitizenCraftDialogue(craftNpc({ id: 'town_blacksmith' }), testSave())).toBeNull();
  });

  it('shows scrap, bellows and citizen flavor; greeting via formatCitizenGreeting', () => {
    const dlg = generateCitizenCraftDialogue(craftNpc(), testSave());
    expect(dlg).not.toBeNull();
    expect(dlg!.npcId).toBe(CRAFT_NPC_ID);
    expect(dlg!.text).toContain('Берегись искр');
    expect(dlg!.text).toContain('Мехи просят рук');
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('craft_scrap');
    expect(ids).toContain('craft_bellows');
    expect(ids).toContain('citizen_rumors');
    expect(ids).toContain('citizen_advice');
    expect(ids).toContain('citizen_leave');
    expect(ids).not.toContain('forge_sharpen');
    expect(ids).not.toContain('forge_whetstone');
  });

  it('prefixes greeting when the player has a recognized deed', () => {
    const dlg = generateCitizenCraftDialogue(
      craftNpc(),
      testSave({ questFlags: { quest_board_bounty_complete: true } }),
    );
    expect(dlg!.text).toContain('контракт с городской доски закрыт');
    expect(dlg!.text).toContain('Берегись искр');
  });

  it('hides bellows after complete', () => {
    const dlg = generateCitizenCraftDialogue(
      craftNpc(),
      testSave({ questFlags: { [CRAFT_BELLOWS_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('craft_scrap');
    expect(ids).not.toContain('craft_bellows');
    expect(ids).toContain('citizen_rumors');
    expect(dlg!.text).toContain('Обрезки с горна');
  });

  it('applyCitizenCraftChoice returns null for unknown npc', () => {
    expect(
      applyCitizenCraftChoice(craftNpc({ id: 'haven_citizen_market' }), testSave(), 'craft_scrap'),
    ).toBeNull();
  });

  it('falls through rumors, advice and leave', () => {
    const npc = craftNpc();
    const save = testSave();
    expect(applyCitizenCraftChoice(npc, save, 'citizen_rumors')).toBeNull();
    expect(applyCitizenCraftChoice(npc, save, 'citizen_advice')).toBeNull();
    expect(applyCitizenCraftChoice(npc, save, 'citizen_leave')).toBeNull();
  });

  it('buys scrap via apply and keeps remaining choices', () => {
    const npc = craftNpc();
    const failed = applyCitizenCraftChoice(npc, testSave({ adena: 0 }), 'craft_scrap');
    expect(failed?.followUp?.text).toContain(String(CRAFT_SCRAP_COST));
    expect(failed?.save.inventory).toEqual([]);

    const bought = applyCitizenCraftChoice(npc, testSave({ adena: 10 }), 'craft_scrap');
    expect(bought?.save.adena).toBe(10 - CRAFT_SCRAP_COST);
    expect(bought?.save.inventory).toContain(CRAFT_SCRAP_ITEM);
    expect(bought?.followUp?.choices.map((c) => c.id)).toContain('craft_scrap');
    expect(bought?.followUp?.choices.map((c) => c.id)).toContain('craft_bellows');
    expect(bought?.followUp?.choices.map((c) => c.id)).toContain('citizen_rumors');
  });

  it('pumps bellows once through apply and hides the choice', () => {
    const npc = craftNpc();
    const first = applyCitizenCraftChoice(npc, testSave({ stamina: 90, adena: 5 }), 'craft_bellows');
    expect(first?.save.questFlags[CRAFT_BELLOWS_COMPLETE_FLAG]).toBe(true);
    expect(first?.save.adena).toBe(5 + CRAFT_BELLOWS_REWARD_ADENA);
    expect(first?.save.stamina).toBe(90 - CRAFT_BELLOWS_STAMINA_COST);
    expect(first?.followUp?.choices.map((c) => c.id)).not.toContain('craft_bellows');
    expect(first?.followUp?.choices.map((c) => c.id)).toContain('craft_scrap');

    const second = applyCitizenCraftChoice(npc, first!.save, 'craft_bellows');
    expect(second?.save.adena).toBe(5 + CRAFT_BELLOWS_REWARD_ADENA);
    expect(second?.save.questFlags[CRAFT_BELLOWS_COMPLETE_FLAG]).toBe(true);
    expect(second?.followUp?.text).toContain('уже');
  });
});
