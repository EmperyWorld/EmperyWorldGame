/**
 * Haven plaza citizen (haven_citizen_plaza): fountain coin buff and one-time charm.
 */
import type { PlayerSave } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';

export const PLAZA_NPC_ID = 'haven_citizen_plaza';

export const PLAZA_COIN_COST = 3;
export const PLAZA_CHARM_COST = 12;
export const PLAZA_CHARM_ITEM = 'plaza_charm';
export const PLAZA_CHARM_COMPLETE_FLAG = 'quest_plaza_charm_complete';

export const PLAZA_FOUNTAIN_BUFF_ID = 'plaza_fountain';
export const PLAZA_FOUNTAIN_BUFF_NAME = 'Монета в фонтан';
export const PLAZA_FOUNTAIN_BUFF_STAT = 'mDef' as const;
export const PLAZA_FOUNTAIN_BUFF_AMOUNT = 4;
export const PLAZA_FOUNTAIN_BUFF_DURATION_MS = 10 * 60 * 1000;

export interface CitizenPlazaResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

function payOrFail(
  save: PlayerSave,
  cost: number,
  lackMessage: string,
): { save: PlayerSave; ok: true } | { save: PlayerSave; ok: false; message: string } {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < cost) {
    return { save, ok: false, message: lackMessage };
  }
  return { save: { ...save, adena: currentAdena - cost }, ok: true };
}

/** Repeatable: 3 adena → «Монета в фонтан» (mDef +4, 10 min). */
export function tossPlazaCoin(save: PlayerSave): CitizenPlazaResult {
  const paid = payOrFail(
    save,
    PLAZA_COIN_COST,
    `Нужно ${PLAZA_COIN_COST} адены. Пустой карман фонтан не слышит.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const buffed = applyNamedBuff(paid.save, {
    buffId: PLAZA_FOUNTAIN_BUFF_ID,
    buffStat: PLAZA_FOUNTAIN_BUFF_STAT,
    buffName: PLAZA_FOUNTAIN_BUFF_NAME,
    amount: PLAZA_FOUNTAIN_BUFF_AMOUNT,
    durationMs: PLAZA_FOUNTAIN_BUFF_DURATION_MS,
  });
  const next = applyStatsToSave(buffed);

  return {
    save: next,
    ok: true,
    message:
      'Монета звякнула о камень чаши. Фонтан отвечает прохладой: «Монета в фонтан» (+4 маг. защиты на 10 мин).',
  };
}

/** One-time: 12 adena → plaza_charm + quest_plaza_charm_complete. */
export function buyPlazaCharm(save: PlayerSave): CitizenPlazaResult {
  if (hasFlag(save, PLAZA_CHARM_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Талисман уже у тебя. Второй раз площадь не продаёт тот же кружок.',
    };
  }

  const paid = payOrFail(
    save,
    PLAZA_CHARM_COST,
    `Талисман стоит ${PLAZA_CHARM_COST} адены. Без звона в кармане кружок не отдам.`,
  );
  if (!paid.ok) {
    return { save: paid.save, ok: false, message: paid.message };
  }

  const withItem = appendItemsToSave(paid.save, [PLAZA_CHARM_ITEM]);
  const next: PlayerSave = {
    ...withItem,
    questFlags: {
      ...withItem.questFlags,
      [PLAZA_CHARM_COMPLETE_FLAG]: true,
    },
  };

  return {
    save: next,
    ok: true,
    message: 'На шнурке — медный кружок с гербом площади. Держи талисман: пусть форум помнит тебя.',
  };
}
