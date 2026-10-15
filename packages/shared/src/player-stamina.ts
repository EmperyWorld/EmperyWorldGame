/** Player foot stamina 0–1000 (mirrors mount stamina model). */

import { raceBodyWeightKg } from './carry-weight.js';

export const PLAYER_STAMINA_MAX = 1000;
/** At or below this: walk only (no run). */
export const PLAYER_STAMINA_WALK_CAP = 100;
/** Shift-dash burst cost (before weight). */
export const PLAYER_DASH_STAMINA_COST = 70;
/** Minimum stamina to start a dash. */
export const PLAYER_DASH_MIN_STAMINA = 25;

export interface AdvancePlayerStaminaInput {
  stamina: number;
  dtSec: number;
  /** On foot (not mounted). Mounted → rest regen. */
  onFoot: boolean;
  moving: boolean;
  /** Intend to run (WASD while stamina > walk cap). */
  running: boolean;
  carryWeightKg: number;
  race?: string;
  dashPulse?: boolean;
}

export function clampPlayerStamina(n: number): number {
  if (!Number.isFinite(n)) return PLAYER_STAMINA_MAX;
  return Math.max(0, Math.min(PLAYER_STAMINA_MAX, n));
}

/** Comfortable total load (body+gear+bag). */
export function playerCarryComfortKg(race: string | undefined): number {
  return raceBodyWeightKg(race) + 28;
}

export function playerCarryMaxKg(race: string | undefined): number {
  return playerCarryComfortKg(race) + 55;
}

function weightBurden(carryKg: number, race: string | undefined): number {
  const comfort = playerCarryComfortKg(race);
  const max = playerCarryMaxKg(race);
  if (carryKg <= comfort) return 1;
  if (carryKg >= max) return 2.1;
  const t = (carryKg - comfort) / (max - comfort);
  return 1 + t * 1.1;
}

/** 1 at comfort → ~0.5 at max load. */
export function playerWeightSpeedFactor(carryKg: number, race: string | undefined): number {
  const comfort = playerCarryComfortKg(race);
  const max = playerCarryMaxKg(race);
  if (carryKg <= comfort) return 1;
  if (carryKg >= max) return 0.5;
  const t = (carryKg - comfort) / (max - comfort);
  return 1 - t * 0.5;
}

/**
 * Regen: mounted (rest), idle, or walking.
 * Drain: on foot + running.
 */
export function advancePlayerStamina(input: AdvancePlayerStaminaInput): number {
  let s = clampPlayerStamina(input.stamina);
  const dt = Math.max(0, Math.min(input.dtSec, 5));
  const burden = weightBurden(input.carryWeightKg, input.race);

  if (input.dashPulse) {
    s = clampPlayerStamina(s - PLAYER_DASH_STAMINA_COST * burden);
  }

  if (dt <= 0) return s;

  const canRun = s > PLAYER_STAMINA_WALK_CAP;
  const isRunning = input.onFoot && input.moving && input.running && canRun;

  if (isRunning) {
    const effort = 0.35 + 0.65 * (s / PLAYER_STAMINA_MAX);
    const perSec = 32 * effort * burden;
    return clampPlayerStamina(s - perSec * dt);
  }

  // Rest on mount is fastest; walk regenerates slower than stand.
  let regenBase = 36;
  if (!input.onFoot) regenBase = 48;
  else if (input.moving) regenBase = 22;
  return clampPlayerStamina(s + regenBase * dt);
}

/**
 * Foot move speed from combat baseSpeed.
 * ≤ walk cap → walk; above → lerp to full run × weight.
 */
export function footMoveSpeed(
  baseSpeed: number,
  stamina: number,
  carryWeightKg: number,
  race?: string,
): number {
  const s = clampPlayerStamina(stamina);
  const weightF = playerWeightSpeedFactor(carryWeightKg, race);
  const fullSpeed = baseSpeed * weightF;
  const walkSpeed = fullSpeed * 0.58;
  if (s <= PLAYER_STAMINA_WALK_CAP) return walkSpeed;
  const t = (s - PLAYER_STAMINA_WALK_CAP) / (PLAYER_STAMINA_MAX - PLAYER_STAMINA_WALK_CAP);
  return walkSpeed + (fullSpeed - walkSpeed) * t;
}

export function playerCanRun(stamina: number): boolean {
  return clampPlayerStamina(stamina) > PLAYER_STAMINA_WALK_CAP;
}

export function playerCanDash(stamina: number): boolean {
  return clampPlayerStamina(stamina) >= PLAYER_DASH_MIN_STAMINA;
}

/** Усталость: ниже порога бега удары менее точные. */
export function attackFatigueAccuracyPenalty(stamina: number): number {
  return clampPlayerStamina(stamina) <= PLAYER_STAMINA_WALK_CAP ? 12 : 0;
}

/** Усталость: ниже порога бега удары слабее. */
export function attackFatigueDamageMult(stamina: number): number {
  return clampPlayerStamina(stamina) <= PLAYER_STAMINA_WALK_CAP ? 0.88 : 1;
}
