/**
 * Haven apartment bed — Кровать:
 * free linen rest with mpRegen buff. Plain rest stays on the client API.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { restAtApartment } from './housing.js';
import { applyStatsToSave } from './stats.js';

export const APT_LINEN_NO_HOUSING = 'Сначала нужна квартира у Эдмунда.';

export const APT_LINEN_BUFF_ID = 'apt_linen';
export const APT_LINEN_BUFF_STAT = 'mpRegen' as const;
export const APT_LINEN_BUFF_AMOUNT = 5;
export const APT_LINEN_BUFF_DURATION_MS = 30 * 60 * 1000;
export const APT_LINEN_BUFF_NAME = 'Чистые простыни';

export interface ApartmentBedResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** Free rest + fresh sheets. Repeatable, no adena. */
export function apartmentLinenRest(save: PlayerSave, now = Date.now()): ApartmentBedResult {
  if (!save.housing) {
    return { save, ok: false, message: APT_LINEN_NO_HOUSING };
  }

  const rest = restAtApartment(save, now);
  if (!rest.ok) {
    return rest;
  }

  const withBuff = applyNamedBuff(rest.save, {
    buffId: APT_LINEN_BUFF_ID,
    buffStat: APT_LINEN_BUFF_STAT,
    buffName: APT_LINEN_BUFF_NAME,
    amount: APT_LINEN_BUFF_AMOUNT,
    durationMs: APT_LINEN_BUFF_DURATION_MS,
  });

  return {
    save: applyStatsToSave(withBuff),
    ok: true,
    message: `${rest.message} Получен бафф «${APT_LINEN_BUFF_NAME}».`,
  };
}
