import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import {
  applyKillCounters,
  canAttackPlayer,
  decayKarmaOnMobKill,
  isInnocentForPk,
  karmaForPeacefulKill,
  playerKarma,
  resolvePvpStatus,
} from './pvp.js';
import { WorldRuntime } from './multiplayer.js';

function baseSave(over: Partial<PlayerSave> = {}): PlayerSave {
  return {
    id: 'a',
    name: 'A',
    race: 'human',
    profession: 'warrior',
    level: 20,
    xp: 0,
    hp: 200,
    maxHp: 200,
    location: 'adena_fields',
    adena: 0,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    karma: 0,
    pkCount: 0,
    pvpCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe('canAttackPlayer', () => {
  const base = {
    attackerId: 'a',
    targetId: 'b',
    safeZone: false,
    sameParty: false,
    sameLocation: true,
    attackerHp: 100,
    targetHp: 100,
    distance: 20,
  };

  it('rejects safe zone', () => {
    const r = canAttackPlayer({ ...base, safeZone: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SAFE_ZONE');
  });

  it('rejects party members', () => {
    const r = canAttackPlayer({ ...base, sameParty: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SAME_PARTY');
  });

  it('rejects out of range', () => {
    const r = canAttackPlayer({ ...base, distance: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('OUT_OF_RANGE');
  });

  it('rejects self', () => {
    const r = canAttackPlayer({ ...base, targetId: 'a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SELF');
  });

  it('allows valid open-world hit', () => {
    expect(canAttackPlayer(base).ok).toBe(true);
  });
});

describe('flag and karma', () => {
  it('flagged while timer active, chaotic if karma', () => {
    const now = 1_000_000;
    expect(resolvePvpStatus({ karma: 0, flagUntilMs: now + 1000, now })).toBe('flagged');
    expect(resolvePvpStatus({ karma: 0, flagUntilMs: now - 1, now })).toBe('peaceful');
    expect(resolvePvpStatus({ karma: 50, flagUntilMs: now + 1000, now })).toBe('chaotic');
  });

  it('adds karma and pkCount only for peaceful victim', () => {
    const killer = baseSave({ id: 'k' });
    const peaceful = baseSave({ id: 'v', karma: 0, level: 10 });
    const afterPk = applyKillCounters(killer, peaceful);
    expect(playerKarma(afterPk)).toBe(karmaForPeacefulKill(10));
    expect(afterPk.pkCount).toBe(1);
    expect(afterPk.pvpCount ?? 0).toBe(0);

    const flaggedVictim = baseSave({ id: 'v2', karma: 1 });
    const afterPvp = applyKillCounters(killer, flaggedVictim, { victimInnocent: false });
    expect(playerKarma(afterPvp)).toBe(0);
    expect(afterPvp.pvpCount).toBe(1);
    expect(afterPvp.pkCount ?? 0).toBe(0);
  });

  it('decays karma on mob kill', () => {
    const red = baseSave({ karma: 80 });
    expect(decayKarmaOnMobKill(red, 40).karma).toBe(40);
    expect(decayKarmaOnMobKill(red, 100).karma).toBe(0);
  });

  it('does not treat flagged players as innocent PK targets', () => {
    const now = Date.now();
    expect(isInnocentForPk(0, now + 10_000, now)).toBe(false);
    expect(isInnocentForPk(0, 0, now)).toBe(true);
    expect(isInnocentForPk(10, 0, now)).toBe(false);
  });
});

describe('WorldRuntime pvp presence', () => {
  it('marks chaotic from save karma and flagged after refresh', () => {
    const world = new WorldRuntime();
    const save = baseSave({ id: 'one', karma: 0 });
    world.connect(save, 'c1');
    expect(world.presenceForSave('one')?.pvpStatus).toBe('peaceful');

    const until = Date.now() + 60_000;
    world.refreshPvpFlag('one', until);
    expect(world.presenceForSave('one')?.pvpStatus).toBe('flagged');

    world.patchCombatPresence('one', { karma: 200 });
    expect(world.presenceForSave('one')?.pvpStatus).toBe('chaotic');
    expect(world.presenceForSave('one')?.karma).toBe(200);
  });
});
