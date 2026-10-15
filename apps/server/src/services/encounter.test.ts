import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { applyStatsToSave } from './stats.js';
import {
  startEncounter,
  getEncounter,
  invalidateEncounterForSave,
  respawnFarmEntity,
  resetEncountersForTests,
  syncQuestSpawns,
  markEntityDead,
} from './encounter.js';
import { resolveBatchAttack, resolveBleedKill } from './batch-combat.js';
import { QuestService } from './quests.js';

let seq = 0;

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  const now = new Date().toISOString();
  seq += 1;
  return applyStatsToSave({
    id: `enc-test-save-${seq}`,
    name: `Tester${seq}`,
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

const quests = new QuestService();

beforeEach(() => {
  resetEncountersForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LocationEncounter', () => {
  it('starts encounter with farm entities for adena_fields', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    expect(encounterId).toBeTruthy();
    expect(entities.length).toBeGreaterThan(0);
    expect(entities.every((e) => e.type === 'field_scavenger')).toBe(true);
    const enc = getEncounter(encounterId);
    expect(enc?.participants.has(save.id)).toBe(true);
  });

  it('reuses the same location encounter for multiple players', () => {
    const firstSave = baseSave({ id: 'save-a', name: 'A' });
    const secondSave = baseSave({ id: 'save-b', name: 'B' });
    const first = startEncounter(firstSave, 'adena_fields');
    const second = startEncounter(secondSave, 'adena_fields');
    expect(first.encounterId).toBe(second.encounterId);
    const enc = getEncounter(first.encounterId)!;
    expect(enc.participants.has(firstSave.id)).toBe(true);
    expect(enc.participants.has(secondSave.id)).toBe(true);
  });

  it('batch-attack resolves multiple targets with one save write path', () => {
    const save = baseSave({ location: 'adena_fields' });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const targets = entities.slice(0, 2).map((e) => e.entityId);
    const result = resolveBatchAttack(save, encounterId, targets, { nearbyEnemyCount: 2, playerX:entities[0]!.x,playerY:entities[0]!.y }, quests);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.save.id).toBe(save.id);
  });

  it('returns insufficientMp once for mystic skill without draining multiple times', () => {
    let save = baseSave({
      profession: 'mystic',
      skillLevels: { flame_burst: 1 },
      location: 'adena_fields',
    });
    save = { ...save, mp: 0 };
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const targets = entities.slice(0, 3).map((e) => e.entityId);
    const result = resolveBatchAttack(
      save,
      encounterId,
      targets,
      { skillId: 'flame_burst', nearbyEnemyCount: 3, playerX:entities[0]!.x,playerY:entities[0]!.y },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.insufficientMp).toBe(true);
    expect(result.hits).toHaveLength(0);
  });

  it('single-target skill hits only the primary even if several ids are sent', () => {
    const save = baseSave({
      profession: 'warrior',
      skillLevels: { power_strike: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const targets = entities.slice(0, 2).map((e) => e.entityId);
    expect(targets.length).toBe(2);
    const result = resolveBatchAttack(
      save,
      encounterId,
      targets,
      { skillId: 'power_strike', nearbyEnemyCount: 2,playerX:entities[0]!.x,playerY:entities[0]!.y },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.skillOnCooldown).toBeUndefined();
    expect(result.hits.length).toBe(1);
  });

  it.each([0.5,0.999])('cleave preserves splash target roles for hit/miss roll %s', (roll) => {
    const save = baseSave({
      profession: 'warrior',
      skillLevels: { cleave: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const targets = entities.slice(0, 3).map((e) => e.entityId);
    const px = 400;
    const py = 400;
    for (const id of targets) {
      const ent = enc.entities.get(id)!;
      ent.x = px + 10;
      ent.y = py;
    }
    vi.spyOn(Math,'random').mockReturnValue(roll);
    const result = resolveBatchAttack(
      save,
      encounterId,
      targets,
      { skillId: 'cleave', nearbyEnemyCount: 3, playerX: px, playerY: py },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.hits.length).toBeGreaterThan(1);
    expect(result.hits.some((h) => h.cleaveSplash)).toBe(true);
    expect(result.hits.filter((h) => !h.cleaveSplash).length).toBe(1);
  });

  it('war_cry cleaves a pack', () => {
    const save = baseSave({
      profession: 'warrior',
      skillLevels: { war_cry: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const targets = entities.slice(0, 3).map((e) => e.entityId);
    const px = 400;
    const py = 400;
    for (const id of targets) {
      const ent = enc.entities.get(id)!;
      ent.x = px + 10;
      ent.y = py;
    }
    const result = resolveBatchAttack(
      save,
      encounterId,
      targets,
      { skillId: 'war_cry', nearbyEnemyCount: 3, playerX: px, playerY: py },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.hits.length).toBeGreaterThan(1);
    expect(result.hits.some((h) => h.cleaveSplash)).toBe(true);
  });

  it('pyre_burst is stronger in melee than at range', () => {
    const save = baseSave({
      profession: 'mystic',
      skillLevels: { pyre_burst: 1 },
      mp: 80,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.hp = 4000;
    entity.maxHp = 4000;
    entity.x = 200;
    entity.y = 200;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const close = resolveBatchAttack(
      save,
      encounterId,
      [entity.entityId],
      {
        skillId: 'pyre_burst',
        chargeAttack: true,
        playerX: 230,
        playerY: 200,
      },
      quests,
    );
    expect('error' in close).toBe(false);
    if ('error' in close) return;
    expect(close.hits[0]?.pyre).toBe(true);
    expect(close.hits[0]?.hit).toBe(true);

    const farSave = applyStatsToSave({
      ...close.save,
      skillCooldowns: {},
      mp: 80,
    });
    const far = resolveBatchAttack(
      farSave,
      encounterId,
      [entity.entityId],
      {
        skillId: 'pyre_burst',
        chargeAttack: true,
        playerX: 200 + 175,
        playerY: 200,
      },
      quests,
    );
    expect('error' in far).toBe(false);
    if ('error' in far) return;
    expect(far.hits[0]?.pyre).toBeUndefined();
    expect(far.hits[0]?.hit).toBe(true);
    expect(close.hits[0]!.damage).toBeGreaterThan(far.hits[0]!.damage);
  });

  it('obliterate fails while the target is above the HP gate', () => {
    const save = baseSave({
      profession: 'rogue',
      skillLevels: { obliterate: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.hp = entity.maxHp;
    entity.x = 200;
    entity.y = 200;
    const result = resolveBatchAttack(
      save,
      encounterId,
      [entity.entityId],
      { skillId: 'obliterate', playerX: 210, playerY: 200 },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.skillRequireFailed).toBe('execute');
    expect(result.save.skillCooldowns.obliterate).toBeUndefined();
  });

  it('rain of arrows cleaves a pack like melee cleave', () => {
    const save = baseSave({
      profession: 'archer',
      skillLevels: { rain_of_arrows: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const targets = entities.slice(0, 3).map((e) => e.entityId);
    const px = 400;
    const py = 400;
    for (const id of targets) {
      const ent = enc.entities.get(id)!;
      ent.x = px + 10;
      ent.y = py;
    }
    const result = resolveBatchAttack(
      save,
      encounterId,
      targets,
      { skillId: 'rain_of_arrows', nearbyEnemyCount: 3, playerX: px, playerY: py },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.hits.length).toBeGreaterThan(1);
    expect(result.hits.some((h) => h.cleaveSplash)).toBe(true);
  });

  it('marking_shot writes a mark that buffs the next guaranteed hit', () => {
    const save = baseSave({
      profession: 'archer',
      skillLevels: { marking_shot: 1, power_shot: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.hp = 4000;
    entity.maxHp = 4000;
    entity.x = 200;
    entity.y = 200;
    const marked = resolveBatchAttack(
      save,
      encounterId,
      [entity.entityId],
      {
        skillId: 'marking_shot',
        chargeAttack: true,
        playerX: 220,
        playerY: 200,
      },
      quests,
    );
    expect('error' in marked).toBe(false);
    if ('error' in marked) return;
    expect(marked.hits[0]?.markApplied).toBe(true);
    expect(entity.mark?.saveId).toBe(save.id);

    const follow = resolveBatchAttack(
      marked.save,
      encounterId,
      [entity.entityId],
      { chargeAttack: true, playerX: 220, playerY: 200 },
      quests,
    );
    expect('error' in follow).toBe(false);
    if ('error' in follow) return;
    expect(follow.hits[0]?.marked).toBe(true);
  });

  it('backstab from the front does not consume cooldown', () => {
    const save = baseSave({
      profession: 'rogue',
      skillLevels: { backstab: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.facing = 'right';
    entity.x = 200;
    entity.y = 200;
    const result = resolveBatchAttack(
      save,
      encounterId,
      [entity.entityId],
      { skillId: 'backstab', playerX: 240, playerY: 200 },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.skillRequireFailed).toBe('backstab');
    expect(result.hits).toHaveLength(0);
    expect(result.save.skillCooldowns.backstab).toBeUndefined();
  });

  it('execute fails while the target is above the HP gate', () => {
    const save = baseSave({
      profession: 'warrior',
      skillLevels: { execute: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.hp = entity.maxHp;
    const result = resolveBatchAttack(
      save,
      encounterId,
      [entity.entityId],
      { skillId: 'execute', nearbyEnemyCount: 1,playerX:entity.x,playerY:entity.y },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.skillRequireFailed).toBe('execute');
    expect(result.save.skillCooldowns.execute).toBeUndefined();
  });

  it('vanishing_strike without a dash does not consume cooldown', () => {
    const save = baseSave({
      profession: 'rogue',
      skillLevels: { vanishing_strike: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.x = 200;
    entity.y = 200;
    const result = resolveBatchAttack(
      save,
      encounterId,
      [entity.entityId],
      { skillId: 'vanishing_strike', dashing: false, playerX: 210, playerY: 200 },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.skillRequireFailed).toBe('vanish');
    expect(result.save.skillCooldowns.vanishing_strike).toBeUndefined();
  });

  it('vanishing_strike from a dash lands and flags vanish', () => {
    const save = baseSave({
      profession: 'rogue',
      skillLevels: { vanishing_strike: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.hp = 4000;
    entity.maxHp = 4000;
    entity.x = 200;
    entity.y = 200;
    const result = resolveBatchAttack(
      save,
      encounterId,
      [entity.entityId],
      {
        skillId: 'vanishing_strike',
        dashing: true,
        chargeAttack: true,
        playerX: 210,
        playerY: 200,
      },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.skillRequireFailed).toBeUndefined();
    expect(result.hits[0]?.vanish).toBe(true);
    expect(result.hits[0]?.hit).toBe(true);
  });

  it('shadow_strike seek always hits without chargeAttack', () => {
    const save = baseSave({
      profession: 'rogue',
      skillLevels: { shadow_strike: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.hp = 4000;
    entity.maxHp = 4000;
    entity.x = 200;
    entity.y = 200;
    const result = resolveBatchAttack(
      save,
      encounterId,
      [entity.entityId],
      { skillId: 'shadow_strike', playerX: 210, playerY: 200 },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.hits[0]?.seek).toBe(true);
    expect(result.hits[0]?.hit).toBe(true);
    expect(result.hits[0]?.missed).toBe(false);
  });

  it('pin_down slows the mob', () => {
    const save = baseSave({
      profession: 'archer',
      skillLevels: { pin_down: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.hp = 4000;
    entity.maxHp = 4000;
    entity.x = 200;
    entity.y = 200;
    const baseSpeed = entity.speed;
    const result = resolveBatchAttack(
      save,
      encounterId,
      [entity.entityId],
      {
        skillId: 'pin_down',
        chargeAttack: true,
        playerX: 220,
        playerY: 200,
      },
      quests,
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.hits[0]?.controlApplied).toBe('pin');
    expect(entity.control?.kind).toBe('pin');
    expect(entity.speed).toBeLessThan(baseSpeed);
  });

  it('shield_bash stuns only with a shield equipped', () => {
    const bare = baseSave({
      profession: 'warrior',
      skillLevels: { shield_bash: 1 },
      mp: 40,
      location: 'adena_fields',
    });
    const { encounterId, entities } = startEncounter(bare, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entities[0]!.entityId)!;
    entity.hp = 4000;
    entity.maxHp = 4000;
    entity.x = 200;
    entity.y = 200;
    const baseSpeed = entity.speed;
    const noShield = resolveBatchAttack(
      bare,
      encounterId,
      [entity.entityId],
      { skillId: 'shield_bash', chargeAttack: true, playerX: 210, playerY: 200 },
      quests,
    );
    expect('error' in noShield).toBe(false);
    if ('error' in noShield) return;
    expect(noShield.hits[0]?.hit).toBe(true);
    expect(noShield.hits[0]?.controlApplied).toBeUndefined();
    expect(entity.speed).toBe(baseSpeed);

    const shielded = applyStatsToSave({
      ...noShield.save,
      equipment: { ...noShield.save.equipment, shield: 'wooden_buckler' },
      skillCooldowns: {},
      mp: 40,
    });
    const stunned = resolveBatchAttack(
      shielded,
      encounterId,
      [entity.entityId],
      { skillId: 'shield_bash', chargeAttack: true, playerX: 210, playerY: 200 },
      quests,
    );
    expect('error' in stunned).toBe(false);
    if ('error' in stunned) return;
    expect(stunned.hits[0]?.controlApplied).toBe('stun');
    expect(entity.control?.kind).toBe('stun');
    expect(entity.speed).toBe(0);
  });

  it('bleed-kill is idempotent when entity already dead', () => {
    const save = baseSave();
    const { encounterId, entities } = startEncounter(save, 'adena_fields');
    const entityId = entities[0]!.entityId;
    const enc = getEncounter(encounterId)!;
    const entity = enc.entities.get(entityId)!;
    entity.alive = false;
    entity.hp = 0;

    const first = resolveBleedKill(save, encounterId, entityId, {}, quests);
    expect('error' in first).toBe(false);
    if ('error' in first) return;
    expect(first.hits).toHaveLength(0);

    const second = resolveBleedKill(first.save, encounterId, entityId, {}, quests);
    expect('error' in second).toBe(false);
    if ('error' in second) return;
    expect(second.hits).toHaveLength(0);
  });

  it('farm respawn adds entity under maxAlive', () => {
    const save = baseSave();
    const { encounterId } = startEncounter(save, 'adena_fields');
    const enc = getEncounter(encounterId)!;
    for (const e of enc.entities.values()) {
      e.alive = false;
    }
    const spawned = respawnFarmEntity(enc);
    expect(spawned).toBeTruthy();
    expect(spawned?.alive).toBe(true);
  });

  it('uses fixed enemy levels independent of player level', () => {
    const low = startEncounter(baseSave({ level: 1,location:'starter_grove' }), 'starter_grove');
    const high = startEncounter(baseSave({ id: 'hi', level: 60, name: 'Hi',location:'starter_grove' }), 'starter_grove');
    const lowLvls = low.entities.map((e) => e.level).sort();
    const highLvls = high.entities.map((e) => e.level).sort();
    expect(lowLvls).toEqual(highLvls);
    expect(lowLvls.every((l) => l >= 1 && l <= 20)).toBe(true);
  });

  it('keeps encounter alive while other participants remain', () => {
    const one = baseSave({ id: 'save-a', name: 'A' });
    const two = baseSave({ id: 'save-b', name: 'B' });
    const { encounterId } = startEncounter(one, 'adena_fields');
    startEncounter(two, 'adena_fields');
    invalidateEncounterForSave(one.id);
    expect(getEncounter(encounterId)).toBeDefined();
    invalidateEncounterForSave(two.id);
    expect(getEncounter(encounterId)).toBeUndefined();
  });

  it('respawns quest pack for ally still on quest after first cleared it', () => {
    const done = baseSave({
      id: 'save-done',
      name: 'Done',
      location: 'starter_grove',
      questFlags: { quest_grove_complete: true },
    });
    const active = baseSave({
      id: 'save-active',
      name: 'Active',
      location: 'starter_grove',
      questFlags: { quest_grove_active: true, quest_grove_kills: 0 },
    });

    const first = startEncounter(done, 'starter_grove');
    const enc = getEncounter(first.encounterId)!;
    const beforeJoin = [...enc.entities.values()].filter((e) => e.alive && e.quest).length;
    expect(beforeJoin).toBe(0);

    // Simulate: someone with quest had spawned and cleared (flag set, all dead)
    enc.questFlagsSpawned.add('quest_grove_active');

    const second = startEncounter(active, 'starter_grove');
    expect(second.encounterId).toBe(first.encounterId);
    const questAlive = [...enc.entities.values()].filter((e) => e.alive && e.quest);
    expect(questAlive.length).toBeGreaterThan(0);

    // Clear again — sync for active should respawn
    for (const e of questAlive) markEntityDead(enc, e);
    const added = syncQuestSpawns(first.encounterId, active);
    expect(added.length).toBeGreaterThan(0);
  });
  it('rejects missing authoritative coordinates and cross-location encounters', () => {
    const save=baseSave();const started=startEncounter(save,save.location);const entity=started.entities[0]!;
    expect(resolveBatchAttack(save,started.encounterId,[entity.entityId],{},quests)).toEqual({error:'Authoritative position required'});
    expect(resolveBatchAttack({...save,location:'godfall_throne'},started.encounterId,[entity.entityId],{playerX:entity.x,playerY:entity.y},quests)).toEqual({error:'Encounter not found'});
    expect(()=>startEncounter(save,'godfall_throne')).toThrow();
    expect(getEncounter(started.encounterId)?.participants.has(save.id)).toBe(true);
  });
  it('advances only issued DOT at server time and rewards lethal ticks once', () => {
    const save=baseSave();const started=startEncounter(save,save.location);const encounter=getEncounter(started.encounterId)!;const entity=[...encounter.entities.values()][0]!;
    const hp=entity.hp;
    const unissued=resolveBleedKill(save,started.encounterId,entity.entityId,{},quests,10000);
    expect('error' in unissued).toBe(false);expect(entity.hp).toBe(hp);expect(entity.alive).toBe(true);
    entity.hp=12;entity.dot={sourceSaveId:save.id,tickDamage:6,tickMs:500,nextTickAt:10500,expiresAt:12000};
    const early=resolveBleedKill(save,started.encounterId,entity.entityId,{},quests,10499);
    expect('error' in early).toBe(false);expect(entity.hp).toBe(12);
    const first=resolveBleedKill(save,started.encounterId,entity.entityId,{},quests,10500);
    expect('error' in first).toBe(false);expect(entity.hp).toBe(6);
    const lethal=resolveBleedKill(save,started.encounterId,entity.entityId,{},quests,11000);
    expect('error' in lethal).toBe(false);if('error' in lethal)throw new Error(lethal.error);
    expect(entity.alive).toBe(false);expect(lethal.hits[0]?.killed).toBe(true);expect(lethal.xpGained).toBeGreaterThan(0);
    const duplicate=resolveBleedKill(lethal.save,started.encounterId,entity.entityId,{},quests,12000);
    expect('error' in duplicate).toBe(false);if('error' in duplicate)throw new Error(duplicate.error);
    expect(duplicate.hits).toEqual([]);expect(duplicate.save.xp).toBe(lethal.save.xp);
  });
});
