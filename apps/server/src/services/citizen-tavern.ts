/**
 * Haven tavern courtyard citizen (Завсегдатай / haven_citizen_tavern):
 * repeatable paid round — attackSpeed buff «Застолье». No item.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { applyStatsToSave } from './stats.js';

export const TAVERN_ROUND_COST = 9;

export const TAVERN_CHEER_BUFF_ID = 'tavern_cheer';
export const TAVERN_CHEER_BUFF_STAT = 'attackSpeed' as const;
export const TAVERN_CHEER_BUFF_AMOUNT = 6;
export const TAVERN_CHEER_BUFF_DURATION_MS = 12 * 60 * 1000;
export const TAVERN_CHEER_BUFF_NAME = 'Застолье';

export interface CitizenTavernResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** Поставить круг: 9 адены, бафф «Застолье» (attackSpeed), без предмета. Повторно. */
export function tavernRound(save: PlayerSave): CitizenTavernResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < TAVERN_ROUND_COST) {
    return {
      save,
      ok: false,
      message: `Круг стоит ${TAVERN_ROUND_COST} адены. Без звона в кармане застолье не начнётся.`,
    };
  }

  let next: PlayerSave = { ...save, adena: currentAdena - TAVERN_ROUND_COST };
  next = applyNamedBuff(next, {
    buffId: TAVERN_CHEER_BUFF_ID,
    buffStat: TAVERN_CHEER_BUFF_STAT,
    buffName: TAVERN_CHEER_BUFF_NAME,
    amount: TAVERN_CHEER_BUFF_AMOUNT,
    durationMs: TAVERN_CHEER_BUFF_DURATION_MS,
  });
  next = applyStatsToSave(next);

  return {
    save: next,
    ok: true,
    message:
      'Завсегдатай кричит «за стол!» — кружки стукнулись. Получен бафф «Застолье» (+6 к скорости атаки на 12 мин).',
  };
}
