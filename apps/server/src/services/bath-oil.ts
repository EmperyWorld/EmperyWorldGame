/**
 * Haven bath courtyard — Банщица Ника (town_bathkeeper):
 * repeatable nika_oil sale + unique speed buff (not bath_steam).
 * Session/tea stay in haven-services.ts — do not add logic there from here.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const BATH_NPC_ID = 'town_bathkeeper';
export const BATH_OIL_COST = 18;
export const NIKA_OIL_ITEM = 'nika_oil';

export const NIKA_OIL_BUFF_ID = 'nika_oil';
export const NIKA_OIL_BUFF_STAT = 'speed' as const;
export const NIKA_OIL_BUFF_AMOUNT = 12;
export const NIKA_OIL_BUFF_DURATION_MS = 15 * 60 * 1000;
export const NIKA_OIL_BUFF_NAME = 'Банное масло';

export interface BathOilResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** Банное масло Ники: 18 адены, флакон `nika_oil` + бафф скорости. Повторно. */
export function buyNikaOil(save: PlayerSave): BathOilResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < BATH_OIL_COST) {
    return {
      save,
      ok: false,
      message: `Банное масло стоит ${BATH_OIL_COST} адены. Без звона в кармане флакон не открою.`,
    };
  }

  let nextSave: PlayerSave = {
    ...save,
    adena: currentAdena - BATH_OIL_COST,
  };

  nextSave = appendItemsToSave(nextSave, [NIKA_OIL_ITEM]);
  nextSave = applyNamedBuff(nextSave, {
    buffId: NIKA_OIL_BUFF_ID,
    buffStat: NIKA_OIL_BUFF_STAT,
    buffName: NIKA_OIL_BUFF_NAME,
    amount: NIKA_OIL_BUFF_AMOUNT,
    durationMs: NIKA_OIL_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'BATH_OIL', cost: BATH_OIL_COST },
    timestamp: Date.now(),
  });

  return {
    save: finalSave,
    ok: true,
    message: `Ника растирает масло по ладоням — кожа мягче, шаг легче. Держи флакон «Масло Ники». Получен бафф «${NIKA_OIL_BUFF_NAME}» (+${NIKA_OIL_BUFF_AMOUNT} к скорости на 15 мин).`,
  };
}
