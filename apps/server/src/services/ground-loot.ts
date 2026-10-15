import { randomUUID } from 'node:crypto';
import {
  GROUND_LOOT_OWNER_MS,
  GROUND_LOOT_PICKUP_RADIUS,
  GROUND_LOOT_TTL_MS,
  type GroundLootDrop,
  type GroundLootOwner,
  type GroundLootPile,
  type PlayerSave,
} from '@empery/shared';
import { appendItemsToSave } from './inventory-bag.js';
import { applyStatsToSave } from './stats.js';
import { canPickupDuringOwnerLock } from './loot-owner.js';
import type { DropRoll } from './drops.js';
import { PARTY_XP_RANGE } from './party.js';

export type { GroundLootPile, GroundLootOwner, GroundLootDrop };

const piles = new Map<string, GroundLootPile>();
const byLocation = new Map<string, Set<string>>();

export function resetGroundLootForTests(): void {
  piles.clear();
  byLocation.clear();
}

function indexPile(pile: GroundLootPile): void {
  piles.set(pile.id, pile);
  let set = byLocation.get(pile.locationId);
  if (!set) {
    set = new Set();
    byLocation.set(pile.locationId, set);
  }
  set.add(pile.id);
}

function unindexPile(pile: GroundLootPile): void {
  piles.delete(pile.id);
  const set = byLocation.get(pile.locationId);
  if (!set) return;
  set.delete(pile.id);
  if (set.size === 0) byLocation.delete(pile.locationId);
}

export function dropsFromRolls(rolls: DropRoll[]): GroundLootDrop[] {
  return rolls.map((r) =>
    r.kind === 'adena'
      ? { kind: 'adena' as const, count: r.count }
      : { kind: 'item' as const, itemId: r.itemId, count: r.count },
  );
}

export function spawnGroundLoot(input: {
  locationId: string;
  x: number;
  y: number;
  drops: DropRoll[];
  owner: GroundLootOwner;
  now?: number;
}): GroundLootPile | null {
  const drops = dropsFromRolls(input.drops).filter((d) => d.count > 0);
  if (drops.length === 0) return null;
  const now = input.now ?? Date.now();
  const pile: GroundLootPile = {
    id: randomUUID(),
    locationId: input.locationId,
    x: input.x,
    y: input.y,
    drops,
    owner: input.owner,
    ownerUntil: now + GROUND_LOOT_OWNER_MS,
    expiresAt: now + GROUND_LOOT_TTL_MS,
    spawnAt: now,
  };
  indexPile(pile);
  return pile;
}

export function getGroundLoot(id: string): GroundLootPile | undefined {
  return piles.get(id);
}

export function listGroundLoot(locationId: string, now = Date.now()): GroundLootPile[] {
  expireStale(locationId, now);
  const set = byLocation.get(locationId);
  if (!set) return [];
  const out: GroundLootPile[] = [];
  for (const id of set) {
    const pile = piles.get(id);
    if (pile) out.push(pile);
  }
  return out;
}

/** Remove expired piles; returns removed ids. */
export function expireStale(locationId?: string, now = Date.now()): GroundLootPile[] {
  const removed: GroundLootPile[] = [];
  const ids =
    locationId != null
      ? [...(byLocation.get(locationId) ?? [])]
      : [...piles.keys()];
  for (const id of ids) {
    const pile = piles.get(id);
    if (!pile) continue;
    if (pile.expiresAt <= now) {
      unindexPile(pile);
      removed.push(pile);
    }
  }
  return removed;
}

export interface PresencePos {
  saveId: string;
  locationId: string;
  x: number;
  y: number;
}

export interface PickupDeps {
  partyIdForSave(saveId: string): string | null;
  partyMemberSaveIds(partyId: string): string[];
  presenceForSave(saveId: string): PresencePos | null;
  loadSave(saveId: string): PlayerSave | null;
  savePlayer(save: PlayerSave): PlayerSave;
  /** Authoritative geometry check, also applied to companion fetches. */
  canPickupAt?(saveId: string, x: number, y: number): boolean;
  /** Optional RNG for item assignment (tests). */
  random?: () => number;
}

export interface PickupGrant {
  saveId: string;
  adena: number;
  itemIds: string[];
}

export interface PickupResult {
  ok: boolean;
  error?: string;
  pile?: GroundLootPile;
  /** Grants applied (picker + party). */
  grants?: PickupGrant[];
  summary?: string;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function formatSummary(grants: PickupGrant[]): string {
  const parts: string[] = [];
  let adena = 0;
  const items: string[] = [];
  for (const g of grants) {
    adena += g.adena;
    items.push(...g.itemIds);
  }
  if (adena > 0) parts.push(`${adena} adena`);
  if (items.length) parts.push(items.join(', '));
  return parts.join(', ') || 'пусто';
}

/**
 * Atomic pickup: remove pile first, then grant.
 * Party: adena split evenly; each item stack → random eligible member.
 */
export function pickupGroundLoot(
  pickerSaveId: string,
  lootId: string,
  deps: PickupDeps,
  opts?: { now?: number; maxRange?: number; skipRangeCheck?: boolean },
): PickupResult {
  const now = opts?.now ?? Date.now();
  const pile = piles.get(lootId);
  if (!pile) return { ok: false, error: 'Лут уже подобрали или исчез' };
  if (pile.expiresAt <= now) {
    unindexPile(pile);
    return { ok: false, error: 'Лут исчез' };
  }

  const presence = deps.presenceForSave(pickerSaveId);
  if (!presence || presence.locationId !== pile.locationId) {
    return { ok: false, error: 'Слишком далеко' };
  }
  const picker = deps.loadSave(pickerSaveId);
  if (!picker || picker.hp <= 0) return { ok: false, error: 'Нельзя подобрать добычу в этом состоянии' };
  if (deps.canPickupAt && !deps.canPickupAt(pickerSaveId, pile.x, pile.y)) return { ok: false, error: 'Добыча за препятствием' };
  const range = opts?.maxRange ?? GROUND_LOOT_PICKUP_RADIUS;
  if (!opts?.skipRangeCheck && dist(presence.x, presence.y, pile.x, pile.y) > range) {
    return { ok: false, error: 'Подойди ближе' };
  }

  if (now < pile.ownerUntil) {
    if (!canPickupDuringOwnerLock(pile.owner, pickerSaveId, deps.partyIdForSave)) {
      return { ok: false, error: 'Чужая добыча' };
    }
  }

  // Claim pile atomically
  unindexPile(pile);

  const partyId = deps.partyIdForSave(pickerSaveId);
  let eligibleIds = [pickerSaveId];
  if (partyId) {
    const members = deps.partyMemberSaveIds(partyId);
    eligibleIds = [];
    for (const id of members) {
      const p = deps.presenceForSave(id);
      if (!p || p.locationId !== pile.locationId) continue;
      if (dist(p.x, p.y, presence.x, presence.y) > PARTY_XP_RANGE) continue;
      eligibleIds.push(id);
    }
    if (!eligibleIds.includes(pickerSaveId)) eligibleIds.unshift(pickerSaveId);
  }

  const rand = deps.random ?? Math.random;
  const grantMap = new Map<string, PickupGrant>();
  const ensure = (id: string) => {
    let g = grantMap.get(id);
    if (!g) {
      g = { saveId: id, adena: 0, itemIds: [] };
      grantMap.set(id, g);
    }
    return g;
  };

  let totalAdena = 0;
  const itemStacks: Array<{ itemId: string; count: number }> = [];
  for (const drop of pile.drops) {
    if (drop.kind === 'adena') totalAdena += drop.count;
    else if (drop.itemId) itemStacks.push({ itemId: drop.itemId, count: drop.count });
  }

  const n = Math.max(1, eligibleIds.length);
  if (totalAdena > 0) {
    const share = Math.floor(totalAdena / n);
    let remainder = totalAdena - share * n;
    for (const id of eligibleIds) {
      const g = ensure(id);
      g.adena += share;
      if (id === pickerSaveId && remainder > 0) {
        g.adena += remainder;
        remainder = 0;
      }
    }
    if (remainder > 0) ensure(pickerSaveId).adena += remainder;
  }

  for (const stack of itemStacks) {
    for (let i = 0; i < stack.count; i += 1) {
      const pick = eligibleIds[Math.floor(rand() * eligibleIds.length)] ?? pickerSaveId;
      ensure(pick).itemIds.push(stack.itemId);
    }
  }

  const grants = [...grantMap.values()].filter((g) => g.adena > 0 || g.itemIds.length > 0);
  for (const grant of grants) {
    let save = deps.loadSave(grant.saveId);
    if (!save) continue;
    if (grant.adena > 0) {
      save = { ...save, adena: (save.adena ?? 0) + grant.adena };
    }
    if (grant.itemIds.length) {
      save = appendItemsToSave(save, grant.itemIds, now);
    }
    deps.savePlayer(applyStatsToSave(save));
  }

  return {
    ok: true,
    pile,
    grants,
    summary: formatSummary(grants),
  };
}

/** Nearest pile the companion/player may loot within radius. */
export function findNearestEligibleLoot(
  pickerSaveId: string,
  locationId: string,
  x: number,
  y: number,
  radius: number,
  partyIdForSave: (saveId: string) => string | null,
  now = Date.now(),
  excludeLootIds?: ReadonlySet<string>,
  canReach?: (pile: GroundLootPile) => boolean,
): GroundLootPile | null {
  expireStale(locationId, now);
  let best: GroundLootPile | null = null;
  let bestDist = radius;
  for (const pile of listGroundLoot(locationId, now)) {
    if (excludeLootIds?.has(pile.id)) continue;
    const d = dist(x, y, pile.x, pile.y);
    if (d > bestDist || (canReach && !canReach(pile))) continue;
    if (now < pile.ownerUntil && !canPickupDuringOwnerLock(pile.owner, pickerSaveId, partyIdForSave)) {
      continue;
    }
    best = pile;
    bestDist = d;
  }
  return best;
}
