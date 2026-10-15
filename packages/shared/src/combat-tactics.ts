/**
 * Боевая тактика без Phaser: геометрия удара, казнь, комбо, стоимость выносливости.
 * Числа здесь — источник правды; клиент только показывает флаги сервера.
 */

export type CombatFacing = 'left' | 'right';
export type AttackArc = 'front' | 'flank' | 'back';
/** YAML `tactic` на активном навыке. */
export type CombatTactic = 'backstab' | 'execute' | 'cleave' | 'poison' | 'mark' | 'snipe' | 'vanish' | 'seek';
export type SkillTacticFail = 'backstab' | 'execute' | 'vanish';
export type CombatDotKind = 'bleed' | 'poison';
export type CombatControlKind = 'pin' | 'stun';
/** YAML `rangeBias` — независимо от tactic (костёр: cleave + close). */
export type CombatRangeBias = 'close';

export const EXECUTE_HP_RATIO = 0.35;
export const EXECUTE_DAMAGE_MULT = 1.18;

export const BACKSTAB_REAR_DAMAGE_MULT = 1.12;
export const BACKSTAB_FLANK_DAMAGE_MULT = 0.85;
export const BACKSTAB_REAR_CRIT_BONUS = 8;

export const POSITIONAL_FLANK_DAMAGE_MULT = 1.08;
export const POSITIONAL_BACK_DAMAGE_MULT = 1.16;
export const POSITIONAL_FLANK_ACCURACY = 4;
export const POSITIONAL_BACK_ACCURACY = 8;
export const POSITIONAL_BACK_CRIT_BONUS = 6;

export const CLEAVE_MAX_TARGETS = 4;
export const CLEAVE_SPLASH_MULT = 0.6;

export const COMBO_WINDOW_MS = 1600;
export const COMBO_MAX = 6;
export const COMBO_PER_HIT_DAMAGE = 0.05;

export const PLAYER_ATTACK_STAMINA_COST = 16;
export const PLAYER_SKILL_STAMINA_COST = 32;
export const PLAYER_SKILL_MIN_STAMINA = 20;
export const PLAYER_PERFECT_DODGE_STAMINA_GAIN = 18;

export const SNIPE_MIN_DIST = 130;
export const SNIPE_SWEET_DIST = 200;
export const MARK_DURATION_MS = 6000;
export const MARK_DAMAGE_MULT = 1.22;
export const MARK_ACCURACY = 14;
export const POISON_DURATION_MS = 4000;
export const POISON_TICK_MS = 500;

export const PIN_DURATION_MS = 2800;
export const PIN_SPEED_MULT = 0.4;
export const STUN_DURATION_MS = 1600;
export const VANISH_DAMAGE_MULT = 1.18;
export const VANISH_ACCURACY = 10;
export const VANISH_CRIT_BONUS = 12;
export const SEEK_ACCURACY = 18;

export const PYRE_CLOSE_DIST = 90;
export const PYRE_FAR_DIST = 160;
export const PYRE_CLOSE_DAMAGE_MULT = 1.18;
export const PYRE_CLOSE_ACCURACY = 8;
export const PYRE_FAR_DAMAGE_MULT = 0.82;
export const PYRE_FAR_ACCURACY = -6;

/** |dot| ниже этого — фланг (цель смотрит вбок относительно атакующего). */
const ARC_FRONT_DOT = 0.35;

export interface ComboState {
  count: number;
  lastHitAt: number;
}

export function facingUnitX(facing: CombatFacing): number {
  return facing === 'left' ? -1 : 1;
}

/**
 * Дуга удара относительно взгляда цели (left/right).
 * Спина = атакующий за спиной; фронт = в конусе взгляда.
 */
export function attackArc(
  attackerX: number,
  attackerY: number,
  targetX: number,
  targetY: number,
  targetFacing: CombatFacing,
): AttackArc {
  const dx = attackerX - targetX;
  const dy = attackerY - targetY;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return 'front';
  const nx = dx / len;
  const dot = nx * facingUnitX(targetFacing);
  if (dot >= ARC_FRONT_DOT) return 'front';
  if (dot <= -ARC_FRONT_DOT) return 'back';
  return 'flank';
}

export function isCleaveTactic(tactic: CombatTactic | undefined): boolean {
  return tactic === 'cleave';
}

export function evaluateTacticGate(opts: {
  tactic: CombatTactic | undefined;
  /** Нет геометрии → требование спины не проверяем. */
  arc: AttackArc | undefined;
  hpRatio: number;
  dashing?: boolean;
}): { ok: true } | { ok: false; fail: SkillTacticFail } {
  if (opts.tactic === 'backstab' && opts.arc === 'front') {
    return { ok: false, fail: 'backstab' };
  }
  if (opts.tactic === 'execute' && opts.hpRatio > EXECUTE_HP_RATIO) {
    return { ok: false, fail: 'execute' };
  }
  if (opts.tactic === 'vanish' && !opts.dashing) {
    return { ok: false, fail: 'vanish' };
  }
  return { ok: true };
}

export interface TacticStrikeBonuses {
  damageMult: number;
  accuracy: number;
  critBonus: number;
  guaranteedCrit: boolean;
  backstab: boolean;
  execute: boolean;
  snipe: boolean;
  marked: boolean;
  vanish: boolean;
  seek: boolean;
  pyre: boolean;
  arc: AttackArc;
}

/** Позиционный бонус + бонусы tactic (после прохождения gate). */
export function tacticStrikeBonuses(opts: {
  tactic: CombatTactic | undefined;
  arc: AttackArc;
  /** false = не применять flank/back (лук / магия). */
  positional: boolean;
  /** Дистанция до цели (снайпер / лук). */
  distance?: number;
  /** Цель уже помечена marking_shot. */
  marked?: boolean;
  /** YAML `rangeBias` (костёр в упор). */
  rangeBias?: CombatRangeBias;
}): TacticStrikeBonuses {
  let damageMult = 1;
  let accuracy = 0;
  let critBonus = 0;
  if (opts.positional) {
    if (opts.arc === 'flank') {
      damageMult *= POSITIONAL_FLANK_DAMAGE_MULT;
      accuracy += POSITIONAL_FLANK_ACCURACY;
    } else if (opts.arc === 'back') {
      damageMult *= POSITIONAL_BACK_DAMAGE_MULT;
      accuracy += POSITIONAL_BACK_ACCURACY;
      critBonus += POSITIONAL_BACK_CRIT_BONUS;
    }
  }

  let backstab = false;
  let execute = false;
  let guaranteedCrit = false;
  let snipe = false;
  let marked = false;
  let vanish = false;
  let seek = false;
  let pyre = false;

  if (opts.tactic === 'backstab') {
    if (opts.arc === 'back') {
      damageMult *= BACKSTAB_REAR_DAMAGE_MULT;
      critBonus += BACKSTAB_REAR_CRIT_BONUS;
      backstab = true;
    } else if (opts.arc === 'flank') {
      damageMult *= BACKSTAB_FLANK_DAMAGE_MULT;
    }
  } else if (opts.tactic === 'execute') {
    damageMult *= EXECUTE_DAMAGE_MULT;
    guaranteedCrit = true;
    execute = true;
  } else if (opts.tactic === 'snipe' && opts.distance !== undefined) {
    const sn = snipeDistanceMods(opts.distance);
    damageMult *= sn.damageMult;
    accuracy += sn.accuracy;
    snipe = sn.snipe;
  } else if (opts.tactic === 'vanish') {
    damageMult *= VANISH_DAMAGE_MULT;
    accuracy += VANISH_ACCURACY;
    critBonus += VANISH_CRIT_BONUS;
    vanish = true;
  } else if (opts.tactic === 'seek') {
    seek = true;
    accuracy += SEEK_ACCURACY;
  }

  if (opts.marked) {
    damageMult *= MARK_DAMAGE_MULT;
    accuracy += MARK_ACCURACY;
    marked = true;
  }

  if (opts.rangeBias === 'close' && opts.distance !== undefined) {
    const close = closeRangeMods(opts.distance);
    damageMult *= close.damageMult;
    accuracy += close.accuracy;
    pyre = close.pyre;
  }

  return {
    damageMult,
    accuracy,
    critBonus,
    guaranteedCrit,
    backstab,
    execute,
    snipe,
    marked,
    vanish,
    seek,
    pyre,
    arc: opts.arc,
  };
}

/** Лук: в упор слабее и менее точно, с дистанции — сильнее. */
export function rangedDistanceMods(dist: number): { damageMult: number; accuracy: number } {
  if (!Number.isFinite(dist) || dist < 0) return { damageMult: 1, accuracy: 0 };
  if (dist < 90) return { damageMult: 0.9, accuracy: -6 };
  if (dist >= 180) return { damageMult: 1.1, accuracy: 8 };
  return { damageMult: 1, accuracy: 0 };
}

/** Снайперский скилл: сладкая дистанция vs выстрел в упор. */
export function snipeDistanceMods(dist: number): {
  damageMult: number;
  accuracy: number;
  snipe: boolean;
} {
  if (!Number.isFinite(dist) || dist < SNIPE_MIN_DIST) {
    return { damageMult: 0.82, accuracy: -4, snipe: false };
  }
  if (dist >= SNIPE_SWEET_DIST) {
    return { damageMult: 1.22, accuracy: 12, snipe: true };
  }
  return { damageMult: 1.08, accuracy: 6, snipe: true };
}

/** Взрыв в упор: близко сильнее, с дистанции слабее. */
export function closeRangeMods(dist: number): {
  damageMult: number;
  accuracy: number;
  pyre: boolean;
} {
  if (!Number.isFinite(dist) || dist < 0) {
    return { damageMult: 1, accuracy: 0, pyre: false };
  }
  if (dist < PYRE_CLOSE_DIST) {
    return { damageMult: PYRE_CLOSE_DAMAGE_MULT, accuracy: PYRE_CLOSE_ACCURACY, pyre: true };
  }
  if (dist >= PYRE_FAR_DIST) {
    return { damageMult: PYRE_FAR_DAMAGE_MULT, accuracy: PYRE_FAR_ACCURACY, pyre: false };
  }
  return { damageMult: 1, accuracy: 0, pyre: false };
}

export function poisonDot(
  pAtk: number,
  rank: number,
  crit: boolean,
): { tickDamage: number; durationMs: number; tickMs: number; kind: 'poison' } {
  const r = Math.max(1, Math.min(3, Math.floor(rank) || 1));
  let tick = Math.max(1, Math.floor(Math.max(1, pAtk) * (0.07 + r * 0.03)));
  if (crit) tick *= 2;
  return {
    tickDamage: tick,
    durationMs: POISON_DURATION_MS,
    tickMs: POISON_TICK_MS,
    kind: 'poison',
  };
}

export function peekCombo(prev: ComboState | undefined, now: number): number {
  if (!prev || prev.count <= 0) return 0;
  if (now - prev.lastHitAt > COMBO_WINDOW_MS) return 0;
  return Math.min(COMBO_MAX, prev.count);
}

export function pushCombo(
  prev: ComboState | undefined,
  now: number,
  hit: boolean,
): ComboState {
  if (!hit) return { count: 0, lastHitAt: now };
  const held = peekCombo(prev, now);
  return { count: Math.min(COMBO_MAX, held + 1), lastHitAt: now };
}

/** count 1 → ×1; каждый следующий хит в окне +5% до COMBO_MAX. */
export function comboDamageMultiplier(count: number): number {
  if (count <= 1) return 1;
  const extra = Math.min(Math.max(0, count - 1), COMBO_MAX - 1);
  return 1 + extra * COMBO_PER_HIT_DAMAGE;
}

export function combatStaminaCost(isSkill: boolean): number {
  return isSkill ? PLAYER_SKILL_STAMINA_COST : PLAYER_ATTACK_STAMINA_COST;
}

export function controlDurationMs(kind: CombatControlKind): number {
  return kind === 'stun' ? STUN_DURATION_MS : PIN_DURATION_MS;
}

export function controlSpeedMult(kind: CombatControlKind): number {
  return kind === 'stun' ? 0 : PIN_SPEED_MULT;
}

/** Stun без щита не вешается; урон навыка всё равно проходит. */
export function resolveSkillControl(opts: {
  control: CombatControlKind | undefined;
  hasShield: boolean;
}): CombatControlKind | undefined {
  if (!opts.control) return undefined;
  if (opts.control === 'stun' && !opts.hasShield) return undefined;
  return opts.control;
}

export interface MobControlState {
  kind: CombatControlKind;
  untilMs: number;
  restoreSpeed: number;
}

export interface ControllableMob {
  speed: number;
  control?: MobControlState;
}

export function expireMobControl(entity: ControllableMob, now: number): boolean {
  const c = entity.control;
  if (!c) return false;
  if (now < c.untilMs) return false;
  entity.speed = c.restoreSpeed;
  entity.control = undefined;
  return true;
}

export function applyMobControl(entity: ControllableMob, kind: CombatControlKind, now: number): void {
  expireMobControl(entity, now);
  const restore = entity.control?.restoreSpeed ?? entity.speed;
  entity.control = {
    kind,
    untilMs: now + controlDurationMs(kind),
    restoreSpeed: restore,
  };
  entity.speed = restore * controlSpeedMult(kind);
}

export function activeMobControl(entity: ControllableMob, now: number): CombatControlKind | undefined {
  expireMobControl(entity, now);
  return entity.control?.kind;
}
