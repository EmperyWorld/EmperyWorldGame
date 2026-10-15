/**
 * Магическое попадание / сопротивление (L2-inspired, PvE tuning).
 *
 * aCis: fail-порог растёт как 1.3^Δlvl → success ≈ 1 / 1.3^Δlvl.
 * l2-universe: доп. resist 4% × Δlvl (половина / ноль урона).
 */

/** На сколько уровней цель выше кастера (0 если кастер не слабее). */
export function magicLevelDeficit(casterLevel: number, targetLevel: number): number {
  return Math.max(0, targetLevel - casterLevel);
}

/**
 * Шанс, что заклинание пройдёт (не RESIST / miss).
 * Равные уровни ≈97–99%; +8 lvl цели → ~8%; +16 → ~3%.
 */
export function calcMagicHitChance(
  casterLevel: number,
  targetLevel: number,
  accuracy = 0,
): number {
  const deficit = magicLevelDeficit(casterLevel, targetLevel);
  if (deficit === 0) {
    return Math.min(0.99, 0.97 + Math.min(0.02, accuracy * 0.0004));
  }

  let success = Math.pow(1.3, -deficit);

  // Точность помогает против «красных», но не ломает потолок.
  success += Math.min(0.1, (accuracy / 20) * 0.035);

  if (deficit >= 12) success = Math.min(success, 0.03);
  else if (deficit >= 8) success = Math.min(success, 0.08);
  else if (deficit >= 5) success = Math.min(success, 0.18);
  else if (deficit >= 3) success = Math.min(success, 0.4);

  return Math.max(0.01, Math.min(0.98, success));
}

export function rollMagicHit(
  casterLevel: number,
  targetLevel: number,
  accuracy = 0,
): boolean {
  return Math.random() < calcMagicHitChance(casterLevel, targetLevel, accuracy);
}

/** Штраф урона, если бьём моба выше уровнем. */
export function magicLevelDamageMultiplier(casterLevel: number, targetLevel: number): number {
  const deficit = magicLevelDeficit(casterLevel, targetLevel);
  if (deficit <= 0) return 1;
  return Math.pow(1.15, -deficit);
}

export type MagicResistOutcome = 'none' | 'half' | 'full';

/**
 * Доп. сопротивление после прохождения (l2-universe: 4% × Δlvl).
 * full → урон 0 (редко, при большом Δlvl); half → ÷2.
 */
export function rollMagicResistOutcome(
  casterLevel: number,
  targetLevel: number,
): MagicResistOutcome {
  const deficit = magicLevelDeficit(casterLevel, targetLevel);
  if (deficit <= 0) return 'none';
  const resistRoll = 4 * deficit;
  if (Math.random() * 100 >= resistRoll) return 'none';
  if (deficit > 9) return 'full';
  return 'half';
}
