import type { PlayerSave, PvpStatus } from '@empery/shared';

export const PVP_FLAG_MS = 120_000;
export const PVP_RANGE = 56;
/** Карма за убийство мирного (karma===0). */
export const PVP_KARMA_PER_LEVEL = 50;
/** Снятие кармы за убийство моба. */
export const PVP_KARMA_DECAY_ON_MOB = 40;

export type PvpRejectCode =
  | 'SAFE_ZONE'
  | 'SAME_PARTY'
  | 'OUT_OF_RANGE'
  | 'DEAD'
  | 'SELF'
  | 'OFFLINE'
  | 'LOCATION';

export function playerKarma(save: PlayerSave): number {
  return Math.max(0, Math.floor(save.karma ?? 0));
}

export function isChaotic(save: PlayerSave): boolean {
  return playerKarma(save) > 0;
}

export function resolvePvpStatus(opts: {
  karma: number;
  flagUntilMs: number;
  now?: number;
}): PvpStatus {
  if (opts.karma > 0) return 'chaotic';
  const now = opts.now ?? Date.now();
  if (opts.flagUntilMs > now) return 'flagged';
  return 'peaceful';
}

export function flagRemainingMs(flagUntilMs: number, now = Date.now()): number {
  return Math.max(0, flagUntilMs - now);
}

export function refreshFlagUntil(now = Date.now()): number {
  return now + PVP_FLAG_MS;
}

export function karmaForPeacefulKill(victimLevel: number): number {
  return Math.max(100, victimLevel * PVP_KARMA_PER_LEVEL);
}

export function applyKillCounters(
  killer: PlayerSave,
  victim: PlayerSave,
  opts?: { victimInnocent?: boolean },
): PlayerSave {
  const victimInnocent =
    opts?.victimInnocent ?? playerKarma(victim) === 0;
  if (victimInnocent) {
    const add = karmaForPeacefulKill(victim.level);
    return {
      ...killer,
      karma: playerKarma(killer) + add,
      pkCount: Math.max(0, Math.floor(killer.pkCount ?? 0)) + 1,
    };
  }
  return {
    ...killer,
    pvpCount: Math.max(0, Math.floor(killer.pvpCount ?? 0)) + 1,
  };
}

export function isInnocentForPk(karma: number, flagUntilMs: number, now = Date.now()): boolean {
  if (karma > 0) return false;
  if (flagUntilMs > now) return false;
  return true;
}

export function decayKarmaOnMobKill(save: PlayerSave, amount = PVP_KARMA_DECAY_ON_MOB): PlayerSave {
  const karma = playerKarma(save);
  if (karma <= 0) return save;
  return { ...save, karma: Math.max(0, karma - amount) };
}

export function distance2d(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

export function canAttackPlayer(opts: {
  attackerId: string;
  targetId: string;
  safeZone: boolean;
  sameParty: boolean;
  sameLocation: boolean;
  attackerHp: number;
  targetHp: number;
  distance: number;
  range?: number;
}): { ok: true } | { ok: false; code: PvpRejectCode; error: string } {
  if (opts.attackerId === opts.targetId) {
    return { ok: false, code: 'SELF', error: 'Нельзя атаковать себя' };
  }
  if (opts.safeZone) {
    return { ok: false, code: 'SAFE_ZONE', error: 'Нельзя в городе' };
  }
  if (opts.sameParty) {
    return { ok: false, code: 'SAME_PARTY', error: 'Нельзя бить члена пати' };
  }
  if (!opts.sameLocation) {
    return { ok: false, code: 'LOCATION', error: 'Игрок в другой локации' };
  }
  if (opts.attackerHp <= 0) {
    return { ok: false, code: 'DEAD', error: 'Ты мёртв' };
  }
  if (opts.targetHp <= 0) {
    return { ok: false, code: 'DEAD', error: 'Цель уже мертва' };
  }
  const range = opts.range ?? PVP_RANGE;
  if (opts.distance > range) {
    return { ok: false, code: 'OUT_OF_RANGE', error: 'Слишком далеко' };
  }
  return { ok: true };
}

export function pvpRejectMessage(code: PvpRejectCode): string {
  switch (code) {
    case 'SAFE_ZONE':
      return 'Нельзя в городе';
    case 'SAME_PARTY':
      return 'Нельзя бить члена пати';
    case 'OUT_OF_RANGE':
      return 'Слишком далеко';
    case 'DEAD':
      return 'Нельзя атаковать';
    case 'SELF':
      return 'Нельзя атаковать себя';
    case 'OFFLINE':
      return 'Игрок не в сети';
    case 'LOCATION':
      return 'Игрок в другой локации';
    default:
      return 'Атака отклонена';
  }
}
