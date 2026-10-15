/**
 * Haven apartment rack (Стеллаж снаряжения / apartment_rack):
 * paid armor polish for tenants. Gear storage stays client/YAML (`open_storage`).
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const APT_POLISH_COST = 10;
export const APT_POLISH_BUFF_ID = 'apt_polish';
export const APT_POLISH_BUFF_STAT = 'pDef' as const;
export const APT_POLISH_BUFF_AMOUNT = 8;
export const APT_POLISH_BUFF_DURATION_MS = 20 * 60 * 1000;
export const APT_POLISH_BUFF_NAME = 'Натёртый доспех';

export const APT_POLISH_NO_HOUSING = 'Сначала ключ от квартиры';

export interface ApartmentRackResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** Tenant armor polish: 10 adena, pDef buff, no item. Repeatable. */
export function aptPolish(save: PlayerSave, now = Date.now()): ApartmentRackResult {
  if (!save.housing) {
    return { save, ok: false, message: APT_POLISH_NO_HOUSING };
  }

  const currentAdena = save.adena ?? 0;
  if (currentAdena < APT_POLISH_COST) {
    return {
      save,
      ok: false,
      message: `Натереть доспех стоит ${APT_POLISH_COST} адены. У тебя: ${currentAdena}.`,
    };
  }

  let nextSave: PlayerSave = {
    ...save,
    adena: currentAdena - APT_POLISH_COST,
  };

  nextSave = applyNamedBuff(nextSave, {
    buffId: APT_POLISH_BUFF_ID,
    buffStat: APT_POLISH_BUFF_STAT,
    buffName: APT_POLISH_BUFF_NAME,
    amount: APT_POLISH_BUFF_AMOUNT,
    durationMs: APT_POLISH_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'APT_POLISH', cost: APT_POLISH_COST },
    timestamp: now,
  });

  return {
    save: finalSave,
    ok: true,
    message: `Доспех блестит. Получен бафф «${APT_POLISH_BUFF_NAME}» (+${APT_POLISH_BUFF_AMOUNT} к физ. защите на 20 мин). (−${APT_POLISH_COST} адены)`,
  };
}
