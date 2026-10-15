/**
 * Haven garrison citizen (Городской стражник / haven_citizen_guard):
 * free militia drill (stamina) + one-time volunteer wall watch.
 * Distinct from Leon (town_guard) and Garret (town_captain).
 */
import type { PlayerSave } from '@empery/shared';
import { PLAYER_STAMINA_MAX, clampPlayerStamina } from '@empery/shared';
import { applyNamedBuff } from './ally-buffs.js';
import { applyStatsToSave } from './stats.js';

export const CITIZEN_GUARD_NPC_ID = 'haven_citizen_guard';

export const MILITIA_DRILL_STAMINA_COST = 70;
export const MILITIA_DRILL_BUFF_ID = 'militia_drill';
export const MILITIA_DRILL_BUFF_STAT = 'pDef' as const;
export const MILITIA_DRILL_BUFF_AMOUNT = 7;
export const MILITIA_DRILL_BUFF_DURATION_MS = 15 * 60 * 1000;
export const MILITIA_DRILL_BUFF_NAME = 'Ополчение';

export const MILITIA_WATCH_COMPLETE_FLAG = 'quest_militia_watch_complete';
export const MILITIA_WATCH_REWARD_ADENA = 40;

export interface CitizenMilitiaResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

function currentStamina(save: PlayerSave): number {
  return typeof save.stamina === 'number' ? save.stamina : PLAYER_STAMINA_MAX;
}

/** Бесплатная муштра: −70 выносливости, бафф «Ополчение» (pDef 7 / 15 мин). Повторяемая. */
export function militiaDrill(save: PlayerSave): CitizenMilitiaResult {
  const stamina = currentStamina(save);
  if (stamina < MILITIA_DRILL_STAMINA_COST) {
    return {
      save,
      ok: false,
      message: `Сил не хватает. На муштру ополчения нужно ${MILITIA_DRILL_STAMINA_COST} выносливости. Сейчас: ${stamina}.`,
    };
  }

  let next: PlayerSave = {
    ...save,
    stamina: clampPlayerStamina(stamina - MILITIA_DRILL_STAMINA_COST),
    staminaAt: new Date().toISOString(),
  };
  next = applyNamedBuff(next, {
    buffId: MILITIA_DRILL_BUFF_ID,
    buffStat: MILITIA_DRILL_BUFF_STAT,
    buffName: MILITIA_DRILL_BUFF_NAME,
    amount: MILITIA_DRILL_BUFF_AMOUNT,
    durationMs: MILITIA_DRILL_BUFF_DURATION_MS,
  });
  next = applyStatsToSave(next);

  return {
    save: next,
    ok: true,
    message:
      'Шаг, щит, стойка. Держи «Ополчение» — защита на 15 минут. Муштра бесплатная, но выносливость не врёт.',
  };
}

/** Разовое добровольческое дежурство на стене: +40 адены, флаг complete. Без выносливости. */
export function militiaWatch(save: PlayerSave): CitizenMilitiaResult {
  if (hasFlag(save, MILITIA_WATCH_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Смену на стене ты уже отстоял. Второй раз плата не положена.',
    };
  }

  const next: PlayerSave = {
    ...save,
    adena: (save.adena ?? 0) + MILITIA_WATCH_REWARD_ADENA,
    questFlags: {
      ...save.questFlags,
      [MILITIA_WATCH_COMPLETE_FLAG]: true,
    },
  };

  return {
    save: next,
    ok: true,
    message: `Доброволец на стене — редкость. Держи ${MILITIA_WATCH_REWARD_ADENA} адены. Гавань помнит.`,
  };
}
