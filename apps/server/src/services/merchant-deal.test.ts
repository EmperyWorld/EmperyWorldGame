import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { getItem } from './items.js';
import { contentRoot } from './paths.js';
import type { HavenNpcLike } from './haven-npc-plugin.js';
import {
  HAVEN_MERCHANT_DEAL_DAY_FLAG,
  MERCHANT_DEAL_ALE_PRICE,
  MERCHANT_DEAL_BISCUIT_PRICE,
  MERCHANT_DEAL_BREAD_PRICE,
  buyDailyDeal,
  currentMerchantDeal,
  dealChoiceLabel,
  utcDayOfYear,
  utcDealDateString,
} from './merchant-deal.js';
import { applyMerchantChoice, generateMerchantDialogue } from './merchant-deal-dialogue.js';

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

function merchantNpc(overrides: Partial<HavenNpcLike> = {}): HavenNpcLike {
  const raw = parseYaml(
    readFileSync(join(contentRoot, 'npcs/town_merchant.yaml'), 'utf8'),
  ) as HavenNpcLike;
  return { ...raw, ...overrides };
}

const DAY_BREAD = new Date('2026-01-01T12:00:00.000Z');
const DAY_BISCUIT = new Date('2026-01-02T12:00:00.000Z');
const DAY_ALE = new Date('2026-01-03T12:00:00.000Z');
const DAY_BREAD_AGAIN = new Date('2026-01-04T12:00:00.000Z');

describe('merchant deal items', () => {
  it('loads rotating deal items from content YAML', () => {
    expect(getItem('bread_loaf')?.name).toBe('Свежий хлеб');
    expect(getItem('travel_biscuit')?.name).toBe('Дорожный сухарь');
    expect(getItem('haven_ale')?.name).toBe('Эль Гавани');
  });
});

describe('currentMerchantDeal', () => {
  it('rotates three offers by UTC day-of-year', () => {
    expect(utcDayOfYear(DAY_BREAD)).toBe(1);
    expect(currentMerchantDeal(DAY_BREAD)).toEqual({
      itemId: 'bread_loaf',
      price: MERCHANT_DEAL_BREAD_PRICE,
      label: 'Свежий хлеб',
    });
    expect(currentMerchantDeal(DAY_BISCUIT)).toEqual({
      itemId: 'travel_biscuit',
      price: MERCHANT_DEAL_BISCUIT_PRICE,
      label: 'Дорожный сухарь',
    });
    expect(currentMerchantDeal(DAY_ALE)).toEqual({
      itemId: 'haven_ale',
      price: MERCHANT_DEAL_ALE_PRICE,
      label: 'Эль Гавани',
    });
    expect(currentMerchantDeal(DAY_BREAD_AGAIN).itemId).toBe('bread_loaf');
  });

  it('keeps hour-of-day from changing the offer (calendar day lock)', () => {
    expect(currentMerchantDeal(new Date('2026-01-01T00:15:00.000Z')).itemId).toBe('bread_loaf');
    expect(currentMerchantDeal(new Date('2026-01-01T23:45:00.000Z')).itemId).toBe('bread_loaf');
  });
});

describe('buyDailyDeal', () => {
  it('fails when the player cannot pay', () => {
    const deal = currentMerchantDeal(DAY_BREAD);
    const save = testSave({ adena: deal.price - 1, inventory: ['oak_spear'] });
    const res = buyDailyDeal(save, DAY_BREAD);
    expect(res.ok).toBe(false);
    expect(res.save.adena).toBe(deal.price - 1);
    expect(res.save.inventory).toEqual(['oak_spear']);
    expect(res.save.questFlags[HAVEN_MERCHANT_DEAL_DAY_FLAG]).toBeUndefined();
    expect(res.message).toContain(String(deal.price));
  });

  it('charges deal price, gives one item, stamps UTC date', () => {
    const deal = currentMerchantDeal(DAY_BISCUIT);
    const res = buyDailyDeal(testSave({ adena: deal.price + 3 }), DAY_BISCUIT);
    expect(res.ok).toBe(true);
    expect(res.save.adena).toBe(3);
    expect(res.save.inventory.filter((id) => id === deal.itemId)).toHaveLength(1);
    expect(res.save.questFlags[HAVEN_MERCHANT_DEAL_DAY_FLAG]).toBe(utcDealDateString(DAY_BISCUIT));
    expect(res.message).toContain(deal.label);
  });

  it('rejects a second buy on the same UTC day', () => {
    const first = buyDailyDeal(testSave({ adena: 40 }), DAY_ALE);
    expect(first.ok).toBe(true);
    const second = buyDailyDeal(first.save, new Date('2026-01-03T23:50:00.000Z'));
    expect(second.ok).toBe(false);
    expect(second.message).toBe('На сегодня сделка закрыта');
    expect(second.save.adena).toBe(first.save.adena);
    expect(second.save.inventory).toEqual(first.save.inventory);
  });

  it('allows a buy on the next UTC day', () => {
    const first = buyDailyDeal(testSave({ adena: 40 }), DAY_BREAD);
    const next = buyDailyDeal(first.save, DAY_BISCUIT);
    expect(next.ok).toBe(true);
    expect(next.save.questFlags[HAVEN_MERCHANT_DEAL_DAY_FLAG]).toBe('2026-01-02');
    expect(next.save.inventory).toEqual(['bread_loaf', 'travel_biscuit']);
  });
});

describe('town_merchant.yaml', () => {
  it('keeps browse_done and adds merchant_shop + merchant_deal', () => {
    const npc = merchantNpc();
    const ids = (npc.choices ?? []).map((c) => c.id);
    expect(ids).toEqual(['merchant_shop', 'merchant_deal', 'browse_done']);
    expect(npc.choices.find((c) => c.id === 'merchant_shop')?.label).toBe('Открыть лавку');
  });
});

describe('merchant dialogue plugin', () => {
  it('generateMerchantDialogue returns null for other npcs', () => {
    expect(generateMerchantDialogue(merchantNpc({ id: 'town_miller' }), testSave())).toBeNull();
  });

  it('always greets with today deal and lists shop / deal / leave', () => {
    const dlg = generateMerchantDialogue(merchantNpc(), testSave(), DAY_BREAD);
    expect(dlg).not.toBeNull();
    expect(dlg!.text).toContain('Сделка дня');
    expect(dlg!.text).toContain('Свежий хлеб');
    expect(dlg!.text).toContain(String(MERCHANT_DEAL_BREAD_PRICE));
    const ids = dlg!.choices.map((c) => c.id);
    expect(ids).toContain('merchant_shop');
    expect(ids).toContain('merchant_deal');
    expect(ids).toContain('browse_done');
    expect(dlg!.choices.find((c) => c.id === 'merchant_shop')?.label).toBe('Открыть лавку');
    expect(dlg!.choices.find((c) => c.id === 'merchant_deal')?.label).toBe(
      dealChoiceLabel(currentMerchantDeal(DAY_BREAD)),
    );
    expect(dlg!.choices.find((c) => c.id === 'browse_done')?.label).toBe('Уйти');
  });

  it('mentions closed deal in greeting after a buy', () => {
    const bought = buyDailyDeal(testSave({ adena: 40 }), DAY_ALE);
    const dlg = generateMerchantDialogue(merchantNpc(), bought.save, DAY_ALE);
    expect(dlg!.text).toContain('закрыта');
    expect(dlg!.text).toContain('Эль Гавани');
  });

  it('applyMerchantChoice returns null for unknown npc', () => {
    expect(
      applyMerchantChoice(testSave(), merchantNpc({ id: 'town_miller' }), 'merchant_deal'),
    ).toBeNull();
  });

  it('merchant_shop and browse_done return save without follow-up', () => {
    const save = testSave();
    const npc = merchantNpc();
    const shop = applyMerchantChoice(save, npc, 'merchant_shop');
    expect(shop).not.toBeNull();
    expect(shop!.followUp).toBeUndefined();
    expect(shop!.save).toBe(save);

    const leave = applyMerchantChoice(save, npc, 'browse_done');
    expect(leave).not.toBeNull();
    expect(leave!.followUp).toBeUndefined();
    expect(leave!.save).toBe(save);

    const altLeave = applyMerchantChoice(save, npc, 'merchant_leave');
    expect(altLeave).not.toBeNull();
    expect(altLeave!.save).toBe(save);
  });

  it('falls through unknown ids', () => {
    expect(applyMerchantChoice(testSave(), merchantNpc(), 'buy_oak_spear')).toBeNull();
  });

  it('applies the daily deal through dialogue and keeps remaining choices', () => {
    const npc = merchantNpc();
    const poor = applyMerchantChoice(testSave({ adena: 0 }), npc, 'merchant_deal', DAY_BREAD);
    expect(poor?.followUp?.text).toContain('адены');
    expect(poor?.save.adena).toBe(0);
    expect(poor?.save.inventory).toEqual([]);

    const ok = applyMerchantChoice(testSave({ adena: 20 }), npc, 'merchant_deal', DAY_BREAD);
    expect(ok?.save.inventory).toContain('bread_loaf');
    expect(ok?.save.adena).toBe(20 - MERCHANT_DEAL_BREAD_PRICE);
    expect(ok?.save.questFlags[HAVEN_MERCHANT_DEAL_DAY_FLAG]).toBe('2026-01-01');
    const ids = ok?.followUp?.choices.map((c) => c.id) ?? [];
    expect(ids).toContain('merchant_shop');
    expect(ids).toContain('merchant_deal');
    expect(ids).toContain('browse_done');

    const again = applyMerchantChoice(ok!.save, npc, 'merchant_deal', DAY_BREAD);
    expect(again?.followUp?.text).toBe('На сегодня сделка закрыта');
    expect(again?.save.adena).toBe(ok!.save.adena);
  });
});
