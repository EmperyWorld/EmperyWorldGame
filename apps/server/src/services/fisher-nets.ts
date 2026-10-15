/**
 * Haven fisher extras (Рыбак Ульф / town_fisher):
 * repeatable bait sale + one-shot net mending.
 * Fish delivery stays in haven-services.ts.
 */
import type { PlayerSave } from '@empery/shared';
import { PLAYER_STAMINA_MAX, clampPlayerStamina } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';

export const TOWN_FISHER_NPC_ID = 'town_fisher';

export const ULF_BAIT_ITEM = 'ulf_bait';
export const FISHER_BAIT_COST = 6;

export const ULF_NETS_COMPLETE_FLAG = 'quest_ulf_nets_complete';
export const FISHER_NETS_STAMINA_COST = 40;
export const FISHER_NETS_REWARD_ADENA = 45;

export interface FisherNetsResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

function currentAdena(save: PlayerSave): number {
  return save.adena ?? 0;
}

function currentStamina(save: PlayerSave): number {
  return typeof save.stamina === 'number' ? save.stamina : PLAYER_STAMINA_MAX;
}

/** Купить `ulf_bait` за 6 адены. Повторяемо. */
export function fisherBuyBait(save: PlayerSave): FisherNetsResult {
  const adena = currentAdena(save);
  if (adena < FISHER_BAIT_COST) {
    return {
      save,
      ok: false,
      message: `Наживка стоит ${FISHER_BAIT_COST} адены. У тебя: ${adena}.`,
    };
  }

  const next = appendItemsToSave({ ...save, adena: adena - FISHER_BAIT_COST }, [ULF_BAIT_ITEM]);
  return {
    save: next,
    ok: true,
    message: `Держи наживку — червь с причала. Списано ${FISHER_BAIT_COST} адены.`,
  };
}

/**
 * Разовая починка сетей: stamina ≥ 40, −40 (clamp), +45 адены, `quest_ulf_nets_complete`.
 * Без active-флага — один шаг.
 */
export function fisherMendNets(save: PlayerSave): FisherNetsResult {
  if (hasFlag(save, ULF_NETS_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сети уже целые. Второй раз платить не буду.',
    };
  }

  const stamina = currentStamina(save);
  if (stamina < FISHER_NETS_STAMINA_COST) {
    return {
      save,
      ok: false,
      message: `Сети тяжёлые: нужно ${FISHER_NETS_STAMINA_COST} выносливости. Сейчас: ${stamina}.`,
    };
  }

  const next: PlayerSave = {
    ...save,
    stamina: clampPlayerStamina(stamina - FISHER_NETS_STAMINA_COST),
    staminaAt: new Date().toISOString(),
    adena: currentAdena(save) + FISHER_NETS_REWARD_ADENA,
    questFlags: {
      ...save.questFlags,
      [ULF_NETS_COMPLETE_FLAG]: true,
    },
  };

  return {
    save: next,
    ok: true,
    message: `Сети зашили. Держи ${FISHER_NETS_REWARD_ADENA} адены — честный труд у причала.`,
  };
}
