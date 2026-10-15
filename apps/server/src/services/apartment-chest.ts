/**
 * Haven apartment chest (Большой сундук / apartment_chest):
 * pack a travel kit from materials storage. Requires owned housing.
 * open_storage stays client/YAML.
 */
import type { PlayerSave } from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';
import { worldEvents } from './world-events.js';

export const APT_CHEST_NPC_ID = 'apartment_chest';
export const APT_KIT_CHOICE_ID = 'apt_kit';
export const APT_KIT_COST = 15;
export const APT_TRAVEL_KIT_ITEM = 'apt_travel_kit';

export const APT_KIT_NO_HOUSING = 'Сначала ключ от квартиры';

export interface ApartmentChestResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

/** Tenant travel kit: 15 adena → apt_travel_kit. Repeatable, not daily. */
export function assembleAptKit(save: PlayerSave, now = Date.now()): ApartmentChestResult {
  if (!save.housing) {
    return { save, ok: false, message: APT_KIT_NO_HOUSING };
  }

  const currentAdena = save.adena ?? 0;
  if (currentAdena < APT_KIT_COST) {
    return {
      save,
      ok: false,
      message: `Дорожный набор стоит ${APT_KIT_COST} адены. У тебя: ${currentAdena}.`,
    };
  }

  const paid: PlayerSave = {
    ...save,
    adena: currentAdena - APT_KIT_COST,
  };
  const next = appendItemsToSave(paid, [APT_TRAVEL_KIT_ITEM], now);

  void worldEvents.publish({
    type: 'PLAYER_ACTION',
    action: 'DIALOGUE',
    playerId: next.id,
    locationId: next.location,
    payload: { action: 'APT_TRAVEL_KIT', cost: APT_KIT_COST },
    timestamp: now,
  });

  return {
    save: next,
    ok: true,
    message: `Из сундука — дорожный набор: нитки, бинт, сухарь. (−${APT_KIT_COST} адены)`,
  };
}
