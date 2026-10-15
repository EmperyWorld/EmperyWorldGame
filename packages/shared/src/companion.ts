/** Companion (puppy / seagull) constants and formulas — server-authoritative. */

export const COMPANION_KINDS = ['puppy', 'seagull'] as const;
export type CompanionKind = (typeof COMPANION_KINDS)[number];

/** Hidden growth scale. */
export const COMPANION_STAT_MAX = 1000;
/** Visible hunger / fatigue (puppy UI). */
export const COMPANION_NEED_MAX = 100;

/** Secret seagull tame: 1 in 1000. Never expose in UI. */
export const TAME_SEAGULL_DENOMINATOR = 1000;

export const GROUND_LOOT_OWNER_MS = 15_000;
export const GROUND_LOOT_TTL_MS = 300_000;
export const GROUND_LOOT_PICKUP_RADIUS = 80;

export const COMPANION_FETCH_BASE_RADIUS = 280;
export const COMPANION_FETCH_SKILL_RADIUS = 0.12;
export const COMPANION_SEAGULL_RADIUS_MULT = 1.4;
export const COMPANION_FETCH_BASE_INTERVAL_MS = 2200;
export const COMPANION_SEAGULL_INTERVAL_MULT = 0.72;
export const COMPANION_SEAGULL_OFFER_RADIUS = 160;
export const COMPANION_BREAD_ITEM_ID = 'bread_loaf';

export interface CompanionState {
  kind: CompanionKind;
  variantId: string;
  /** UI-visible (puppy only). */
  hunger: number;
  fatigue: number;
  /** Hidden growth. */
  obedience: number;
  energy: number;
  fetchSkill: number;
  tamedAt: string;
  /** ISO — last train action. */
  trainUntil?: string | null;
  /** ISO — last companion sim tick. */
  simAt?: string | null;
}

export interface GroundLootOwnerSolo {
  kind: 'solo';
  saveId: string;
}

export interface GroundLootOwnerParty {
  kind: 'party';
  partyId: string;
  leaderSaveId: string;
}

export type GroundLootOwner = GroundLootOwnerSolo | GroundLootOwnerParty;

export interface GroundLootDrop {
  kind: 'item' | 'adena';
  itemId?: string;
  count: number;
}

export interface GroundLootPile {
  id: string;
  locationId: string;
  x: number;
  y: number;
  drops: GroundLootDrop[];
  owner: GroundLootOwner;
  ownerUntil: number;
  expiresAt: number;
  spawnAt: number;
}

export interface GroundLootRemovedPayload {
  id: string;
  locationId: string;
  reason: 'picked' | 'expired';
  pickedBySaveId?: string;
  via?: 'player' | 'companion';
}

export interface CompanionFetchStartedPayload {
  saveId: string;
  lootId: string;
  locationId: string;
  lootX: number;
  lootY: number;
  fromX: number;
  fromY: number;
  arriveAt: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function clampCompanionStat(n: number): number {
  return clamp(Math.floor(n), 0, COMPANION_STAT_MAX);
}

export function clampCompanionNeed(n: number): number {
  return clamp(Math.floor(n), 0, COMPANION_NEED_MAX);
}

export function companionFetchRadius(companion: CompanionState): number {
  const base =
    COMPANION_FETCH_BASE_RADIUS + companion.fetchSkill * COMPANION_FETCH_SKILL_RADIUS;
  const obedienceBonus = companion.obedience * 0.04;
  const radius = base + obedienceBonus;
  return companion.kind === 'seagull' ? radius * COMPANION_SEAGULL_RADIUS_MULT : radius;
}

export function companionFetchIntervalMs(companion: CompanionState): number {
  const energyFactor = 1.35 - (companion.energy / COMPANION_STAT_MAX) * 0.55;
  const fatigueFactor = 1 + (companion.fatigue / COMPANION_NEED_MAX) * 0.5;
  let ms = COMPANION_FETCH_BASE_INTERVAL_MS * energyFactor * fatigueFactor;
  if (companion.kind === 'seagull') ms *= COMPANION_SEAGULL_INTERVAL_MULT;
  return Math.max(600, Math.floor(ms));
}

export function companionFollowSpeed(companion: CompanionState): number {
  const energy = companion.energy / COMPANION_STAT_MAX;
  const base = companion.kind === 'seagull' ? 210 : 145;
  return Math.floor(base * (0.75 + energy * 0.45));
}

/** Speed while running/flying to ground loot. */
export function companionFetchMoveSpeed(companion: CompanionState): number {
  const skill = companion.fetchSkill / COMPANION_STAT_MAX;
  const base = companion.kind === 'seagull' ? 360 : 270;
  return Math.floor(base * (0.9 + skill * 0.35));
}

/** Follow anchor offset from player position (matches client companion sprite). */
export function companionAnchorOffset(companion: CompanionState): { ox: number; oy: number } {
  return companion.kind === 'seagull' ? { ox: 28, oy: -42 } : { ox: 36, oy: 18 };
}

export function companionPositionNearPlayer(
  companion: CompanionState,
  playerX: number,
  playerY: number,
): { x: number; y: number } {
  const { ox, oy } = companionAnchorOffset(companion);
  return { x: playerX - ox, y: playerY + oy };
}

export function companionLootTarget(
  companion: CompanionState,
  lootX: number,
  lootY: number,
): { x: number; y: number } {
  return { x: lootX, y: companion.kind === 'seagull' ? lootY - 22 : lootY - 6 };
}

/** Travel time until companion reaches loot (ms), incl. brief pickup pause. */
export function companionFetchTravelMs(
  companion: CompanionState,
  fromX: number,
  fromY: number,
  lootX: number,
  lootY: number,
): number {
  const target = companionLootTarget(companion, lootX, lootY);
  const dist = Math.hypot(target.x - fromX, target.y - fromY);
  const speed = Math.max(1, companionFetchMoveSpeed(companion));
  const travelMs = (dist / speed) * 1000;
  return Math.max(250, Math.floor(travelMs + 180));
}
