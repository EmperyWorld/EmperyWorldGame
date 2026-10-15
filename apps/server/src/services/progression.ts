import type { PlayerSave } from '@empery/shared';
import { xpRewardMultiplier } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import { getScaledEnemy } from './enemies.js';
import { applySkillProgressionOnLevel } from './skills.js';
import { homelandForRace } from './locations.js';

/** XP за успешное уклонение (пассивные навыки evasion) */
export const XP_SKILL_DODGE = 8;
/** XP за идеальное уклонение / контратаку */
export const XP_SKILL_PERFECT_DODGE = 15;
/** XP за попадание активным скиллом (без убийства) */
export const XP_SKILL_ACTIVE_HIT = 6;
/** Доп. XP за крит активным скиллом */
export const XP_SKILL_ACTIVE_CRIT_BONUS = 4;

export function xpToNextLevel(level: number): number {
  return level * 50;
}

export function grantXp(
  save: PlayerSave,
  xpGained: number,
): { save: PlayerSave; leveledUp: boolean; xpGained: number; skillsUnlocked: string[] } {
  if (xpGained <= 0) {
    return { save, leveledUp: false, xpGained: 0, skillsUnlocked: [] };
  }

  let xp = save.xp + xpGained;
  let level = save.level;
  let leveledUp = false;
  let next = save;
  const skillsUnlocked: string[] = [];

  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
    leveledUp = true;
    const prog = applySkillProgressionOnLevel(next, level);
    next = prog.save;
    skillsUnlocked.push(...prog.unlocked);
  }

  next = applyStatsToSave({ ...next, xp, level });
  if (leveledUp) {
    next = { ...next, hp: next.maxHp, mp: next.maxMp ?? next.mp };
  }

  return { save: next, leveledUp, xpGained, skillsUnlocked };
}

export function grantCombatXp(
  save: PlayerSave,
  enemyType: string,
  enemyLevel: number,
  opts?: { shareCount?: number },
): {
  save: PlayerSave;
  leveledUp: boolean;
  xpGained: number;
  xpMultiplier: number;
  baseXp: number;
  fullXp: number;
  skillsUnlocked: string[];
} {
  const scaled = getScaledEnemy(enemyType, enemyLevel);
  const baseXp = scaled?.xpReward ?? 10;
  let mult = xpRewardMultiplier(save.level, enemyLevel);
  if (homelandForRace(save.race) === save.location) {
    mult *= 1.05;
  }
  const fullXp = Math.floor(baseXp * mult);
  const shareCount = Math.max(1, opts?.shareCount ?? 1);
  const xpGained = Math.max(1, Math.floor(fullXp / shareCount));
  const result = grantXp(save, xpGained);
  return { ...result, xpMultiplier: mult, baseXp, fullXp };
}
