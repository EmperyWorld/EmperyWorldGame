import type { PlayerSave } from '@empery/shared';
import { getItem } from './items.js';

export const MAD_DUALIST_ID = 'mad_dualist';
export const MAD_DUALIST_PROC = 0.3;
export const MAD_DUALIST_BASE_DURATION_MS = 3000;
export const MAD_DUALIST_DURATION_PER_LEVEL_MS = 1000;
export const MAD_DUALIST_UNLOCK_LEVEL = 30;
export const MAD_DUALIST_LEVEL_STEP = 10;

const FLAG_UNTIL = 'buff_mad_dualist_until';

export interface MadDualistState {
  active: boolean;
  untilMs: number;
  remainingMs: number;
}

export function madDualistSkillLevel(save: PlayerSave): number {
  return save.skillLevels[MAD_DUALIST_ID] ?? 0;
}

/** Ур.1 = 3с, каждый следующий уровень скилла +1с */
export function madDualistDurationMs(save: PlayerSave): number {
  const lvl = madDualistSkillLevel(save);
  if (lvl <= 0) return 0;
  return MAD_DUALIST_BASE_DURATION_MS + (lvl - 1) * MAD_DUALIST_DURATION_PER_LEVEL_MS;
}

/** Желаемый уровень скилла от уровня персонажа: 30→1, 40→2, … */
export function madDualistDesiredLevel(playerLevel: number, maxLevel = 20): number {
  if (playerLevel < MAD_DUALIST_UNLOCK_LEVEL) return 0;
  return Math.min(
    maxLevel,
    1 + Math.floor((playerLevel - MAD_DUALIST_UNLOCK_LEVEL) / MAD_DUALIST_LEVEL_STEP),
  );
}

export function isLightWeaponId(itemId: string | null | undefined): boolean {
  if (!itemId) return false;
  const item = getItem(itemId);
  return Boolean(item && item.slot === 'weapon' && item.weaponWeight === 'light');
}

/** Оба клинка экипированы и лёгкие */
export function canUseMadDualist(save: PlayerSave): boolean {
  if (madDualistSkillLevel(save) <= 0) return false;
  return isLightWeaponId(save.equipment.weapon) && isLightWeaponId(save.equipment.weapon2);
}

export function getMadDualist(save: PlayerSave): MadDualistState {
  const untilRaw = save.questFlags[FLAG_UNTIL];
  const untilMs = typeof untilRaw === 'string' ? new Date(untilRaw).getTime() : 0;
  const now = Date.now();
  const active = untilMs > now && canUseMadDualist(save);
  return {
    active,
    untilMs,
    remainingMs: active ? untilMs - now : 0,
  };
}

export function clearExpiredMadDualist(save: PlayerSave): PlayerSave {
  const untilRaw = save.questFlags[FLAG_UNTIL];
  if (!untilRaw) return save;
  const untilMs = typeof untilRaw === 'string' ? new Date(untilRaw).getTime() : 0;
  if (untilMs > Date.now() && canUseMadDualist(save)) return save;
  const flags = { ...save.questFlags };
  delete flags[FLAG_UNTIL];
  return { ...save, questFlags: flags };
}

/** Активация или продление: к текущему remaining (или now) + полная длительность */
export function activateMadDualist(save: PlayerSave): PlayerSave {
  const duration = madDualistDurationMs(save);
  if (duration <= 0) return save;
  const now = Date.now();
  const current = getMadDualist(save);
  const base = current.active ? current.untilMs : now;
  const until = new Date(base + duration).toISOString();
  return {
    ...save,
    questFlags: {
      ...save.questFlags,
      [FLAG_UNTIL]: until,
    },
  };
}

export function tryProcMadDualist(
  save: PlayerSave,
  opts?: { isSkillAttack?: boolean },
): { save: PlayerSave; procced: boolean } {
  let next = clearExpiredMadDualist(save);
  if (opts?.isSkillAttack) return { save: next, procced: false };
  if (!canUseMadDualist(next)) return { save: next, procced: false };
  if (Math.random() >= MAD_DUALIST_PROC) return { save: next, procced: false };
  next = activateMadDualist(next);
  return { save: next, procced: true };
}

export function madDualistAttackSpeedMult(save: PlayerSave): number {
  return getMadDualist(save).active ? 2 : 1;
}
