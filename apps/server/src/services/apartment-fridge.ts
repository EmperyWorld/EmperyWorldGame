/**
 * Haven apartment fridge (Ледник-холодильник):
 * once-per-UTC-day tenant ration. Food storage stays client-side (open_storage).
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';

export const APT_FRIDGE_NPC_ID = 'apartment_fridge';
export const APT_RATION_ITEM = 'apt_ration';
export const HAVEN_APT_RATION_DAY_FLAG = 'haven_apt_ration_day';

export const APT_RATION_NO_HOUSING = 'Сначала ключ от квартиры';
export const APT_RATION_ALREADY_TAKEN = 'Паёк на сегодня уже брали. Завтра после полуночи по UTC — новый.';

export interface AptFridgeResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** UTC day-of-year 1..366 — same calendar day as merchant-deal.ts utcDayOfYear. */
export function utcDayOfYear(now: Date = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - start) / 86_400_000) + 1;
}

export function isAptRationTakenToday(save: PlayerSave, now: Date = new Date()): boolean {
  return save.questFlags[HAVEN_APT_RATION_DAY_FLAG] === utcDayOfYear(now);
}

/** One apt_ration per UTC calendar day. Requires save.housing. */
export function takeAptRation(save: PlayerSave, now: Date = new Date()): AptFridgeResult {
  if (!save.housing) {
    return { save, ok: false, message: APT_RATION_NO_HOUSING };
  }

  if (isAptRationTakenToday(save, now)) {
    return { save, ok: false, message: APT_RATION_ALREADY_TAKEN };
  }

  const flagged: PlayerSave = {
    ...save,
    questFlags: {
      ...save.questFlags,
      [HAVEN_APT_RATION_DAY_FLAG]: utcDayOfYear(now),
    },
  };
  const next = appendItemsToSave(flagged, [APT_RATION_ITEM], now.getTime());

  return {
    save: next,
    ok: true,
    message: 'Холод отдал паёк жильца. Один на сутки — больше сегодня не даст.',
  };
}
