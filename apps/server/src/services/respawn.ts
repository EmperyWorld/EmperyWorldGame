import {
  DEATH_XP_PENALTY_BY_KIND,
  DOOM_ADENA_PENALTY_RATIO,
  inferDeathKind,
  SURVIVAL_DOOM_CAUSE_PREFIX,
  type DeathKind,
  type PlayerSave,
} from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { dismount } from './mounts.js';
import { RESPAWN_TOWN_ID, getLocation } from './locations.js';
import { removeInventoryIndexFromSave } from './inventory-bag.js';
import { shouldApplyDoom, stabilizeSurvivalAfterRevive } from './survival.js';

export const DEATH_XP_PENALTY_RATIO = DEATH_XP_PENALTY_BY_KIND.combat;
export const DOOM_XP_PENALTY_RATIO = DEATH_XP_PENALTY_BY_KIND.doom;
export const RESURRECTION_SCROLL_ID = 'resurrection_scroll';
/** Радиус воскрешения союзника свитком (px). */
export const RESURRECT_REACH = 72;

/** Штраф: 25% накопленного опыта текущего уровня (уровень не падает). */
export function applyDeathXpPenalty(save: PlayerSave): { save: PlayerSave; xpLost: number } {
  const ratio = DEATH_XP_PENALTY_BY_KIND[inferDeathKind(save.lastDeathCause, save.lastDeathKind)];
  const xpLost = Math.floor(Math.max(0, save.xp) * ratio);
  if (xpLost <= 0) return { save, xpLost: 0 };
  return { save: { ...save, xp: Math.max(0, save.xp - xpLost) }, xpLost };
}

export function applyDoomAdenaPenalty(save: PlayerSave): { save: PlayerSave; adenaLost: number } {
  if (inferDeathKind(save.lastDeathCause, save.lastDeathKind) !== 'doom') {
    return { save, adenaLost: 0 };
  }
  const adena = Math.max(0, save.adena ?? 0);
  const adenaLost = Math.floor(adena * DOOM_ADENA_PENALTY_RATIO);
  if (adenaLost <= 0) return { save, adenaLost: 0 };
  return { save: { ...save, adena: adena - adenaLost }, adenaLost };
}

export function markCombatDeath(save: PlayerSave, cause: string, now = Date.now()): PlayerSave {
  const doom = shouldApplyDoom(save, now);
  return {
    ...save,
    lastDeathKind: doom ? 'doom' : 'combat',
    lastDeathCause: doom
      ? `${SURVIVAL_DOOM_CAUSE_PREFIX}: ${cause} при невылеченной травме.`
      : cause,
  };
}

export function hasResurrectionScroll(save: PlayerSave): boolean {
  return save.inventory.includes(RESURRECTION_SCROLL_ID);
}

export function consumeResurrectionScroll(save: PlayerSave): PlayerSave | null {
  const idx = save.inventory.indexOf(RESURRECTION_SCROLL_ID);
  if (idx < 0) return null;
  return removeInventoryIndexFromSave(save, idx);
}

export function reviveHalfHp(save: PlayerSave): PlayerSave {
  const dismounted = dismount(save);
  const stabilized = dismounted.survival
    ? { ...dismounted, survival: stabilizeSurvivalAfterRevive(dismounted.survival) }
    : dismounted;
  return applyStatsToSave({
    ...stabilized,
    hp: Math.max(1, Math.floor(stabilized.maxHp * 0.5)),
    mp: Math.floor((stabilized.maxMp ?? 0) * 0.5),
    lastDeathCause: null,
    lastDeathKind: null,
  });
}

/** Воскрешение в городе со штрафом опыта. */
export function respawnInTown(save: PlayerSave): {
  save: PlayerSave;
  xpLost: number;
  adenaLost: number;
  deathKind: DeathKind;
  locationId: string;
} {
  const town = getLocation(RESPAWN_TOWN_ID);
  if (!town) {
    throw new Error('Respawn town missing');
  }
  const deathKind = inferDeathKind(save.lastDeathCause, save.lastDeathKind);
  const penalized = applyDeathXpPenalty(save);
  const taxed = applyDoomAdenaPenalty(penalized.save);
  const next = reviveHalfHp({ ...taxed.save, location: town.id });
  return {
    save: next,
    xpLost: penalized.xpLost,
    adenaLost: taxed.adenaLost,
    deathKind,
    locationId: town.id,
  };
}

/** Воскрешение на месте свитком — без штрафа XP. */
export function respawnInPlace(save: PlayerSave): PlayerSave {
  return reviveHalfHp(save);
}

/** Prefer a matching live actor; disconnected characters retain their saved pose. */
export function resurrectionPosition(save: PlayerSave, presence: { locationId: string; x: number; y: number } | null): { x: number; y: number } | null {
  if (presence?.locationId === save.location && Number.isFinite(presence.x) && Number.isFinite(presence.y)) return { x: presence.x, y: presence.y };
  if (Number.isFinite(save.worldX) && Number.isFinite(save.worldY)) return { x: save.worldX!, y: save.worldY! };
  return null;
}
