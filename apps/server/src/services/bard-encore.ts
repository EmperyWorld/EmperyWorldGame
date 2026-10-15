/**
 * Haven amphitheatre encore (Бард Кай): paid critRate buff «Бис Кая».
 * Existing bard_buff / custom songs stay in haven-services.ts — do not call them here.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const BARD_ENCORE_COST = 8;
export const BARD_ENCORE_BUFF_ID = 'kai_encore';
export const BARD_ENCORE_BUFF_STAT = 'critRate' as const;
export const BARD_ENCORE_BUFF_AMOUNT = 6;
export const BARD_ENCORE_BUFF_DURATION_MS = 15 * 60 * 1000;
export const BARD_ENCORE_BUFF_NAME = 'Бис Кая';

export interface BardEncoreResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** Paid encore: +critRate («Бис Кая»), 8 адены. Repeatable — overwrites own timer. */
export function requestBardEncore(save: PlayerSave): BardEncoreResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < BARD_ENCORE_COST) {
    return {
      save,
      ok: false,
      message: `Бис стоит ${BARD_ENCORE_COST} адены. Без звона в кармане Кай кланяется, но струны молчат.`,
    };
  }

  let nextSave: PlayerSave = { ...save, adena: currentAdena - BARD_ENCORE_COST };
  nextSave = applyNamedBuff(nextSave, {
    buffId: BARD_ENCORE_BUFF_ID,
    buffStat: BARD_ENCORE_BUFF_STAT,
    buffName: BARD_ENCORE_BUFF_NAME,
    amount: BARD_ENCORE_BUFF_AMOUNT,
    durationMs: BARD_ENCORE_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(nextSave);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'BARD_ENCORE', cost: BARD_ENCORE_COST },
    timestamp: Date.now(),
  });

  return {
    save: finalSave,
    ok: true,
    message: `Кай бьёт по струнам на бис: получен бафф «${BARD_ENCORE_BUFF_NAME}» (+${BARD_ENCORE_BUFF_AMOUNT} к шансу крита на 15 мин).`,
  };
}
