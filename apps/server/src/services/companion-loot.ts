import {
  companionFetchIntervalMs,
  companionFetchTravelMs,
  companionPositionNearPlayer,
  companionFetchRadius,
  type CompanionFetchStartedPayload,
  type PlayerSave,
} from '@empery/shared';
import { normalizeCompanionState } from './companion.js';
import { findNearestEligibleLoot, pickupGroundLoot, type PickupDeps } from './ground-loot.js';

const lastFetchAt = new Map<string, number>();
const pendingFetches = new Map<string, PendingCompanionFetch>();
const reservedLoot = new Set<string>();

interface PendingCompanionFetch {
  saveId: string;
  lootId: string;
  locationId: string;
  arriveAt: number;
}

export function resetCompanionLootForTests(): void {
  lastFetchAt.clear();
  pendingFetches.clear();
  reservedLoot.clear();
}

export type CompanionLootTickResult =
  | { status: 'idle'; saveId: string }
  | ({ status: 'started' } & CompanionFetchStartedPayload)
  | {
      status: 'completed';
      saveId: string;
      lootId: string;
      locationId: string;
      summary?: string;
    };

function clearPending(saveId: string, lootId?: string): void {
  pendingFetches.delete(saveId);
  if (lootId) reservedLoot.delete(lootId);
}

/**
 * Server-side companion auto-fetch: start run to loot, pick up only on arrival.
 */
export function tickCompanionLoot(
  save: PlayerSave,
  presence: { locationId: string; x: number; y: number },
  deps: PickupDeps,
  now = Date.now(),
): CompanionLootTickResult {
  const companion = normalizeCompanionState(save.companion);
  if (!companion || save.hp <= 0 || presence.locationId !== save.location) {
    const pending = pendingFetches.get(save.id);
    if (pending) clearPending(save.id, pending.lootId);
    return { status: 'idle', saveId: save.id };
  }

  const pending = pendingFetches.get(save.id);
  if (pending) {
    if (pending.locationId !== presence.locationId) { clearPending(save.id, pending.lootId); return { status: 'idle', saveId: save.id }; }
    if (now < pending.arriveAt) return { status: 'idle', saveId: save.id };
    clearPending(save.id, pending.lootId);
    const result = pickupGroundLoot(save.id, pending.lootId, deps, {
      now,
      maxRange: companionFetchRadius(companion) + 48,
    });
    if (!result.ok) return { status: 'idle', saveId: save.id };
    return {
      status: 'completed',
      saveId: save.id,
      lootId: pending.lootId,
      locationId: pending.locationId,
      summary: result.summary,
    };
  }

  const interval = companionFetchIntervalMs(companion);
  const last = lastFetchAt.get(save.id);
  if (last != null && now - last < interval) return { status: 'idle', saveId: save.id };

  if (companion.kind === 'puppy' && (companion.hunger < 15 || companion.fatigue > 90)) {
    lastFetchAt.set(save.id, now);
    return { status: 'idle', saveId: save.id };
  }

  const radius = companionFetchRadius(companion);
  const pile = findNearestEligibleLoot(
    save.id,
    presence.locationId,
    presence.x,
    presence.y,
    radius,
    deps.partyIdForSave,
    now,
    reservedLoot,
    pile => !deps.canPickupAt || deps.canPickupAt(save.id, pile.x, pile.y),
  );
  if (!pile) return { status: 'idle', saveId: save.id };

  const from = companionPositionNearPlayer(companion, presence.x, presence.y);
  const travelMs = companionFetchTravelMs(companion, from.x, from.y, pile.x, pile.y);
  const arriveAt = now + travelMs;
  pendingFetches.set(save.id, {
    saveId: save.id,
    lootId: pile.id,
    locationId: presence.locationId,
    arriveAt,
  });
  reservedLoot.add(pile.id);
  lastFetchAt.set(save.id, now);

  return {
    status: 'started',
    saveId: save.id,
    lootId: pile.id,
    locationId: presence.locationId,
    lootX: pile.x,
    lootY: pile.y,
    fromX: from.x,
    fromY: from.y,
    arriveAt,
  };
}
