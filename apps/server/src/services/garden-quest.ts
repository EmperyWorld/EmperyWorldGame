/**
 * Community garden quest — vertical town slice (садовник Илья).
 * Accept → bring any water flask → water beds → reward.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave, removeItemIdsFromSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { worldEvents } from './world-events.js';

export const GARDEN_ACTIVE_FLAG = 'quest_garden_active';
export const GARDEN_COMPLETE_FLAG = 'quest_garden_complete';
export const GARDEN_REWARD_ADENA = 80;
export const GARDEN_REWARD_ITEM = 'bread_loaf';

/** Preferred order: cleaner water first. */
const WATER_ITEM_IDS = ['boiled_water', 'filtered_water', 'dirty_water'] as const;

export interface GardenActionResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

export function findGardenWaterItem(save: PlayerSave): string | null {
  const bag = save.inventory ?? [];
  for (const id of WATER_ITEM_IDS) {
    if (bag.includes(id)) return id;
  }
  return null;
}

export function acceptGardenQuest(save: PlayerSave): GardenActionResult {
  if (hasFlag(save, GARDEN_COMPLETE_FLAG)) {
    return { save, ok: false, message: 'Грядки уже политы — спасибо ещё раз.' };
  }
  if (hasFlag(save, GARDEN_ACTIVE_FLAG)) {
    return {
      save,
      ok: true,
      message: 'Воды всё ещё мало. Принеси флягу — кипячёную, фильтрованную или хотя бы мутную.',
    };
  }
  const next: PlayerSave = {
    ...save,
    questFlags: { ...save.questFlags, [GARDEN_ACTIVE_FLAG]: true },
  };
  return {
    save: next,
    ok: true,
    message:
      'Спасибо. Возьми любую воду из колодца или запасов и полей грядки — потом вернись ко мне.',
  };
}

export function waterGardenBeds(save: PlayerSave): GardenActionResult {
  if (hasFlag(save, GARDEN_COMPLETE_FLAG)) {
    return { save, ok: false, message: 'Сегодня грядки уже сытые. Завтра — снова работа.' };
  }
  if (!hasFlag(save, GARDEN_ACTIVE_FLAG)) {
    return { save, ok: false, message: 'Сначала договоримся — чем именно помочь.' };
  }

  const waterId = findGardenWaterItem(save);
  if (!waterId) {
    return {
      save,
      ok: false,
      message: 'Без воды грядки не оживить. Набери у колодца или купи флягу.',
    };
  }

  const removed = removeItemIdsFromSave(save, [waterId]);
  if (!removed) {
    return { save, ok: false, message: 'Не удалось достать воду из сумки.' };
  }

  let next = appendItemsToSave(removed, [GARDEN_REWARD_ITEM]);
  next = applyStatsToSave({
    ...next,
    adena: (next.adena ?? 0) + GARDEN_REWARD_ADENA,
    questFlags: {
      ...next.questFlags,
      [GARDEN_ACTIVE_FLAG]: false,
      [GARDEN_COMPLETE_FLAG]: true,
    },
  });

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: save.id,
    locationId: save.location,
    payload: { action: 'GARDEN_WATERED', waterId, rewardAdena: GARDEN_REWARD_ADENA },
    timestamp: Date.now(),
  });

  return {
    save: next,
    ok: true,
    message: `Грядки напились. Держи свежий хлеб и ${GARDEN_REWARD_ADENA} adena — община не забывает помощников.`,
  };
}
