import { randomUUID } from 'node:crypto';
import type { PlayerSave } from '@empery/shared';
import type { MobControlState } from '@empery/shared';
import { getScaledEnemy, getEnemy } from './enemies.js';
import { getLocation, type LocationDefinition, type LocationEnemySpawn } from './locations.js';

export interface EncounterEntity {
  entityId: string;
  type: string;
  level: number;
  hp: number;
  maxHp: number;
  speed: number;
  x: number;
  y: number;
  quest: boolean;
  alive: boolean;
  facing: 'left' | 'right';
  moving: boolean;
  aggroSaveId?: string;
  dot?: { sourceSaveId: string; tickDamage: number; tickMs: number; nextTickAt: number; expiresAt: number };
  /** Server attack cooldown, shared by online and disconnected targets. */
  nextAttackAt?: number;
  /** Accumulated PvE damage by attacker saveId (L2 loot rights). */
  damageBySaveId?: Record<string, number>;
  /** Метка лучника (marking_shot). */
  mark?: { saveId: string; untilMs: number };
  /** Pin / stun: скорость мутируется, restoreSpeed — база. */
  control?: MobControlState;
}

export interface LocationEncounter {
  encounterId: string;
  locationId: string;
  entities: Map<string, EncounterEntity>;
  createdAt: number;
  questFlagsSpawned: Set<string>;
  participants: Set<string>;
  farmRespawnAt: number[];
  comboBySaveId: Map<string, { count: number; lastHitAt: number }>;
}

/** Уровень моба фиксирован контентом (или override в спавне), не уровнем игрока. */
function spawnLevelFor(spawn: LocationEnemySpawn, farmLevel?: number): number {
  if (spawn.level && spawn.level > 0) return Math.floor(spawn.level);
  if (farmLevel && farmLevel > 0) return Math.floor(farmLevel);
  const base = getEnemy(spawn.type)?.level;
  return Math.max(1, base ?? 1);
}

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

function buildEntity(
  _locationId: string,
  spawn: LocationEnemySpawn,
  quest: boolean,
  farmLevel?: number,
): EncounterEntity {
  const level = spawnLevelFor(spawn, farmLevel);
  const scaled = getScaledEnemy(spawn.type, level);
  const hp = scaled?.hp ?? 40;
  return {
    entityId: randomUUID(),
    type: spawn.type,
    level,
    hp,
    maxHp: hp,
    speed: scaled?.speed ?? (spawn.type === 'shadow_thug' ? 115 : quest ? 105 : 85),
    x: spawn.x,
    y: spawn.y,
    quest,
    alive: true,
    facing: 'right',
    moving: false,
  };
}

const encounters = new Map<string, LocationEncounter>();
const bySave = new Map<string, string>();
const byLocation = new Map<string, string>();

export function resetEncountersForTests(): void {
  encounters.clear();
  bySave.clear();
  byLocation.clear();
}

export function invalidateEncounterForSave(saveId: string): void {
  const id = bySave.get(saveId);
  if (!id) return;
  bySave.delete(saveId);
  const encounter = encounters.get(id);
  if (!encounter) return;
  encounter.participants.delete(saveId);
  if (encounter.participants.size === 0) {
    encounters.delete(id);
    if (byLocation.get(encounter.locationId) === id) byLocation.delete(encounter.locationId);
  }
}

/** Полностью сбросить encounter локации (админка). */
export function resetEncounterForLocation(locationId: string): boolean {
  const id = byLocation.get(locationId);
  if (!id) return false;
  const encounter = encounters.get(id);
  if (encounter) {
    for (const saveId of encounter.participants) {
      bySave.delete(saveId);
    }
    encounters.delete(id);
  }
  byLocation.delete(locationId);
  return true;
}

export function getEncounter(encounterId: string): LocationEncounter | undefined {
  return encounters.get(encounterId);
}

export function getEncounterForLocation(locationId: string): LocationEncounter | undefined {
  const id = byLocation.get(locationId);
  return id ? encounters.get(id) : undefined;
}

export function listActiveEncounters(): LocationEncounter[] {
  return [...encounters.values()];
}

export function encounterHasParticipant(encounter: LocationEncounter | undefined, saveId: string): boolean {
  return Boolean(encounter && encounter.participants.has(saveId));
}

export function startEncounter(save: PlayerSave, locationId: string): {
  encounterId: string;
  entities: Omit<EncounterEntity, 'alive'>[];
} {
  if (save.location !== locationId) throw new Error('Персонаж находится в другой локации');
  invalidateEncounterForSave(save.id);
  const loc = getLocation(locationId);
  if (!loc) {
    throw new Error('Location not found');
  }

  const existingId = byLocation.get(locationId);
  const existing = existingId ? encounters.get(existingId) : undefined;
  if (existing) {
    existing.participants.add(save.id);
    bySave.set(save.id, existing.encounterId);
    syncQuestSpawns(existing.encounterId, save);
    return {
      encounterId: existing.encounterId,
      entities: [...existing.entities.values()]
        .filter((e) => e.alive)
        .map(({ alive: _a, ...rest }) => rest),
    };
  }

  const entities = new Map<string, EncounterEntity>();
  const questFlagsSpawned = new Set<string>();
  collectSpawns(loc, save, questFlagsSpawned).forEach((e) => entities.set(e.entityId, e));

  const encounterId = randomUUID();
  encounters.set(encounterId, {
    encounterId,
    locationId,
    entities,
    createdAt: Date.now(),
    questFlagsSpawned,
    participants: new Set([save.id]),
    farmRespawnAt: [],
    comboBySaveId: new Map(),
  });
  bySave.set(save.id, encounterId);
  byLocation.set(locationId, encounterId);

  return {
    encounterId,
    entities: [...entities.values()].filter((e) => e.alive).map(({ alive: _a, ...rest }) => rest),
  };
}

function collectSpawns(
  loc: LocationDefinition,
  save: PlayerSave,
  questFlagsSpawned: Set<string>,
): EncounterEntity[] {
  const out: EncounterEntity[] = [];

  if (loc.farmSpawn) {
    const farm = loc.farmSpawn;
    const initial = Math.min(farm.maxAlive, farm.points.length);
    for (let i = 0; i < initial; i++) {
      const pt = farm.points[i]!;
      out.push(
        buildEntity(loc.id, { type: farm.type, x: pt.x, y: pt.y, level: farm.level }, false, farm.level),
      );
    }
  }

  for (const spawn of loc.enemies ?? []) {
    if (spawn.quest) continue;
    out.push(buildEntity(loc.id, spawn, false));
  }

  for (const group of loc.questSpawns ?? []) {
    if (!hasFlag(save, group.activeFlag)) continue;
    questFlagsSpawned.add(group.activeFlag);
    for (const spawn of group.enemies) {
      out.push(buildEntity(loc.id, spawn, spawn.quest ?? true));
    }
  }

  return out;
}

/** Spawn quest groups that became active after encounter start.
 *  Если пачка уже была выбита (флаг в questFlagsSpawned, но живых нет) —
 *  респавним для участника, у которого квест ещё активен. */
export function syncQuestSpawns(
  encounterId: string,
  save: PlayerSave,
): Omit<EncounterEntity, 'alive'>[] {
  const encounter = getEncounter(encounterId);
  if (!encounter || !encounterHasParticipant(encounter, save.id) || encounter.locationId !== save.location) return [];
  const loc = getLocation(encounter.locationId);
  if (!loc) return [];

  const added: EncounterEntity[] = [];
  for (const group of loc.questSpawns ?? []) {
    if (!hasFlag(save, group.activeFlag)) continue;
    if (groupHasAliveQuestEnemy(encounter, group)) {
      encounter.questFlagsSpawned.add(group.activeFlag);
      continue;
    }
    encounter.questFlagsSpawned.add(group.activeFlag);
    for (const spawn of group.enemies) {
      const entity = buildEntity(loc.id, spawn, spawn.quest ?? true);
      encounter.entities.set(entity.entityId, entity);
      added.push(entity);
    }
  }
  return added.map(({ alive: _a, ...rest }) => rest);
}

function groupHasAliveQuestEnemy(
  encounter: LocationEncounter,
  group: { enemies: LocationEnemySpawn[] },
): boolean {
  const types = new Set(group.enemies.map((e) => e.type));
  if (types.size === 0) return false;
  for (const entity of encounter.entities.values()) {
    if (!entity.alive || !entity.quest) continue;
    if (types.has(entity.type)) return true;
  }
  return false;
}

/** Respawn one farm mob into an existing encounter. */
export function respawnFarmEntity(encounter: LocationEncounter): EncounterEntity | null {
  const loc = getLocation(encounter.locationId);
  if (!loc?.farmSpawn) return null;
  const farm = loc.farmSpawn;
  const alive = [...encounter.entities.values()].filter((e) => e.alive && e.type === farm.type).length;
  if (alive >= farm.maxAlive) return null;
  const pt = farm.points[Math.floor(Math.random() * farm.points.length)];
  if (!pt) return null;
  const entity = buildEntity(
    loc.id,
    { type: farm.type, x: pt.x, y: pt.y, level: farm.level },
    false,
    farm.level,
  );
  encounter.entities.set(entity.entityId, entity);
  return entity;
}

export function markEntityDead(encounter: LocationEncounter, entity: EncounterEntity, now = Date.now()): void {
  entity.alive = false;
  entity.hp = 0;
  entity.moving = false;
  entity.aggroSaveId = undefined;
  entity.control = undefined;
  // Keep damageBySaveId until loot is resolved by the kill handler, then clear.
  const loc = getLocation(encounter.locationId);
  if (!loc?.farmSpawn || entity.type !== loc.farmSpawn.type) return;
  encounter.farmRespawnAt.push(now + (loc.farmSpawn.respawnMs ?? 2500));
}

export function processFarmRespawns(
  encounter: LocationEncounter,
  _playerLevel?: number,
  now = Date.now(),
): EncounterEntity[] {
  const spawned: EncounterEntity[] = [];
  encounter.farmRespawnAt.sort((a, b) => a - b);
  while (encounter.farmRespawnAt.length > 0 && encounter.farmRespawnAt[0]! <= now) {
    encounter.farmRespawnAt.shift();
    const entity = respawnFarmEntity(encounter);
    if (entity) spawned.push(entity);
  }
  return spawned;
}
