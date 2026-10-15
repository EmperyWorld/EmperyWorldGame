/**
 * Second-cycle harvest at town_gardener (Садовник Илья).
 * Unlocks only after the original garden watering quest is complete.
 */
import type { PlayerSave } from '@empery/shared';
import { GARDEN_COMPLETE_FLAG } from './garden-quest.js';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const GARDEN_HARVEST_ACTIVE_FLAG = 'quest_garden_harvest_active';
export const GARDEN_HARVEST_COMPLETE_FLAG = 'quest_garden_harvest_complete';
export const GARDEN_HARVEST_ITEM = 'garden_cabbage';
export const GARDEN_HARVEST_ITEM_COUNT = 2;
export const GARDEN_HARVEST_REWARD_ADENA = 50;

/** HUD line for the integrator (`quest-hud.ts` — not wired here). */
export const GARDEN_HARVEST_HUD = 'Квест: забери урожай у садовника Ильи [E]';

export interface GardenHarvestResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

/** Take the one-time harvest job after the watering quest is done. */
export function acceptHarvest(save: PlayerSave): GardenHarvestResult {
  if (hasFlag(save, GARDEN_HARVEST_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Урожай уже у тебя — капуста в сумке, и земля отдыхает.',
    };
  }
  if (!hasFlag(save, GARDEN_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала польём грядки — урожай ещё не встал.',
    };
  }
  if (hasFlag(save, GARDEN_HARVEST_ACTIVE_FLAG)) {
    return {
      save,
      ok: true,
      message: 'Кочаны уже срезаны. Забери урожай — не стой с пустыми руками.',
    };
  }

  const next: PlayerSave = {
    ...save,
    questFlags: {
      ...save.questFlags,
      [GARDEN_HARVEST_ACTIVE_FLAG]: true,
    },
  };
  return {
    save: next,
    ok: true,
    message: 'Грядки отдали кочаны. Подойди ещё раз — отдам капусту и долю за работу.',
  };
}

/** Claim 2× garden_cabbage + 50 adena. One-time. */
export function claimHarvest(save: PlayerSave): GardenHarvestResult {
  if (hasFlag(save, GARDEN_HARVEST_COMPLETE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Кочаны уже твои. Грядки отдыхают.',
    };
  }
  if (!hasFlag(save, GARDEN_HARVEST_ACTIVE_FLAG)) {
    return {
      save,
      ok: false,
      message: 'Сначала договоримся про урожай — иначе не пойму, чья это капуста.',
    };
  }

  const cabbage = Array.from({ length: GARDEN_HARVEST_ITEM_COUNT }, () => GARDEN_HARVEST_ITEM);
  const withCabbage = appendItemsToSave(save, cabbage);
  const nextFlags: Record<string, string | number | boolean> = {
    ...withCabbage.questFlags,
    [GARDEN_HARVEST_COMPLETE_FLAG]: true,
  };
  delete nextFlags[GARDEN_HARVEST_ACTIVE_FLAG];

  const next = applyStatsToSave({
    ...withCabbage,
    adena: (withCabbage.adena ?? 0) + GARDEN_HARVEST_REWARD_ADENA,
    questFlags: nextFlags,
  });

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: next.id,
    locationId: next.location,
    payload: {
      action: 'GARDEN_HARVEST_CLAIMED',
      rewardAdena: GARDEN_HARVEST_REWARD_ADENA,
      itemId: GARDEN_HARVEST_ITEM,
      itemCount: GARDEN_HARVEST_ITEM_COUNT,
    },
    timestamp: Date.now(),
  });

  return {
    save: next,
    ok: true,
    message: `Два кочана и ${GARDEN_HARVEST_REWARD_ADENA} adena. Община сыта — и ты не в накладе.`,
  };
}
