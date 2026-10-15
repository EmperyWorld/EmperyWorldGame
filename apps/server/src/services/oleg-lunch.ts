/**
 * Дневной обед трактирщика Олега (town_innkeeper_day):
 * 12 адены → бульон + бафф «Дневной обед». Повторно.
 * Кости / отдых / рыба остаются на родителе — этот модуль их не трогает.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const OLEG_NPC_ID = 'town_innkeeper_day';
export const OLEG_LUNCH_COST = 12;
export const OLEG_BROTH_ITEM = 'oleg_broth';

export const OLEG_LUNCH_BUFF_ID = 'oleg_lunch';
export const OLEG_LUNCH_BUFF_STAT = 'mDef' as const;
export const OLEG_LUNCH_BUFF_AMOUNT = 5;
export const OLEG_LUNCH_BUFF_DURATION_MS = 15 * 60 * 1000;
export const OLEG_LUNCH_BUFF_NAME = 'Дневной обед';

export interface OlegLunchResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** Дневной обед: 12 адены, `oleg_broth` + бафф mDef. Повторно. */
export function serveOlegLunch(save: PlayerSave): OlegLunchResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < OLEG_LUNCH_COST) {
    return {
      save,
      ok: false,
      message: `Дневной обед стоит ${OLEG_LUNCH_COST} адены. Без звона в кармане котёл не откроется.`,
    };
  }

  let next: PlayerSave = {
    ...save,
    adena: currentAdena - OLEG_LUNCH_COST,
  };
  next = appendItemsToSave(next, [OLEG_BROTH_ITEM]);
  next = applyNamedBuff(next, {
    buffId: OLEG_LUNCH_BUFF_ID,
    buffStat: OLEG_LUNCH_BUFF_STAT,
    buffName: OLEG_LUNCH_BUFF_NAME,
    amount: OLEG_LUNCH_BUFF_AMOUNT,
    durationMs: OLEG_LUNCH_BUFF_DURATION_MS,
  });
  const finalSave = applyStatsToSave(next);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: finalSave.id,
    locationId: finalSave.location,
    payload: { action: 'OLEG_LUNCH', cost: OLEG_LUNCH_COST },
    timestamp: Date.now(),
  });

  return {
    save: finalSave,
    ok: true,
    message:
      `Олег ставит миску: горячий бульон с перцем. Держи «Бульон Олега». ` +
      `Получен бафф «${OLEG_LUNCH_BUFF_NAME}» (+${OLEG_LUNCH_BUFF_AMOUNT} маг. защиты на 15 мин).`,
  };
}
