/** Дистанция автоатаки в ближнем бою (как PVP_RANGE). */
export const MELEE_ATTACK_RANGE = 56;

/** Клиентский запас к радиусу захвата цели. */
export const ATTACK_REACH_PADDING = 14;

/**
 * Эффективная дистанция атаки.
 * Берётся max(оружие, скилл); к ranged-базе добавляется пассивный бонус.
 * Без оружия/скилла с range — ближний бой (бонус не применяется).
 */
export function resolveAttackRange(opts: {
  weaponAttackRange?: number | null;
  skillAttackRange?: number | null;
  /** Сумма пассивок / прочих бонусов к дальности (только если есть ranged-база). */
  rangeBonus?: number | null;
}): number {
  const weapon = Math.max(0, opts.weaponAttackRange ?? 0);
  const skill = Math.max(0, opts.skillAttackRange ?? 0);
  const bonus = Math.max(0, opts.rangeBonus ?? 0);
  const best = Math.max(weapon, skill);
  if (best > 0) return best + bonus;
  return MELEE_ATTACK_RANGE;
}

export function attackReach(range: number, padding = ATTACK_REACH_PADDING): number {
  return range + padding;
}
