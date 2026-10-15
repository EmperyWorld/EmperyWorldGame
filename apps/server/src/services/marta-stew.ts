/**
 * Haven night inn — Хозяйка трактира Марта (town_innkeeper):
 * repeatable night stew sale. Dice / rest / fish stay on the parent.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const MARTA_NPC_ID = 'town_innkeeper';
export const MARTA_STEW_COST = 14;
export const MARTA_STEW_ITEM = 'marta_stew';

export const MARTA_HEARTH_BUFF_ID = 'marta_hearth';
export const MARTA_HEARTH_BUFF_STAT = 'pDef' as const;
export const MARTA_HEARTH_BUFF_AMOUNT = 6;
export const MARTA_HEARTH_BUFF_DURATION_MS = 20 * 60 * 1000;
export const MARTA_HEARTH_BUFF_NAME = 'Ночной очаг';

export interface MartaStewResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

export function countMartaStew(save: PlayerSave): number {
  return (save.inventory ?? []).filter((id) => id === MARTA_STEW_ITEM).length;
}

/** Ночной горшок Марты: 14 адены, предмет + бафф «Ночной очаг». Повторно. */
export function buyMartaStew(save: PlayerSave): MartaStewResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < MARTA_STEW_COST) {
    return {
      save,
      ok: false,
      message: `Ночной горшок стоит ${MARTA_STEW_COST} адены. Очаг не кормит в долг.`,
    };
  }

  let next: PlayerSave = { ...save, adena: currentAdena - MARTA_STEW_COST };
  next = appendItemsToSave(next, [MARTA_STEW_ITEM]);
  next = applyNamedBuff(next, {
    buffId: MARTA_HEARTH_BUFF_ID,
    buffStat: MARTA_HEARTH_BUFF_STAT,
    buffName: MARTA_HEARTH_BUFF_NAME,
    amount: MARTA_HEARTH_BUFF_AMOUNT,
    durationMs: MARTA_HEARTH_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(next);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'MARTA_STEW', cost: MARTA_STEW_COST },
    timestamp: Date.now(),
  });

  return {
    save: finalSave,
    ok: true,
    message: `Марта черпает из котла: густой ночной горшок. Получен бафф «${MARTA_HEARTH_BUFF_NAME}» (+${MARTA_HEARTH_BUFF_AMOUNT} к физ. защите на 20 мин).`,
  };
}
