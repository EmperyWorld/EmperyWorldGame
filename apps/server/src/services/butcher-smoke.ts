/**
 * Haven butcher smoke loop (Мясник Бран):
 * raw_meat → smoked_brisket, plus a one-time raw-meat jerky order.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave, removeItemIdsFromSave } from './inventory-bag.js';
import { worldEvents } from './world-events.js';

export const RAW_MEAT_ITEM = 'raw_meat';
export const SMOKED_BRISKET_ITEM = 'smoked_brisket';

export const BUTCHER_JERKY_ACTIVE_FLAG = 'quest_butcher_jerky_active';
export const BUTCHER_JERKY_COMPLETE_FLAG = 'quest_butcher_jerky_complete';
export const BUTCHER_JERKY_NEEDED = 2;
export const BUTCHER_JERKY_REWARD_ADENA = 70;

export interface ButcherSmokeResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

export function countItemInBag(save: PlayerSave, itemId: string): number {
  return (save.inventory ?? []).filter((id) => id === itemId).length;
}

/** HUD: count raw_meat while quest_butcher_jerky_active. */
export function countRawMeat(save: PlayerSave): number {
  return countItemInBag(save, RAW_MEAT_ITEM);
}

export function butcherSmokeMeat(save: PlayerSave): ButcherSmokeResult {
  if (countRawMeat(save) < 1) {
    return {
      save,
      ok: false,
      message: 'Сырого мяса нет. Купи у прилавка или принеси с охоты — коптильня без туши молчит.',
    };
  }

  const withoutRaw = removeItemIdsFromSave(save, [RAW_MEAT_ITEM]);
  if (!withoutRaw) {
    return {
      save,
      ok: false,
      message: 'Сырого мяса нет. Купи у прилавка или принеси с охоты — коптильня без туши молчит.',
    };
  }

  const next = appendItemsToSave(withoutRaw, [SMOKED_BRISKET_ITEM]);
  return {
    save: next,
    ok: true,
    message: 'Дым взял своё: грудинка копчёная. Держи — лежит дольше жареного.',
  };
}

export function butcherOrderJerky(save: PlayerSave): ButcherSmokeResult {
  if (hasFlag(save, BUTCHER_JERKY_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Этот заказ уже закрыт. Стража сыта вяленым.',
    };
  }
  if (hasFlag(save, BUTCHER_JERKY_ACTIVE_FLAG)) {
    return {
      save,
      ok: true,
      message: `Заказ открыт: ${BUTCHER_JERKY_NEEDED} куска сырого мяса. Нож и крюки ждут.`,
    };
  }

  const next: PlayerSave = {
    ...save,
    questFlags: {
      ...save.questFlags,
      [BUTCHER_JERKY_ACTIVE_FLAG]: true,
    },
  };
  return {
    save: next,
    ok: true,
    message: 'Два куска сырого — на вяление для стражи. Принеси, рассчитаюсь. Сырое у прилавка или с охоты.',
  };
}

export function claimButcherJerky(save: PlayerSave): ButcherSmokeResult {
  if (hasFlag(save, BUTCHER_JERKY_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Расчёт уже был. Не обижай нож повторной просьбой.',
    };
  }
  if (!hasFlag(save, BUTCHER_JERKY_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала возьми заказ — иначе не пойму, чьё это мясо.',
    };
  }

  const raw = countRawMeat(save);
  if (raw < BUTCHER_JERKY_NEEDED) {
    return {
      save,
      ok: false,
      message: `Нужно ${BUTCHER_JERKY_NEEDED} сырого мяса. Сейчас у тебя: ${raw}.`,
    };
  }

  const toRemove = Array.from({ length: BUTCHER_JERKY_NEEDED }, () => RAW_MEAT_ITEM);
  const withoutRaw = removeItemIdsFromSave(save, toRemove);
  if (!withoutRaw) {
    return {
      save,
      ok: false,
      message: `Нужно ${BUTCHER_JERKY_NEEDED} сырого мяса. Сейчас у тебя: ${raw}.`,
    };
  }

  const nextFlags: Record<string, string | number | boolean> = {
    ...withoutRaw.questFlags,
    [BUTCHER_JERKY_COMPLETE_FLAG]: true,
  };
  delete nextFlags[BUTCHER_JERKY_ACTIVE_FLAG];

  const next: PlayerSave = {
    ...withoutRaw,
    adena: (withoutRaw.adena ?? 0) + BUTCHER_JERKY_REWARD_ADENA,
    questFlags: nextFlags,
  };

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: next.id,
    locationId: next.location,
    payload: { action: 'BUTCHER_JERKY_COMPLETE', rewardAdena: BUTCHER_JERKY_REWARD_ADENA },
    timestamp: Date.now(),
  });

  return {
    save: next,
    ok: true,
    message: `Два куска принял. Держи ${BUTCHER_JERKY_REWARD_ADENA} адены — вяленое уйдёт на пост.`,
  };
}
