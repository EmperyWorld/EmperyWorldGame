/**
 * Daily deal for Торговец Лорен (town_merchant).
 * Dialogue purchase at a discount — does not change haven_merchant shop offers.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';

export const MERCHANT_NPC_ID = 'town_merchant';
export const HAVEN_MERCHANT_DEAL_DAY_FLAG = 'haven_merchant_deal_day';

/** Bakery list price for bread_loaf is 14; deal is cheaper. */
export const MERCHANT_DEAL_BREAD_PRICE = 8;
export const MERCHANT_DEAL_BISCUIT_PRICE = 6;
/** Brewery list price for haven_ale is 16; deal is cheaper. */
export const MERCHANT_DEAL_ALE_PRICE = 10;

export interface MerchantDealOffer {
  itemId: string;
  price: number;
  label: string;
}

export const MERCHANT_DEALS: readonly MerchantDealOffer[] = [
  { itemId: 'bread_loaf', price: MERCHANT_DEAL_BREAD_PRICE, label: 'Свежий хлеб' },
  { itemId: 'travel_biscuit', price: MERCHANT_DEAL_BISCUIT_PRICE, label: 'Дорожный сухарь' },
  { itemId: 'haven_ale', price: MERCHANT_DEAL_ALE_PRICE, label: 'Эль Гавани' },
];

export interface MerchantDealResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

export function utcDealDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** UTC day-of-year 1..366 — deal stays stable for the calendar day of the once-per-day flag. */
export function utcDayOfYear(now: Date = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - start) / 86_400_000) + 1;
}

/**
 * Rotate the three offers by UTC day-of-year (hour alternative: `now.getUTCHours() % 3`).
 */
export function merchantDealSlot(now: Date = new Date()): number {
  return (utcDayOfYear(now) - 1) % MERCHANT_DEALS.length;
}

export function currentMerchantDeal(now: Date = new Date()): MerchantDealOffer {
  const offer = MERCHANT_DEALS[merchantDealSlot(now)];
  return offer ?? MERCHANT_DEALS[0]!;
}

export function dealChoiceLabel(deal: MerchantDealOffer = currentMerchantDeal()): string {
  return `Сделка дня: ${deal.label} (${deal.price} адены)`;
}

export function isMerchantDealClosed(save: PlayerSave, now: Date = new Date()): boolean {
  return save.questFlags[HAVEN_MERCHANT_DEAL_DAY_FLAG] === utcDealDateString(now);
}

export function buyDailyDeal(save: PlayerSave, now: Date = new Date()): MerchantDealResult {
  if (isMerchantDealClosed(save, now)) {
    return {
      save,
      ok: false,
      message: 'На сегодня сделка закрыта',
    };
  }

  const deal = currentMerchantDeal(now);
  const adena = save.adena ?? 0;
  if (adena < deal.price) {
    return {
      save,
      ok: false,
      message: `Не хватает адены. Сделка дня стоит ${deal.price}, у тебя ${adena}.`,
    };
  }

  const paid: PlayerSave = {
    ...save,
    adena: adena - deal.price,
    questFlags: {
      ...save.questFlags,
      [HAVEN_MERCHANT_DEAL_DAY_FLAG]: utcDealDateString(now),
    },
  };
  const next = appendItemsToSave(paid, [deal.itemId]);

  return {
    save: next,
    ok: true,
    message: `Лорен кивает и прячет монету: ${deal.label} по сделке дня за ${deal.price} адены. Завтра будет другой товар.`,
  };
}
