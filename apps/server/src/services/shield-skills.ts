import type { PlayerSave } from '@empery/shared';

export const SHIELD_MASTERY_ID = 'shield_mastery';
export const SHIELD_RIPOSTE_ID = 'shield_riposte';
export const UNYIELDING_WALL_ID = 'unyielding_wall';
export const SHIELD_BASTION_ID = 'shield_bastion';

export const BLOCK_DAMAGE_TAKEN_BASE = 0.4;
const MASTERY_BLOCK_TAKEN = [0.34, 0.26, 0.18];
const UNYIELDING_BLOCK = [8, 14, 20];
const UNYIELDING_FULL_BLOCK = [0.12, 0.2, 0.3];
const BASTION_BLOCK = [10, 16, 22];
const RIPOSTE_DAMAGE = [1.5, 1.75, 2.1];
const RIPOSTE_ACCURACY = [10, 16, 24];
const RIPOSTE_DURATION_MS = [4000, 4500, 5000];
export const UNYIELDING_HP_RATIO = 0.5;

const FLAG_RIPOSTE_UNTIL = 'buff_shield_riposte_until';

export function hasShieldEquipped(save: PlayerSave): boolean {
  return Boolean(save.equipment.shield);
}

export function shieldSkillRank(save: PlayerSave, skillId: string): number {
  if (!hasShieldEquipped(save)) return 0;
  return Math.max(0, save.skillLevels[skillId] ?? 0);
}

export function blockDamageTaken(save: PlayerSave): number {
  const rank = shieldSkillRank(save, SHIELD_MASTERY_ID);
  if (rank <= 0) return BLOCK_DAMAGE_TAKEN_BASE;
  return MASTERY_BLOCK_TAKEN[Math.min(rank, MASTERY_BLOCK_TAKEN.length) - 1];
}

export function unyieldingWallBlockBonus(save: PlayerSave, hpRatio: number): number {
  const rank = shieldSkillRank(save, UNYIELDING_WALL_ID);
  if (rank <= 0 || hpRatio > UNYIELDING_HP_RATIO) return 0;
  return UNYIELDING_BLOCK[Math.min(rank, UNYIELDING_BLOCK.length) - 1];
}

export function unyieldingFullBlockChance(save: PlayerSave, hpRatio: number): number {
  const rank = shieldSkillRank(save, UNYIELDING_WALL_ID);
  if (rank <= 0 || hpRatio > UNYIELDING_HP_RATIO) return 0;
  return UNYIELDING_FULL_BLOCK[Math.min(rank, UNYIELDING_FULL_BLOCK.length) - 1];
}

export function shieldBastionBlockBonus(save: PlayerSave, idle: boolean): number {
  if (!idle) return 0;
  const rank = shieldSkillRank(save, SHIELD_BASTION_ID);
  if (rank <= 0) return 0;
  return BASTION_BLOCK[Math.min(rank, BASTION_BLOCK.length) - 1];
}

export function shieldRiposteModifiers(rank: number): { damageMult: number; accuracy: number } {
  const i = Math.min(Math.max(rank, 1), RIPOSTE_DAMAGE.length) - 1;
  return { damageMult: RIPOSTE_DAMAGE[i], accuracy: RIPOSTE_ACCURACY[i] };
}

export interface ShieldRiposteState {
  active: boolean;
  untilMs: number;
  remainingMs: number;
}

export function getShieldRiposte(save: PlayerSave): ShieldRiposteState {
  const untilRaw = save.questFlags[FLAG_RIPOSTE_UNTIL];
  const untilMs = typeof untilRaw === 'string' ? new Date(untilRaw).getTime() : 0;
  const now = Date.now();
  const rank = shieldSkillRank(save, SHIELD_RIPOSTE_ID);
  const active = rank > 0 && untilMs > now;
  return {
    active,
    untilMs,
    remainingMs: active ? untilMs - now : 0,
  };
}

export function clearExpiredShieldRiposte(save: PlayerSave): PlayerSave {
  const untilRaw = save.questFlags[FLAG_RIPOSTE_UNTIL];
  if (!untilRaw) return save;
  if (getShieldRiposte(save).active) return save;
  const flags = { ...save.questFlags };
  delete flags[FLAG_RIPOSTE_UNTIL];
  return { ...save, questFlags: flags };
}

export function activateShieldRiposte(save: PlayerSave): PlayerSave {
  const rank = shieldSkillRank(save, SHIELD_RIPOSTE_ID);
  if (rank <= 0) return save;
  const duration = RIPOSTE_DURATION_MS[Math.min(rank, RIPOSTE_DURATION_MS.length) - 1];
  const until = new Date(Date.now() + duration).toISOString();
  return {
    ...save,
    questFlags: { ...save.questFlags, [FLAG_RIPOSTE_UNTIL]: until },
  };
}

/** Снимает окно рипоста, если оно активно. Промах не должен вызывать это. */
export function consumeShieldRiposte(save: PlayerSave): {
  save: PlayerSave;
  consumed: boolean;
  rank: number;
} {
  let next = clearExpiredShieldRiposte(save);
  const rank = shieldSkillRank(next, SHIELD_RIPOSTE_ID);
  const state = getShieldRiposte(next);
  if (!state.active || rank <= 0) {
    return { save: next, consumed: false, rank: 0 };
  }
  const flags = { ...next.questFlags };
  delete flags[FLAG_RIPOSTE_UNTIL];
  return { save: { ...next, questFlags: flags }, consumed: true, rank };
}
