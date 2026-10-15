/**
 * Haven market citizen (Торговец Гавани): пирог за адену и разовая смена у прилавка.
 */
import type { PlayerSave } from '@empery/shared';
import { PLAYER_STAMINA_MAX, clampPlayerStamina } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';

export const MARKET_CITIZEN_NPC_ID = 'haven_citizen_market';
export const MARKET_PIE_ITEM = 'market_pie';
export const MARKET_PIE_COST = 8;
export const MARKET_SHIFT_STAMINA_COST = 50;
export const MARKET_SHIFT_REWARD_ADENA = 40;
export const MARKET_SHIFT_COMPLETE_FLAG = 'quest_market_shift_complete';

export interface CitizenMarketResult {
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

/** Повторяемая покупка: 8 адены → `market_pie`. */
export function buyMarketPie(save: PlayerSave): CitizenMarketResult {
  const adena = save.adena ?? 0;
  if (adena < MARKET_PIE_COST) {
    return {
      save,
      ok: false,
      message: `Пирог стоит ${MARKET_PIE_COST} адены. Без монет — без куска.`,
    };
  }

  const paid: PlayerSave = {
    ...save,
    adena: adena - MARKET_PIE_COST,
  };
  const next = appendItemsToSave(paid, [MARKET_PIE_ITEM]);
  return {
    save: next,
    ok: true,
    message: `Держи пирог — ещё тёплый, с луком и мясом. ${MARKET_PIE_COST} адены, честная цена.`,
  };
}

/** Разовая помощь у прилавка: stamina ≥50, −50 stamina, +40 адены, флаг complete. */
export function helpMarketShift(save: PlayerSave): CitizenMarketResult {
  if (hasFlag(save, MARKET_SHIFT_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Смену у прилавка ты уже отстоял. Ряд в порядке — бери пирог, если голоден.',
    };
  }

  const stamina = currentStamina(save);
  if (stamina < MARKET_SHIFT_STAMINA_COST) {
    return {
      save,
      ok: false,
      message: `Без сил прилавок не удержать. Отдышись и вернись, когда выносливость будет не ниже ${MARKET_SHIFT_STAMINA_COST}.`,
    };
  }

  const next: PlayerSave = {
    ...save,
    stamina: clampPlayerStamina(stamina - MARKET_SHIFT_STAMINA_COST),
    staminaAt: new Date().toISOString(),
    adena: (save.adena ?? 0) + MARKET_SHIFT_REWARD_ADENA,
    questFlags: {
      ...save.questFlags,
      [MARKET_SHIFT_COMPLETE_FLAG]: true,
    },
  };

  return {
    save: next,
    ok: true,
    message: `Спасибо за руки у прилавка. Держи ${MARKET_SHIFT_REWARD_ADENA} адены — ряд не завалился.`,
  };
}
