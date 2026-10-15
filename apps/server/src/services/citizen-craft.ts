/**
 * Haven craft-quarter apprentice (haven_citizen_craft):
 * repeatable scrap sale + one-time bellows shift.
 */
import type { PlayerSave } from '@empery/shared';
import { PLAYER_STAMINA_MAX, clampPlayerStamina } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';

export const CRAFT_NPC_ID = 'haven_citizen_craft';
export const CRAFT_SCRAP_ITEM = 'craft_scrap';
export const CRAFT_SCRAP_COST = 4;

export const CRAFT_BELLOWS_STAMINA_COST = 40;
export const CRAFT_BELLOWS_REWARD_ADENA = 35;
export const CRAFT_BELLOWS_COMPLETE_FLAG = 'quest_craft_bellows_complete';

export interface CitizenCraftResult {
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

export function countCraftScrap(save: PlayerSave): number {
  return (save.inventory ?? []).filter((id) => id === CRAFT_SCRAP_ITEM).length;
}

/** Обрезки с горна: 4 адены → `craft_scrap`. Повторно. */
export function buyCraftScrap(save: PlayerSave): CitizenCraftResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < CRAFT_SCRAP_COST) {
    return {
      save,
      ok: false,
      message: `Обрезки стоят ${CRAFT_SCRAP_COST} адены. Без монет кузница не делится железом.`,
    };
  }

  const paid: PlayerSave = {
    ...save,
    adena: currentAdena - CRAFT_SCRAP_COST,
  };
  const next = appendItemsToSave(paid, [CRAFT_SCRAP_ITEM]);
  return {
    save: next,
    ok: true,
    message: 'Держи обрезки с горна. На переплавку сгодятся — не раз, так два.',
  };
}

/** Разовая смена у мехов: −40 выносливости, +35 адены, флаг complete. */
export function pumpCraftBellows(save: PlayerSave): CitizenCraftResult {
  if (hasFlag(save, CRAFT_BELLOWS_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Мехи сегодня уже дышат. Гарольд больше не зовёт — работа сделана.',
    };
  }

  const stamina = currentStamina(save);
  if (stamina < CRAFT_BELLOWS_STAMINA_COST) {
    return {
      save,
      ok: false,
      message: `Мехи качать надо силой. Нужно хотя бы ${CRAFT_BELLOWS_STAMINA_COST} выносливости — иначе мехи не сдвинешь.`,
    };
  }

  const next: PlayerSave = {
    ...save,
    adena: (save.adena ?? 0) + CRAFT_BELLOWS_REWARD_ADENA,
    stamina: clampPlayerStamina(stamina - CRAFT_BELLOWS_STAMINA_COST),
    staminaAt: new Date().toISOString(),
    questFlags: {
      ...save.questFlags,
      [CRAFT_BELLOWS_COMPLETE_FLAG]: true,
    },
  };

  return {
    save: next,
    ok: true,
    message: `Мехи вздохнули, горн вспыхнул. Держи ${CRAFT_BELLOWS_REWARD_ADENA} адены за честный труд.`,
  };
}
