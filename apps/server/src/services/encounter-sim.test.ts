import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import {
  startEncounter,
  getEncounter,
  markEntityDead,
  processFarmRespawns,
  resetEncountersForTests,
} from './encounter.js';
import {
  ENEMY_AGGRO_RANGE,
  ENEMY_STOP_RANGE,
  aggroRangeFor,
  buildEnemySnapshot,
  tickEncounter,
} from './encounter-sim.js';
import { applyMobControl } from '@empery/shared';

let seq = 0;

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  seq += 1;
  return applyStatsToSave({
    id: `sim-test-save-${seq}`,
    name: `Sim${seq}`,
    race: 'human',
    profession: 'warrior',
    level: 5,
    xp: 0,
    hp: 100,
    maxHp: 100,
    location: 'adena_fields',
    adena: 0,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

beforeEach(() => {
  resetEncountersForTests();
});

describe('encounter-sim', () => {
  it('moves enemy toward nearest player in aggro range', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const mob = enc.entities.get(entities[0]!.entityId)!;
    const startX = mob.x;
    const startY = mob.y;

    tickEncounter(
      enc,
      [{ saveId: save.id, x: startX + 100, y: startY, level: 5 }],
      200,
    );

    expect(mob.x).toBeGreaterThan(startX);
    expect(mob.moving).toBe(true);
    expect(mob.facing).toBe('right');
  });

  it('does not chase players outside aggro range', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const mob = enc.entities.get(entities[0]!.entityId)!;
    const startX = mob.x;
    const startY = mob.y;

    tickEncounter(
      enc,
      [{ saveId: save.id, x: startX + ENEMY_AGGRO_RANGE + 40, y: startY, level: 5 }],
      200,
    );

    expect(mob.x).toBe(startX);
    expect(mob.moving).toBe(false);
  });

  it('stops near the target instead of overshooting', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const mob = enc.entities.get(entities[0]!.entityId)!;
    const targetX = mob.x + ENEMY_STOP_RANGE + 2;
    const targetY = mob.y;

    for (let i = 0; i < 40; i++) {
      tickEncounter(enc, [{ saveId: save.id, x: targetX, y: targetY, level: 5 }], 50);
    }

    const d = Math.hypot(mob.x - targetX, mob.y - targetY);
    expect(d).toBeLessThanOrEqual(ENEMY_STOP_RANGE + 0.5);
    expect(mob.moving).toBe(false);
  });

  it('keeps sticky aggro while target stays in leash', () => {
    const saveA = baseSave({ id: 'aggro-a', name: 'A' });
    const saveB = baseSave({ id: 'aggro-b', name: 'B' });
    const { encounterId, entities } = startEncounter(saveA, 'adena_fields');
    startEncounter(saveB, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const mob = enc.entities.get(entities[0]!.entityId)!;

    tickEncounter(
      enc,
      [
        { saveId: saveA.id, x: mob.x + 80, y: mob.y, level: 5 },
        { saveId: saveB.id, x: mob.x + 60, y: mob.y, level: 5 },
      ],
      50,
    );
    expect(mob.aggroSaveId).toBe(saveB.id);

    tickEncounter(
      enc,
      [
        { saveId: saveA.id, x: mob.x + 50, y: mob.y, level: 5 },
        { saveId: saveB.id, x: mob.x + 90, y: mob.y, level: 5 },
      ],
      50,
    );
    expect(mob.aggroSaveId).toBe(saveB.id);
  });

  it('high-level mobs aggro from much farther', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const mob = enc.entities.get(entities[0]!.entityId)!;
    mob.level = 32;
    const startX = mob.x;
    const far = ENEMY_AGGRO_RANGE + 80;
    expect(aggroRangeFor(32, false)).toBeGreaterThan(far);

    tickEncounter(enc, [{ saveId: save.id, x: startX + far, y: mob.y, level: 20 }], 200);
    expect(mob.moving).toBe(true);
    expect(mob.aggroSaveId).toBe(save.id);
  });

  it('combat nearby expands aggro further for high-level mobs', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const mob = enc.entities.get(entities[0]!.entityId)!;
    mob.level = 32;
    const startX = mob.x;
    const quietRange = aggroRangeFor(32, false);
    const combatRange = aggroRangeFor(32, true);
    expect(combatRange).toBeGreaterThan(quietRange);

    const mid = Math.round((quietRange + combatRange) / 2);
    tickEncounter(enc, [{ saveId: save.id, x: startX + mid, y: mob.y, level: 20 }], 50);
    expect(mob.aggroSaveId).toBeUndefined();

    tickEncounter(
      enc,
      [{ saveId: save.id, x: startX + mid, y: mob.y, level: 20, combatActive: true }],
      50,
    );
    expect(mob.aggroSaveId).toBe(save.id);
  });

  it('schedules and processes farm respawn after death', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const mob = enc.entities.get(entities[0]!.entityId)!;
    const before = [...enc.entities.values()].filter((e) => e.alive).length;

    markEntityDead(enc, mob, Date.now());
    expect(mob.alive).toBe(false);
    expect(enc.farmRespawnAt.length).toBe(1);

    const spawned = processFarmRespawns(enc, save.level, Date.now() + 10_000);
    expect(spawned.length).toBe(1);
    expect([...enc.entities.values()].filter((e) => e.alive).length).toBe(before);
  });

  it('builds enemy snapshot with only alive entities', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const mob = enc.entities.get(entities[0]!.entityId)!;
    markEntityDead(enc, mob);

    const snap = buildEnemySnapshot(enc);
    expect(snap.encounterId).toBe(encounterId);
    expect(snap.enemies.every((e) => e.alive)).toBe(true);
    expect(snap.enemies.some((e) => e.entityId === mob.entityId)).toBe(false);
  });

  it('stunned mob does not walk and snapshot reports control', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const mob = enc.entities.get(entities[0]!.entityId)!;
    const startX = mob.x;
    applyMobControl(mob, 'stun', Date.now());
    tickEncounter(
      enc,
      [{ saveId: save.id, x: startX + 100, y: mob.y, level: 5 }],
      200,
    );
    expect(mob.x).toBe(startX);
    expect(mob.moving).toBe(false);
    const snap = buildEnemySnapshot(enc);
    const dto = snap.enemies.find((e) => e.entityId === mob.entityId);
    expect(dto?.control).toBe('stun');
    expect(dto?.speed).toBe(0);
  });
});
