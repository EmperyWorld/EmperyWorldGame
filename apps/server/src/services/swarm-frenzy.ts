import type { PlayerSave } from '@empery/shared';
import { getItem } from './items.js';

export const SWARM_FRENZY_ID = 'swarm_frenzy';
export const SWARM_FRENZY_PROC = 0.1;
export const SWARM_FRENZY_DURATION_MS = 2000;
export const SWARM_FRENZY_MIN_ENEMIES = 4; // больше 3
export const SWARM_FRENZY_PATK_PENALTY = 0.1;

const FLAG_UNTIL = 'buff_swarm_frenzy_until';
const FLAG_N = 'buff_swarm_frenzy_n';

export interface SwarmFrenzyState {
  active: boolean;
  untilMs: number;
  enemyCount: number;
  remainingMs: number;
}

/** Лёгкая экипировка: лёгкое оружие и нет тяжёлой брони */
export function isLightEquipment(save: PlayerSave): boolean {
  const weaponId = save.equipment.weapon;
  if (!weaponId) return false;
  const weapon = getItem(weaponId);
  if (!weapon || weapon.weaponWeight !== 'light') return false;

  for (const slot of ['head', 'body', 'legs', 'gloves', 'cloak', 'shield'] as const) {
    const id = save.equipment[slot];
    if (!id) continue;
    const item = getItem(id);
    if (item?.armorType === 'heavy') return false;
  }
  return true;
}

export function getSwarmFrenzy(save: PlayerSave): SwarmFrenzyState {
  const untilRaw = save.questFlags[FLAG_UNTIL];
  const untilMs = typeof untilRaw === 'string' ? new Date(untilRaw).getTime() : 0;
  const enemyCount = Math.max(0, Number(save.questFlags[FLAG_N] ?? 0));
  const now = Date.now();
  const active = untilMs > now && enemyCount > 0;
  return {
    active,
    untilMs,
    enemyCount: active ? enemyCount : 0,
    remainingMs: active ? untilMs - now : 0,
  };
}

export function clearExpiredSwarmFrenzy(save: PlayerSave): PlayerSave {
  const state = getSwarmFrenzy(save);
  if (state.active || !save.questFlags[FLAG_UNTIL]) return save;
  const flags = { ...save.questFlags };
  delete flags[FLAG_UNTIL];
  delete flags[FLAG_N];
  return { ...save, questFlags: flags };
}

export function activateSwarmFrenzy(save: PlayerSave, enemyCount: number): PlayerSave {
  const until = new Date(Date.now() + SWARM_FRENZY_DURATION_MS).toISOString();
  return {
    ...save,
    questFlags: {
      ...save.questFlags,
      [FLAG_UNTIL]: until,
      [FLAG_N]: Math.max(SWARM_FRENZY_MIN_ENEMIES, enemyCount),
    },
  };
}

export function canProcSwarmFrenzy(
  save: PlayerSave,
  nearbyEnemyCount: number,
): boolean {
  if ((save.skillLevels[SWARM_FRENZY_ID] ?? 0) <= 0) return false;
  if (nearbyEnemyCount < SWARM_FRENZY_MIN_ENEMIES) return false;
  if (!isLightEquipment(save)) return false;
  if (getSwarmFrenzy(save).active) return false;
  return true;
}

/** Попытка прока: 10% при >3 врагах и лёгкой экипировке */
export function tryProcSwarmFrenzy(
  save: PlayerSave,
  nearbyEnemyCount: number,
): { save: PlayerSave; procced: boolean } {
  let next = clearExpiredSwarmFrenzy(save);
  if (!canProcSwarmFrenzy(next, nearbyEnemyCount)) {
    return { save: next, procced: false };
  }
  if (Math.random() >= SWARM_FRENZY_PROC) {
    return { save: next, procced: false };
  }
  next = activateSwarmFrenzy(next, nearbyEnemyCount);
  return { save: next, procced: true };
}

export function swarmFrenzyMultipliers(save: PlayerSave): {
  attackSpeedMult: number;
  evasionMult: number;
  pAtkMult: number;
  enemyCount: number;
} | null {
  const state = getSwarmFrenzy(save);
  if (!state.active) return null;
  const n = state.enemyCount;
  return {
    attackSpeedMult: n,
    evasionMult: n,
    pAtkMult: Math.max(0.1, 1 - SWARM_FRENZY_PATK_PENALTY * n),
    enemyCount: n,
  };
}

/** Урон кровотечения за тик (серверная формула) */
export function calcBleedTickDamage(pAtk: number, enemyCount: number): number {
  return Math.max(1, Math.floor(pAtk * 0.08 * Math.max(1, enemyCount)));
}
