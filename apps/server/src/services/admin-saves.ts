import type { PlayerSave } from '@empery/shared';
import { getItem } from './items.js';
import { normalizeSave } from './save-normalize.js';
import { applyStatsToSave } from './stats.js';
import { appendItemsToSave } from './inventory-bag.js';

/** Whitelist admin patch fields (never arbitrary JSON). */
export interface AdminSavePatch {
  hp?: number;
  mp?: number;
  xp?: number;
  level?: number;
  adena?: number;
  location?: string;
  karma?: number;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function applyAdminSavePatch(existing: PlayerSave, patch: AdminSavePatch): PlayerSave {
  const next: PlayerSave = { ...existing };

  if (patch.level !== undefined) {
    next.level = clampInt(patch.level, 1, 99);
  }
  if (patch.xp !== undefined) {
    next.xp = clampInt(patch.xp, 0, 2_000_000_000);
  }
  if (patch.adena !== undefined) {
    next.adena = clampInt(patch.adena, 0, 2_000_000_000);
  }
  if (patch.karma !== undefined) {
    next.karma = clampInt(patch.karma, 0, 1_000_000);
  }
  if (patch.location !== undefined) {
    const loc = String(patch.location).trim();
    if (loc) next.location = loc;
  }

  // Recalc max from level/gear before clamping hp/mp.
  const withStats = applyStatsToSave(next);

  if (patch.hp !== undefined) {
    withStats.hp = clampInt(patch.hp, 0, withStats.maxHp ?? 1);
  }
  if (patch.mp !== undefined) {
    withStats.mp = clampInt(patch.mp, 0, withStats.maxMp ?? 0);
  }

  return normalizeSave(withStats);
}

export function grantItemToSave(
  existing: PlayerSave,
  itemId: string,
  count: number,
): { save: PlayerSave; granted: number } | { error: string } {
  const id = String(itemId ?? '').trim();
  if (!id) return { error: 'itemId required' };
  if (!getItem(id)) return { error: `Unknown item: ${id}` };

  const n = clampInt(count, 1, 99);
  const ids = Array.from({ length: n }, () => id);
  const save = normalizeSave(appendItemsToSave(existing, ids));
  return { save, granted: n };
}

export interface AdminSaveListRow {
  id: string;
  name: string;
  race: string;
  profession?: string;
  level: number;
  location: string;
  accountId?: string;
  updatedAt: string;
}

export function toAdminSaveListRow(save: PlayerSave): AdminSaveListRow {
  return {
    id: save.id,
    name: save.name,
    race: save.race,
    profession: save.profession,
    level: save.level,
    location: save.location,
    accountId: save.accountId,
    updatedAt: save.updatedAt,
  };
}
