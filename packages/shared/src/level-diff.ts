/** Разница уровней в духе Lineage 2 (playerLevel - enemyLevel). */

/** На сколько lvl игрок выше — «серый» моб, почти нет награды */
export const GRAY_LEVEL_GAP = 9;

export type MobDifficulty =
  | 'gray'
  | 'trivial'
  | 'easy'
  | 'normal'
  | 'hard'
  | 'very_hard';

export interface EnemyStatBlock {
  level: number;
  hp: number;
  pAtk: number;
  pDef: number;
  mDef: number;
  accuracy: number;
  evasion: number;
  speed: number;
  xpReward: number;
}

export interface EnemyScaleInput {
  level: number;
  hp: number;
  pAtk: number;
  pDef: number;
  mDef?: number;
  accuracy: number;
  evasion: number;
  speed: number;
  xpReward: number;
}

/** playerLevel - enemyLevel */
export function levelAdvantage(playerLevel: number, enemyLevel: number): number {
  return playerLevel - enemyLevel;
}

export function mobDifficulty(playerLevel: number, enemyLevel: number): MobDifficulty {
  const adv = levelAdvantage(playerLevel, enemyLevel);
  if (adv >= GRAY_LEVEL_GAP) return 'gray';
  if (adv >= 5) return 'trivial';
  if (adv >= 2) return 'easy';
  if (adv >= -1) return 'normal';
  if (adv >= -4) return 'hard';
  return 'very_hard';
}

/** Множитель базового XP моба (L2: бонус за высокий lvl, штраф за низкий). */
export function xpRewardMultiplier(playerLevel: number, enemyLevel: number): number {
  const adv = levelAdvantage(playerLevel, enemyLevel);
  if (adv >= GRAY_LEVEL_GAP) return 0;
  if (adv >= 7) return 0.05;
  if (adv >= 5) return 0.12;
  if (adv >= 3) return 0.45;
  if (adv >= 2) return 0.7;
  if (adv >= 1) return 0.88;
  if (adv === 0) return 1;
  if (adv === -1) return 1.12;
  if (adv === -2) return 1.24;
  if (adv === -3) return 1.35;
  if (adv <= -4) return 1.45;
  return 1;
}

/** Множитель шанса дропа предметов (adena отдельно). */
export function itemDropMultiplier(playerLevel: number, enemyLevel: number): number {
  const adv = levelAdvantage(playerLevel, enemyLevel);
  if (adv >= GRAY_LEVEL_GAP) return 0;
  if (adv >= 6) return 0.08;
  if (adv >= 4) return 0.25;
  if (adv >= 2) return 0.55;
  if (adv >= 1) return 0.8;
  if (adv === 0) return 1;
  if (adv === -1) return 1.05;
  if (adv <= -2) return 1.1;
  return 1;
}

export function adenaDropMultiplier(playerLevel: number, enemyLevel: number): number {
  const adv = levelAdvantage(playerLevel, enemyLevel);
  if (adv >= GRAY_LEVEL_GAP) return 0.15;
  if (adv >= 6) return 0.35;
  if (adv >= 3) return 0.65;
  if (adv >= 1) return 0.85;
  return 1;
}

/**
 * Статы моба относительно базового lvl из контента.
 * HP/Atk/Def — экспонента (~8%/lvl); accuracy/evasion — линейно (~как у игрока +1/lvl),
 * иначе к mid-game у мобов сотни eva и hit chance упирается в пол 20%.
 */
export function scaleEnemyStats(base: EnemyScaleInput, spawnLevel: number): EnemyStatBlock {
  const baseLevel = Math.max(1, base.level);
  const lvl = Math.max(1, spawnLevel);
  const diff = lvl - baseLevel;
  const combatScale = Math.pow(1.08, diff);
  const xpScale = Math.pow(1.1, diff);
  const speedScale = Math.pow(1.04, diff);
  /** Чуть выше +1/lvl игрока — равный моб чуть скользкий, но не «стена промахов». */
  const hitPerLevel = 1.35;

  return {
    level: lvl,
    hp: Math.max(1, Math.floor(base.hp * combatScale)),
    pAtk: Math.max(1, Math.floor(base.pAtk * combatScale)),
    pDef: Math.max(1, Math.floor(base.pDef * combatScale)),
    mDef: Math.max(
      1,
      Math.floor((base.mDef ?? Math.max(1, Math.floor(base.pDef * 0.9))) * combatScale),
    ),
    accuracy: Math.max(1, Math.floor(base.accuracy + diff * hitPerLevel)),
    evasion: Math.max(1, Math.floor(base.evasion + diff * hitPerLevel)),
    speed: Math.max(40, Math.floor(base.speed * speedScale)),
    xpReward: Math.max(1, Math.floor(base.xpReward * xpScale)),
  };
}

export function difficultyLabel(diff: MobDifficulty): string {
  switch (diff) {
    case 'gray':
      return 'серый';
    case 'trivial':
      return 'слабый';
    case 'easy':
      return 'лёгкий';
    case 'normal':
      return 'обычный';
    case 'hard':
      return 'сложный';
    case 'very_hard':
      return 'опасный';
  }
}
