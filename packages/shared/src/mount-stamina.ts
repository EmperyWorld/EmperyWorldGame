/** Mount stamina 0–1000 and mounted run speed factor. */

export const MOUNT_STAMINA_MAX = 1000;
/** At or below this: walk + charge only (no run bonus). */
export const MOUNT_STAMINA_WALK_CAP = 100;
/** Minimum stamina to start a charge (рывок); allowed in walk band. */
export const MOUNT_CHARGE_MIN_STAMINA = 40;
/** Charge burst cost (before horse/weight). */
export const MOUNT_CHARGE_STAMINA_COST = 80;

export interface MountStaminaHorse {
  /** Peak mounted speed multiplier vs foot speed. */
  speedMult: number;
  /** Drain while running (higher = tires faster). */
  staminaDrainMult?: number;
  /** Regen while walking / dismounted. */
  staminaRegenMult?: number;
  /** Comfortable load (kg) before soft penalty. */
  carryComfortKg?: number;
  /** Hard load (kg) — beyond this speed collapses toward walk. */
  carryMaxKg?: number;
}

export interface AdvanceMountStaminaInput {
  stamina: number;
  dtSec: number;
  mounted: boolean;
  /** Any locomotion. */
  moving: boolean;
  /**
   * Intended run (WASD while stamina > walk cap).
   * False = walk/regen even if moving.
   */
  running: boolean;
  horse: MountStaminaHorse;
  carryWeightKg: number;
  /** Charge burst — extra drain. */
  chargePulse?: boolean;
}

export function clampMountStamina(n: number): number {
  if (!Number.isFinite(n)) return MOUNT_STAMINA_MAX;
  return Math.max(0, Math.min(MOUNT_STAMINA_MAX, n));
}

function horseDrain(h: MountStaminaHorse): number {
  return h.staminaDrainMult && h.staminaDrainMult > 0 ? h.staminaDrainMult : 1;
}

function horseRegen(h: MountStaminaHorse): number {
  return h.staminaRegenMult && h.staminaRegenMult > 0 ? h.staminaRegenMult : 1;
}

function weightBurden(carryKg: number, horse: MountStaminaHorse): number {
  const comfort = horse.carryComfortKg && horse.carryComfortKg > 0 ? horse.carryComfortKg : 90;
  const max = horse.carryMaxKg && horse.carryMaxKg > comfort ? horse.carryMaxKg : comfort + 50;
  if (carryKg <= comfort) return 1;
  if (carryKg >= max) return 2.2;
  const t = (carryKg - comfort) / (max - comfort);
  return 1 + t * 1.2;
}

/** Weight factor for speed: 1 at comfort, down to ~0.45 at max load. */
export function mountWeightSpeedFactor(carryKg: number, horse: MountStaminaHorse): number {
  const comfort = horse.carryComfortKg && horse.carryComfortKg > 0 ? horse.carryComfortKg : 90;
  const max = horse.carryMaxKg && horse.carryMaxKg > comfort ? horse.carryMaxKg : comfort + 50;
  if (carryKg <= comfort) return 1;
  if (carryKg >= max) return 0.45;
  const t = (carryKg - comfort) / (max - comfort);
  return 1 - t * 0.55;
}

/**
 * Advance stamina.
 * Regen: dismounted, or mounted idle, or mounted walking (not running).
 * Drain: mounted + running (stamina > walk cap), scaled by stamina level, horse, weight.
 */
export function advanceMountStamina(input: AdvanceMountStaminaInput): number {
  let s = clampMountStamina(input.stamina);
  const dt = Math.max(0, Math.min(input.dtSec, 5));

  if (input.chargePulse) {
    s = clampMountStamina(
      s - MOUNT_CHARGE_STAMINA_COST * horseDrain(input.horse) * weightBurden(input.carryWeightKg, input.horse),
    );
  }

  if (dt <= 0) return s;

  const canRun = s > MOUNT_STAMINA_WALK_CAP;
  const isRunning = input.mounted && input.moving && input.running && canRun;

  if (isRunning) {
    // Full power tires harder; low-run band drains less.
    const effort = 0.35 + 0.65 * (s / MOUNT_STAMINA_MAX);
    const burden = weightBurden(input.carryWeightKg, input.horse);
    const perSec = 28 * horseDrain(input.horse) * effort * burden;
    s = clampMountStamina(s - perSec * dt);
    return s;
  }

  // Regen: stabled / walk / stand
  const regenBase = input.mounted ? 18 : 42;
  const walkBonus = input.mounted && input.moving && !input.running ? 1.25 : 1;
  const perSec = regenBase * horseRegen(input.horse) * walkBonus;
  return clampMountStamina(s + perSec * dt);
}

/**
 * Mounted move speed from foot baseSpeed.
 * ≤ walk cap → clear walk band; above → lerp to full horse run × weight.
 * Walk is intentionally much slower than full run so stamina is felt in gameplay.
 */
export function mountedMoveSpeed(
  footSpeed: number,
  stamina: number,
  horse: MountStaminaHorse,
  carryWeightKg: number,
): number {
  const s = clampMountStamina(stamina);
  const weightF = mountWeightSpeedFactor(carryWeightKg, horse);
  const fullSpeed = footSpeed * (horse.speedMult > 0 ? horse.speedMult : 1.4) * weightF;
  // ~55% of peak — tired horse is clearly slower than a fresh gallop.
  const walkSpeed = fullSpeed * 0.55;
  if (s <= MOUNT_STAMINA_WALK_CAP) return walkSpeed;
  const t = (s - MOUNT_STAMINA_WALK_CAP) / (MOUNT_STAMINA_MAX - MOUNT_STAMINA_WALK_CAP);
  return walkSpeed + (fullSpeed - walkSpeed) * t;
}

/** True if mount may use run band (not forced walk). */
export function mountCanRun(stamina: number): boolean {
  return clampMountStamina(stamina) > MOUNT_STAMINA_WALK_CAP;
}

/** True if mount may start a charge burst. */
export function mountCanCharge(stamina: number): boolean {
  return clampMountStamina(stamina) >= MOUNT_CHARGE_MIN_STAMINA;
}

/** Indoors / private instances — no riding. */
export function locationDisallowsMount(loc: {
  privateOwnerOnly?: boolean;
  dayNight?: 'outdoor' | 'indoor' | 'dungeon';
}): boolean {
  return Boolean(loc.privateOwnerOnly) || loc.dayNight === 'indoor';
}
