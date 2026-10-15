import type { CollisionWorld } from '@empery/shared/world-collision';
import type { MultiplayerEnemyPresence, MultiplayerEnemySnapshot } from '@empery/shared';
import { activeMobControl, expireMobControl } from '@empery/shared';
import type { EncounterEntity, LocationEncounter } from './encounter.js';

/** Базовый агро (мобы ниже 30 ур.). */
export const ENEMY_AGGRO_RANGE = 240;
export const ENEMY_LEASH_RANGE = 320;
export const ENEMY_STOP_RANGE = 24;

/** С этого уровня — сильно расширенный агро. */
export const HIGH_LEVEL_AGGRO_MIN = 30;

/** Сколько мс после атаки игрока мобы «слышат» бой. */
export const COMBAT_STIMULUS_MS = 2800;

export interface SimPlayer {
  saveId: string;
  x: number;
  y: number;
  level?: number;
  /** Игрок недавно бил (PvE/PvP) — усиливает агро высоких мобов. */
  combatActive?: boolean;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Радиус обнаружения цели. */
export function aggroRangeFor(entityLevel: number, combatNearby: boolean): number {
  if (entityLevel < HIGH_LEVEL_AGGRO_MIN) {
    return combatNearby ? Math.round(ENEMY_AGGRO_RANGE * 1.25) : ENEMY_AGGRO_RANGE;
  }
  const over = entityLevel - HIGH_LEVEL_AGGRO_MIN;
  // 30 → 560, 40 → 660, 50+ → 760
  const base = 560 + Math.min(200, over * 10);
  return combatNearby ? Math.round(base * 1.55) : base;
}

/** Дистанция срыва агро. */
export function leashRangeFor(entityLevel: number, combatNearby: boolean): number {
  if (entityLevel < HIGH_LEVEL_AGGRO_MIN) {
    return combatNearby ? Math.round(ENEMY_LEASH_RANGE * 1.25) : ENEMY_LEASH_RANGE;
  }
  return Math.round(aggroRangeFor(entityLevel, combatNearby) * 1.4);
}

/** Рядом с мобом идёт атака (игрок с combatActive в зоне слуха). */
export function combatStimulusNear(
  entity: EncounterEntity,
  players: SimPlayer[],
): boolean {
  const hear = aggroRangeFor(entity.level, false) * 1.35;
  for (const player of players) {
    if (!player.combatActive) continue;
    if (dist(entity.x, entity.y, player.x, player.y) <= hear) return true;
  }
  return false;
}

function pickTarget(entity: EncounterEntity, players: SimPlayer[]): SimPlayer | null {
  const combatNearby = combatStimulusNear(entity, players);
  const leash = leashRangeFor(entity.level, combatNearby);
  const aggro = aggroRangeFor(entity.level, combatNearby);

  if (entity.aggroSaveId) {
    const current = players.find((p) => p.saveId === entity.aggroSaveId);
    if (current && dist(entity.x, entity.y, current.x, current.y) <= leash) {
      return current;
    }
    entity.aggroSaveId = undefined;
  }

  let best: SimPlayer | null = null;
  let bestDist = aggro;
  for (const player of players) {
    const d = dist(entity.x, entity.y, player.x, player.y);
    if (d < bestDist) {
      best = player;
      bestDist = d;
    }
  }
  if (best) entity.aggroSaveId = best.saveId;
  return best;
}

export function tickEncounter(encounter: LocationEncounter, players: SimPlayer[], dtMs: number, geometry?:CollisionWorld): void {
  const dt = Math.max(0, dtMs) / 1000;
  const now = Date.now();
  for (const entity of encounter.entities.values()) {
    if (!entity.alive) continue;
    expireMobControl(entity, now);
    const stunned = entity.control?.kind === 'stun';
    const target = pickTarget(entity, players);
    if (!target) {
      entity.moving = false;
      continue;
    }

    const dx = target.x - entity.x;
    const dy = target.y - entity.y;
    const range = Math.hypot(dx, dy) || 1;
    if (stunned || range <= ENEMY_STOP_RANGE) {
      entity.moving = false;
      if (!stunned) entity.facing = dx < 0 ? 'left' : 'right';
      continue;
    }

    const travel = Math.min(entity.speed * dt, range - ENEMY_STOP_RANGE);
    const before={x:entity.x,y:entity.y};
    const next=geometry?geometry.move(geometry.nearestWalkable(before),dx,dy,travel,1):{x:entity.x+dx/range*travel,y:entity.y+dy/range*travel};
    entity.x=next.x;entity.y=next.y;
    entity.facing = dx < 0 ? 'left' : 'right';
    entity.moving = Math.hypot(entity.x-before.x,entity.y-before.y)>0.05;
  }
}

export function serializeEnemyPresence(entity: EncounterEntity): MultiplayerEnemyPresence {
  const now = Date.now();
  expireMobControl(entity, now);
  return {
    entityId: entity.entityId,
    type: entity.type,
    level: entity.level,
    hp: entity.hp,
    maxHp: entity.maxHp,
    speed: entity.speed,
    x: Math.round(entity.x),
    y: Math.round(entity.y),
    quest: entity.quest,
    facing: entity.facing,
    moving: entity.moving,
    alive: entity.alive,
    control: activeMobControl(entity, now),
  };
}

export function buildEnemySnapshot(encounter: LocationEncounter): MultiplayerEnemySnapshot {
  return {
    locationId: encounter.locationId,
    encounterId: encounter.encounterId,
    enemies: [...encounter.entities.values()]
      .filter((entity) => entity.alive)
      .map(serializeEnemyPresence),
    generatedAt: Date.now(),
  };
}
