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
  MARKET_CITIZEN_NPC_ID,
  MARKET_PIE_COST,
  MARKET_PIE_ITEM,
  MARKET_SHIFT_COMPLETE_FLAG,
  MARKET_SHIFT_REWARD_ADENA,
  MARKET_SHIFT_STAMINA_COST,
  buyMarketPie,
  helpMarketShift,
} from './citizen-market.js';
import {
  applyCitizenMarketChoice,
  generateCitizenMarketDialogue,
} from './citizen-market-dialogue.js';

function testSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  return applyStatsToSave({
    id: 'test-market-citizen',
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

function marketNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/haven_citizen_market.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, nodes: raw.nodes ?? {}, ...overrides };
}

describe('market_pie item', () => {
  beforeAll(() => {
    clearItemsCache();
  });

  it('loads market_pie from haven-citizen-market.yaml', () => {
    const item = getItem(MARKET_PIE_ITEM);
    expect(item?.name).toBe('Пирог с прилавка');
    expect(item?.slot).toBe('consumable');
    expect(item?.survival?.nutrition).toBe(10);
    expect(item?.icon).toBe('/media/assets/item_market_pie.webp');
  });
});

describe('buyMarketPie', () => {
  it('fails without enough adena and does not grant the pie', () => {
    const res = buyMarketPie(testSave({ adena: 7, inventory: ['bread_loaf'] }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(7);
    expect(res.save.inventory).toEqual(['bread_loaf']);
    expect(res.message).toContain(String(MARKET_PIE_COST));
  });

  it('spends 8 adena and gives market_pie', () => {
    const res = buyMarketPie(testSave({ adena: 20 }));
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(20 - MARKET_PIE_COST);
    expect(res.save.inventory).toContain(MARKET_PIE_ITEM);
    expect(res.save.inventory.filter((id) => id === MARKET_PIE_ITEM)).toHaveLength(1);
  });

  it('is repeatable', () => {
    const first = buyMarketPie(testSave({ adena: 20 }));
    const second = buyMarketPie(first.save);
    expect(second.ok).toBe(true);
    expect(second.save.adena).toBe(20 - MARKET_PIE_COST * 2);
    expect(second.save.inventory.filter((id) => id === MARKET_PIE_ITEM)).toHaveLength(2);
  });
});

describe('helpMarketShift', () => {
  it('fails when stamina is below 50', () => {
    const res = helpMarketShift(testSave({ stamina: MARKET_SHIFT_STAMINA_COST - 1, adena: 10 }));
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(10);
    expect(res.save.stamina).toBe(MARKET_SHIFT_STAMINA_COST - 1);
    expect(res.save.questFlags[MARKET_SHIFT_COMPLETE_FLAG]).toBeFalsy();
    expect(res.message).toContain(String(MARKET_SHIFT_STAMINA_COST));
  });

  it('succeeds at exactly 50 stamina: drains 50, pays 40, sets complete', () => {
    const res = helpMarketShift(testSave({ stamina: MARKET_SHIFT_STAMINA_COST, adena: 5 }));
    expect(res.ok).toBe(true);
    expect(res.save.stamina).toBe(0);
    expect(res.save.adena).toBe(5 + MARKET_SHIFT_REWARD_ADENA);
    expect(res.save.questFlags[MARKET_SHIFT_COMPLETE_FLAG]).toBe(true);
  });

  it('rejects a second shift after complete', () => {
    const first = helpMarketShift(testSave({ stamina: PLAYER_STAMINA_MAX, adena: 0 }));
    expect(first.ok).toBe(true);
    const second = helpMarketShift(first.save);
    expect(second.ok).toBe(false);
    expect(second.save.adena).toBe(MARKET_SHIFT_REWARD_ADENA);
    expect(second.save.stamina).toBe(first.save.stamina);
    expect(second.message).toContain('уже');
  });
});

describe('citizen market dialogue plugin', () => {
  it('generateCitizenMarketDialogue returns null for other npcs', () => {
    expect(generateCitizenMarketDialogue(marketNpc({ id: 'haven_citizen_plaza' }), testSave())).toBeNull();
  });

  it('generate includes citizen_advice and pie', () => {
    const dlg = generateCitizenMarketDialogue(marketNpc(), testSave());
    expect(dlg).not.toBeNull();
    expect(dlg!.npcId).toBe(MARKET_CITIZEN_NPC_ID);
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('citizen_advice');
    expect(ids).toContain('citizen_market_pie');
    expect(ids).toContain('citizen_market_shift');
    expect(ids).toContain('citizen_rumors');
    expect(ids).toContain('citizen_leave');
    expect(dlg!.text).toContain('торговых рядах');
    expect(dlg!.text).toContain('Прилавок');
  });

  it('hides shift after complete and still offers pie', () => {
    const dlg = generateCitizenMarketDialogue(
      marketNpc(),
      testSave({ questFlags: { [MARKET_SHIFT_COMPLETE_FLAG]: true } }),
    );
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('citizen_market_pie');
    expect(ids).toContain('citizen_advice');
    expect(ids).not.toContain('citizen_market_shift');
    expect(dlg!.text).toContain('Пирог');
  });

  it('greeting uses formatCitizenGreeting recognition', () => {
    const dlg = generateCitizenMarketDialogue(marketNpc(), testSave({ karma: 5 }));
    expect(dlg!.text).toContain('От тебя за версту разит кровью');
    expect(dlg!.text).toContain('торговых рядах');
  });

  it('applyCitizenMarketChoice returns null for unknown npc', () => {
    expect(
      applyCitizenMarketChoice(marketNpc({ id: 'haven_citizen_plaza' }), testSave(), 'citizen_market_pie'),
    ).toBeNull();
  });

  it('apply returns null for citizen_rumors, citizen_advice, citizen_leave', () => {
    const npc = marketNpc();
    const save = testSave();
    expect(applyCitizenMarketChoice(npc, save, 'citizen_rumors')).toBeNull();
    expect(applyCitizenMarketChoice(npc, save, 'citizen_advice')).toBeNull();
    expect(applyCitizenMarketChoice(npc, save, 'citizen_leave')).toBeNull();
  });

  it('applies pie buy via dialogue and keeps remaining choices', () => {
    const npc = marketNpc();
    const failed = applyCitizenMarketChoice(npc, testSave({ adena: 0 }), 'citizen_market_pie');
    expect(failed?.followUp?.text).toContain(String(MARKET_PIE_COST));
    expect(failed?.save.inventory).toEqual([]);

    const bought = applyCitizenMarketChoice(npc, testSave({ adena: 16 }), 'citizen_market_pie');
    expect(bought?.save.inventory).toContain(MARKET_PIE_ITEM);
    expect(bought?.save.adena).toBe(16 - MARKET_PIE_COST);
    const ids = bought?.followUp?.choices.map((c) => c.id) ?? [];
    expect(ids).toContain('citizen_market_pie');
    expect(ids).toContain('citizen_advice');
  });

  it('applies shift once through applyCitizenMarketChoice and hides it after', () => {
    const npc = marketNpc();
    const helped = applyCitizenMarketChoice(
      npc,
      testSave({ stamina: 80, adena: 1 }),
      'citizen_market_shift',
    );
    expect(helped?.save.questFlags[MARKET_SHIFT_COMPLETE_FLAG]).toBe(true);
    expect(helped?.save.adena).toBe(1 + MARKET_SHIFT_REWARD_ADENA);
    expect(helped?.save.stamina).toBe(80 - MARKET_SHIFT_STAMINA_COST);
    expect(helped?.followUp?.choices.map((c) => c.id)).not.toContain('citizen_market_shift');
    expect(helped?.followUp?.choices.map((c) => c.id)).toContain('citizen_market_pie');

    const again = applyCitizenMarketChoice(npc, helped!.save, 'citizen_market_shift');
    expect(again?.save.adena).toBe(helped!.save.adena);
    expect(again?.followUp?.text).toContain('уже');
  });
});
