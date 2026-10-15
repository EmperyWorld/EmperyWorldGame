import { describe, expect, it } from 'vitest';
import { EMPTY_EQUIPMENT } from '@empery/shared';
import type { PlayerSave } from '@empery/shared';
import { WorldRuntime } from './multiplayer.js';

function baseSave(overrides: Partial<PlayerSave> = {}): PlayerSave {
  return {
    id: 'save-1',
    name: 'Tester',
    race: 'human',
    profession: 'warrior',
    level: 10,
    xp: 0,
    hp: 100,
    maxHp: 100,
    maxMp: 0,
    mp: 0,
    location: 'starter_grove',
    adena: 0,
    inventory: [],
    equipment: { ...EMPTY_EQUIPMENT },
    skillLevels: {},
    skillCooldowns: {},
    questFlags: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('WorldRuntime', () => {
  it('bootstraps without mutating channel membership', () => {
    const world = new WorldRuntime();
    const save = baseSave();

    const bootstrap = world.bootstrap(save);

    expect(bootstrap.self.saveId).toBe(save.id);
    expect(bootstrap.snapshot.locationId).toBe(save.location);
    expect(bootstrap.snapshot.players).toHaveLength(0);
  });

  it('connects players into the same location snapshot', () => {
    const world = new WorldRuntime();
    const one = baseSave({ id: 'one', name: 'One' });
    const two = baseSave({ id: 'two', name: 'Two' });

    world.connect(one, 'c1');
    const second = world.connect(two, 'c2');

    expect(second.snapshot.players.map((p) => p.saveId).sort()).toEqual(['one', 'two']);
    expect(world.listOnlineSaveIds().sort()).toEqual(['one', 'two']);
  });

  it('omits disconnected grace ghosts from online save ids', () => {
    const world = new WorldRuntime();
    world.connect(baseSave({ id: 'live' }), 'c1');
    world.connect(baseSave({ id: 'gone' }), 'c2');
    world.beginDisconnectGrace('c2', 1_000_000);
    expect(world.listOnlineSaveIds()).toEqual(['live']);
  });

  it('moves player to another location channel', () => {
    const world = new WorldRuntime();
    const save = baseSave({ id: 'one' });

    world.connect(save, 'c1');
    const next = world.joinLocation('c1', save, 'silverwood');

    expect(next.snapshot.locationId).toBe('silverwood');
    expect(world.snapshot('starter_grove').players).toHaveLength(0);
    expect(world.snapshot('silverwood').players).toHaveLength(1);
  });

  it('finds connected players by name case-insensitively', () => {
    const world = new WorldRuntime();
    world.connect(baseSave({ id: 'one', name: 'Арагорн', location: 'adena_fields' }), 'c1');
    world.connect(baseSave({ id: 'two', name: 'Леголас', location: 'adena_fields' }), 'c2');

    expect(world.findByPlayerName('арагорн').map((p) => p.saveId)).toEqual(['one']);
    expect(world.findByPlayerName('missing')).toEqual([]);
  });

  it('tracks connection ids per save for reconnect kicks', () => {
    const world = new WorldRuntime();
    const save = baseSave({ id: 'solo', name: 'Мира' });
    world.connect(save, 'c1');
    expect(world.connectionIdsForSave('solo')).toEqual(['c1']);
    world.disconnect('c1');
    world.connect(save, 'c2');
    expect(world.connectionIdsForSave('solo')).toEqual(['c2']);
  });

  it('keeps DISCONNECT ghost for grace then purges', () => {
    const world = new WorldRuntime();
    const save = baseSave({ id: 'ghosty', name: 'Тень', worldX: 100, worldY: 200 });
    world.connect(save, 'c1');
    const t0 = 1_000_000;
    const left = world.beginDisconnectGrace('c1', t0);
    expect(left?.connectionStatus).toBe('disconnected');
    expect(left?.x).toBe(100);
    expect(world.connectionIds('starter_grove')).toEqual([]);
    expect(world.presences('starter_grove')).toHaveLength(1);
    expect(world.presences('starter_grove')[0]?.connectionStatus).toBe('disconnected');

    expect(world.purgeExpiredGhosts(t0 + 30_000)).toEqual([]);
    expect(world.presences('starter_grove')).toHaveLength(1);

    expect(world.purgeExpiredGhosts(t0 + 60_000)).toEqual(['starter_grove']);
    expect(world.presences('starter_grove')).toHaveLength(0);
  });

  it('reclaims ghost position and hp on reconnect', () => {
    const world = new WorldRuntime();
    const save = baseSave({ id: 'back', name: 'Рекон', hp: 100, worldX: 50, worldY: 60 });
    world.connect(save, 'c1');
    world.updatePresence('c1', { x: 333, y: 444, moving: false, facing: 'left' });
    world.beginDisconnectGrace('c1');
    world.patchCombatPresence('back', { hp: 42 });

    const again = world.connect({ ...save, hp: 100 }, 'c2');
    expect(again.self.x).toBe(333);
    expect(again.self.y).toBe(444);
    expect(again.self.hp).toBe(42);
    expect(again.self.connectionStatus).toBe('online');
    expect(world.connectionIdsForSave('back')).toEqual(['c2']);
    expect(world.presences('starter_grove').every((p) => p.connectionStatus !== 'disconnected')).toBe(
      true,
    );
  });

  it('ignores ghost position after travel to another location', () => {
    const world = new WorldRuntime();
    const inApt = baseSave({
      id: 'apt-travel',
      location: 'haven_apartment',
      worldX: 640,
      worldY: 780,
    });
    world.connect(inApt, 'c1');
    world.updatePresence('c1', { x: 640, y: 780, moving: false, facing: 'down' });
    world.beginDisconnectGrace('c1');

    const afterTravel = baseSave({
      id: 'apt-travel',
      location: 'empery_haven',
      worldX: 2227,
      worldY: 1283,
    });
    const boot = world.connect(afterTravel, 'c2');

    expect(boot.self.locationId).toBe('empery_haven');
    expect(boot.self.x).toBe(2227);
    expect(boot.self.y).toBe(1283);
    expect(boot.self.x).not.toBe(640);
  });

  it('ignores same-map ghost far from disk arrival (apartment coords on Haven)', () => {
    const world = new WorldRuntime();
    const afterTravel = baseSave({
      id: 'apt-race',
      location: 'empery_haven',
      worldX: 2227,
      worldY: 1283,
    });
    // Simulate early join_location + stale apartment player_input before reconnect.
    world.connect(afterTravel, 'c1');
    world.updatePresence('c1', { x: 640, y: 780, moving: false, facing: 'down' });
    world.beginDisconnectGrace('c1');

    const boot = world.connect(afterTravel, 'c2');
    expect(boot.self.x).toBe(2227);
    expect(boot.self.y).toBe(1283);
  });

  it('reclaims nearby same-map ghost on reconnect', () => {
    const world = new WorldRuntime();
    const save = baseSave({
      id: 'near-ghost',
      location: 'empery_haven',
      worldX: 2200,
      worldY: 1300,
    });
    world.connect(save, 'c1');
    world.updatePresence('c1', { x: 2210, y: 1310, moving: false, facing: 'left' });
    world.beginDisconnectGrace('c1');

    const boot = world.connect(save, 'c2');
    expect(boot.self.x).toBe(2210);
    expect(boot.self.y).toBe(1310);
  });

  it('spawns from saved world coords', () => {
    const world = new WorldRuntime();
    const boot = world.connect(baseSave({ worldX: 12, worldY: 34 }), 'c1');
    expect(boot.self.x).toBe(12);
    expect(boot.self.y).toBe(34);
  });

  it('uses shorter grace when graceMs is safe-zone value', () => {
    const world = new WorldRuntime();
    world.connect(baseSave({ id: 'safe' }), 'c1');
    const t0 = 5_000_000;
    world.beginDisconnectGrace('c1', t0, 15_000);
    expect(world.purgeExpiredGhosts(t0 + 14_000)).toEqual([]);
    expect(world.purgeExpiredGhosts(t0 + 15_000)).toEqual(['starter_grove']);
  });

  it('exposes disconnectRemainingMs and admin purgeGhost', () => {
    const world = new WorldRuntime();
    world.connect(baseSave({ id: 'purge_me' }), 'c1');
    const t0 = Date.now();
    world.beginDisconnectGrace('c1', t0, 60_000);
    const ghost = world.presences('starter_grove')[0];
    expect(ghost?.disconnectRemainingMs).toBeGreaterThan(50_000);
    expect(world.purgeGhost('purge_me')?.saveId).toBe('purge_me');
    expect(world.presences('starter_grove')).toHaveLength(0);
  });

  it('keeps combat stimulus when reclaiming ghost', () => {
    const world = new WorldRuntime();
    const save = baseSave({ id: 'aggro' });
    world.connect(save, 'c1');
    world.noteCombatActivity('aggro', 10_000);
    world.beginDisconnectGrace('c1');
    world.connect(save, 'c2');
    expect(world.isCombatActive('aggro')).toBe(true);
  });
});
