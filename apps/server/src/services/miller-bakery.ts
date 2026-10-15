/**
 * Haven miller / bakery loop (Мельник Фаддей):
 * grain → flour → bread, plus a one-time flour order.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave, removeItemIdsFromSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { applyNamedBuff } from './ally-buffs.js';
import { worldEvents } from './world-events.js';

export const MILLER_GRAIN_ITEM = 'mill_grain';
export const MILLER_FLOUR_ITEM = 'mill_flour';
export const MILLER_BREAD_ITEM = 'bread_loaf';

export const MILLER_ORDER_ACTIVE_FLAG = 'quest_miller_order_active';
export const MILLER_ORDER_COMPLETE_FLAG = 'quest_miller_order_complete';
export const MILLER_ORDER_FLOUR_NEEDED = 3;
export const MILLER_ORDER_REWARD_ADENA = 90;

export const MILLER_FRESH_BUFF_ID = 'miller_fresh';
export const MILLER_FRESH_BUFF_NAME = 'Свежий каравай';
export const MILLER_FRESH_BUFF_AMOUNT = 6;
export const MILLER_FRESH_BUFF_DURATION_MS = 15 * 60 * 1000;

export interface MillerBakeryResult {
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

/** HUD: count mill_flour while quest_miller_order_active. */
export function countMillFlour(save: PlayerSave): number {
  return countItemInBag(save, MILLER_FLOUR_ITEM);
}

export function millerMillGrain(save: PlayerSave): MillerBakeryResult {
  if (countItemInBag(save, MILLER_GRAIN_ITEM) < 1) {
    return {
      save,
      ok: false,
      message: 'Нет зерна. Купи рожь в лавке или принеси с полей — жернова крутятся вхолостую.',
    };
  }

  const withoutGrain = removeItemIdsFromSave(save, [MILLER_GRAIN_ITEM]);
  if (!withoutGrain) {
    return {
      save,
      ok: false,
      message: 'Нет зерна. Купи рожь в лавке или принеси с полей — жернова крутятся вхолостую.',
    };
  }

  const next = appendItemsToSave(withoutGrain, [MILLER_FLOUR_ITEM]);
  return {
    save: next,
    ok: true,
    message: 'Жернова пропели: рожь стала мукой. Один мешок — держи.',
  };
}

export function millerBakeBread(save: PlayerSave): MillerBakeryResult {
  if (countItemInBag(save, MILLER_FLOUR_ITEM) < 1) {
    return {
      save,
      ok: false,
      message: 'Муки нет — из воздуха каравай не слепить. Сначала помол.',
    };
  }

  const withoutFlour = removeItemIdsFromSave(save, [MILLER_FLOUR_ITEM]);
  if (!withoutFlour) {
    return {
      save,
      ok: false,
      message: 'Муки нет — из воздуха каравай не слепить. Сначала помол.',
    };
  }

  let next = appendItemsToSave(withoutFlour, [MILLER_BREAD_ITEM]);
  next = applyNamedBuff(next, {
    buffId: MILLER_FRESH_BUFF_ID,
    buffStat: 'mpRegen',
    buffName: MILLER_FRESH_BUFF_NAME,
    amount: MILLER_FRESH_BUFF_AMOUNT,
    durationMs: MILLER_FRESH_BUFF_DURATION_MS,
  });
  next = applyStatsToSave(next);

  return {
    save: next,
    ok: true,
    message:
      'Из печи — тёплый каравай. Держи, да ещё «Свежий каравай» на плечи (реген маны на 15 мин).',
  };
}

export function acceptMillerOrder(save: PlayerSave): MillerBakeryResult {
  if (hasFlag(save, MILLER_ORDER_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Этот заказ уже закрыт. Хлеб идёт в город без перебоев.',
    };
  }
  if (hasFlag(save, MILLER_ORDER_ACTIVE_FLAG)) {
    return {
      save,
      ok: true,
      message: `Заказ открыт: ${MILLER_ORDER_FLOUR_NEEDED} мешка муки. Жернова ждут.`,
    };
  }

  const next: PlayerSave = {
    ...save,
    questFlags: {
      ...save.questFlags,
      [MILLER_ORDER_ACTIVE_FLAG]: true,
    },
  };
  return {
    save: next,
    ok: true,
    message:
      'Три мешка муки — для пекарен у площади. Смолоть можно здесь, зерно в лавке дешёвое.',
  };
}

export function claimMillerOrder(save: PlayerSave): MillerBakeryResult {
  if (hasFlag(save, MILLER_ORDER_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Расчёт уже был. Не обижай жернова повторной просьбой.',
    };
  }
  if (!hasFlag(save, MILLER_ORDER_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала возьми заказ — иначе не пойму, чья это мука.',
    };
  }

  const flour = countMillFlour(save);
  if (flour < MILLER_ORDER_FLOUR_NEEDED) {
    return {
      save,
      ok: false,
      message: `Нужно ${MILLER_ORDER_FLOUR_NEEDED} мешка муки. Сейчас у тебя: ${flour}.`,
    };
  }

  const toRemove = Array.from({ length: MILLER_ORDER_FLOUR_NEEDED }, () => MILLER_FLOUR_ITEM);
  const withoutFlour = removeItemIdsFromSave(save, toRemove);
  if (!withoutFlour) {
    return {
      save,
      ok: false,
      message: `Нужно ${MILLER_ORDER_FLOUR_NEEDED} мешка муки. Сейчас у тебя: ${flour}.`,
    };
  }

  const nextFlags: Record<string, string | number | boolean> = {
    ...withoutFlour.questFlags,
    [MILLER_ORDER_COMPLETE_FLAG]: true,
  };
  delete nextFlags[MILLER_ORDER_ACTIVE_FLAG];

  const next: PlayerSave = {
    ...withoutFlour,
    adena: (withoutFlour.adena ?? 0) + MILLER_ORDER_REWARD_ADENA,
    questFlags: nextFlags,
  };

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: next.id,
    locationId: next.location,
    payload: { action: 'MILLER_ORDER_COMPLETE', rewardAdena: MILLER_ORDER_REWARD_ADENA },
    timestamp: Date.now(),
  });

  return {
    save: next,
    ok: true,
    message: `Три мешка принял. Держи ${MILLER_ORDER_REWARD_ADENA} адены — честный помол стоит денег.`,
  };
}
