import type { PlayerSave } from '@empery/shared';
import {
  PLAYER_STAMINA_MAX,
  PLAYER_PERFECT_DODGE_STAMINA_GAIN,
  advancePlayerStamina,
  clampPlayerStamina,
  combatStaminaCost,
  footMoveSpeed,
  playerCanRun,
} from '@empery/shared';
import { saveCarryWeight } from './mounts.js';

export function normalizePlayerStamina(save: PlayerSave): {
  stamina: number;
  staminaAt: string | null;
} {
  const stamina = clampPlayerStamina(
    typeof save.stamina === 'number' ? save.stamina : PLAYER_STAMINA_MAX,
  );
  const staminaAt =
    typeof save.staminaAt === 'string' && save.staminaAt.length > 0 ? save.staminaAt : null;
  return { stamina, staminaAt };
}

/** Passive regen between sessions / while mounted rest assumed idle. */
export function refreshPlayerStamina(
  save: PlayerSave,
  now = Date.now(),
  carryWeightKg?: number,
): PlayerSave {
  const { stamina, staminaAt } = normalizePlayerStamina(save);
  const last = staminaAt ? Date.parse(staminaAt) : now;
  const dtSec = Math.max(0, (now - last) / 1000);
  if (dtSec < 0.05) {
    return { ...save, stamina, staminaAt };
  }
  const mounted = Boolean(save.mount?.mounted && save.mount?.ownedId);
  const carry = carryWeightKg ?? saveCarryWeight(save).totalKg;
  const next = advancePlayerStamina({
    stamina,
    dtSec,
    onFoot: !mounted,
    moving: false,
    running: false,
    carryWeightKg: carry,
    race: save.race,
  });
  return {
    ...save,
    stamina: next,
    staminaAt: new Date(now).toISOString(),
  };
}

export function setPlayerStamina(save: PlayerSave, stamina: number, now = Date.now()): PlayerSave {
  return {
    ...save,
    stamina: clampPlayerStamina(stamina),
    staminaAt: new Date(now).toISOString(),
  };
}

export function footSpeedForSave(
  save: PlayerSave,
  baseSpeed: number,
  carryWeightKg?: number,
): number {
  const { stamina } = normalizePlayerStamina(save);
  const carry = carryWeightKg ?? saveCarryWeight(save).totalKg;
  return footMoveSpeed(baseSpeed, stamina, carry, save.race);
}

export function playerStaminaOf(save: PlayerSave): number {
  return normalizePlayerStamina(save).stamina;
}

export function playerCanRunOf(save: PlayerSave): boolean {
  return playerCanRun(normalizePlayerStamina(save).stamina);
}

export function spendCombatStamina(
  save: PlayerSave,
  isSkill: boolean,
  now = Date.now(),
): PlayerSave {
  const refreshed = refreshPlayerStamina(save, now);
  const cost = combatStaminaCost(isSkill);
  return setPlayerStamina(refreshed, playerStaminaOf(refreshed) - cost, now);
}

export function grantPerfectDodgeStamina(save: PlayerSave, now = Date.now()): PlayerSave {
  const refreshed = refreshPlayerStamina(save, now);
  return setPlayerStamina(
    refreshed,
    playerStaminaOf(refreshed) + PLAYER_PERFECT_DODGE_STAMINA_GAIN,
    now,
  );
}
