/**
 * Haven harbor citizen (Моряк Гавани / haven_citizen_harbor):
 * paid sailor knot charm + stamina haul for adena. Repeatable, no quest flags.
 */
import type { PlayerSave } from '@empery/shared';
import { PLAYER_STAMINA_MAX, clampPlayerStamina } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';
import { applyNamedBuff } from './ally-buffs.js';
import { applyStatsToSave } from './stats.js';

export const HARBOR_NPC_ID = 'haven_citizen_harbor';
export const HARBOR_CHARM_ITEM = 'harbor_charm';

export const HARBOR_KNOT_COST = 6;
export const HARBOR_KNOT_BUFF_ID = 'harbor_knot';
export const HARBOR_KNOT_BUFF_STAT = 'speed' as const;
export const HARBOR_KNOT_BUFF_AMOUNT = 8;
export const HARBOR_KNOT_BUFF_DURATION_MS = 12 * 60 * 1000;
export const HARBOR_KNOT_BUFF_NAME = 'Узел моряка';

export const HARBOR_HAUL_STAMINA_COST = 60;
export const HARBOR_HAUL_REWARD_ADENA = 55;

export interface CitizenHarborResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function currentStamina(save: PlayerSave): number {
  return typeof save.stamina === 'number' ? save.stamina : PLAYER_STAMINA_MAX;
}

/** Узел моряка: 6 адены → harbor_charm + бафф speed. Повторно. */
export function harborKnot(save: PlayerSave): CitizenHarborResult {
  const currentAdena = save.adena ?? 0;
  if (currentAdena < HARBOR_KNOT_COST) {
    return {
      save,
      ok: false,
      message: `Узел стоит ${HARBOR_KNOT_COST} адены. Без монет парус не вяжется.`,
    };
  }

  let next: PlayerSave = {
    ...save,
    adena: currentAdena - HARBOR_KNOT_COST,
  };
  next = appendItemsToSave(next, [HARBOR_CHARM_ITEM]);
  next = applyNamedBuff(next, {
    buffId: HARBOR_KNOT_BUFF_ID,
    buffStat: HARBOR_KNOT_BUFF_STAT,
    buffName: HARBOR_KNOT_BUFF_NAME,
    amount: HARBOR_KNOT_BUFF_AMOUNT,
    durationMs: HARBOR_KNOT_BUFF_DURATION_MS,
  });
  next = applyStatsToSave(next);

  return {
    save: next,
    ok: true,
    message:
      'Держи оберег — узел моряка на удачу. Ноги стали легче: «Узел моряка» на 12 мин.',
  };
}

/** Перетаскивание снастей: −60 выносливости, +55 адены. Повторно, без флага. */
export function harborHaul(save: PlayerSave): CitizenHarborResult {
  const stamina = currentStamina(save);
  if (stamina < HARBOR_HAUL_STAMINA_COST) {
    return {
      save,
      ok: false,
      message: `Снасти тяжёлые: нужно не меньше ${HARBOR_HAUL_STAMINA_COST} выносливости.`,
    };
  }

  const next = applyStatsToSave({
    ...save,
    adena: (save.adena ?? 0) + HARBOR_HAUL_REWARD_ADENA,
    stamina: clampPlayerStamina(stamina - HARBOR_HAUL_STAMINA_COST),
    staminaAt: new Date().toISOString(),
  });

  return {
    save: next,
    ok: true,
    message: `Канаты на место, снасти в трюм. Держи ${HARBOR_HAUL_REWARD_ADENA} адены.`,
  };
}
