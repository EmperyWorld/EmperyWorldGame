import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { loadServicesConfig } from '@empery/shared/config';
import { WorldRuntime } from './multiplayer.js';
import {
  openPersistence,
  closePersistence,
  persistenceHealth,
} from './persistence/index.js';
import { probePersistenceHealth } from './infra-health.js';

const config = loadServicesConfig();
const pgCfg = config.persistence?.postgres;
const redisCfg = config.persistence?.redis;

const probed = await probePersistenceHealth({
  postgresUrl: pgCfg?.url,
  postgresEnabled: pgCfg?.enabled !== false && Boolean(pgCfg?.url),
  redisUrl: redisCfg?.url,
  redisEnabled: redisCfg?.enabled !== false && Boolean(redisCfg?.url),
});

const pgOn = probed.some((h) => h.service === 'postgres' && h.ok);
const redisOn = probed.some((h) => h.service === 'redis' && h.ok);
/** GitHub Actions sets CI=true; local Podman still runs when TCP is up. */
if (process.env.RUN_PERSISTENCE_TESTS === '1' && (!pgOn || !redisOn)) throw new Error('Required CI Postgres/Redis are unavailable');
const persistenceEnabled =
  (pgOn || redisOn) && (process.env.CI !== 'true' || process.env.RUN_PERSISTENCE_TESTS === '1');

describe.runIf(persistenceEnabled)('persistence stack (local Podman)', () => {
  beforeAll(async () => {
    await openPersistence(config);
  }, 15_000);

  afterAll(async () => {
    await closePersistence();
  });

  it('ping health', async () => {
    const health = await persistenceHealth();
    expect(health.length).toBeGreaterThan(0);
    for (const h of health) {
      expect(h.ok, h.detail).toBe(true);
    }
  });

  it.runIf(pgOn)('mirrors a character payload', async () => {
    const stack = await openPersistence(config);
    expect(stack.characters).toBeTruthy();
    const saveId = `test-${Date.now()}`;
    await stack.characters!.saveCharacter({
      id: saveId,
      name: 'TestHero',
      race: 'human',
      gender: 'male',
      profession: 'warrior',
      level: 2,
      xp: 10,
      hp: 100,
      maxHp: 100,
      location: 'empery_haven',
      worldX: 100,
      worldY: 200,
      inventory: ['rusty_sword'],
      equipment: { weapon: 'rusty_sword' },
      skillLevels: { slash: 1 },
      skillCooldowns: {},
      questFlags: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const loaded = await stack.characters!.getBySaveId(saveId);
    expect(loaded?.name).toBe('TestHero');
    expect(loaded?.location).toBe('empery_haven');
    await stack.characters!.deleteCharacter(saveId);
    expect(await stack.characters!.getBySaveId(saveId)).toBeNull();
  });

  it.runIf(pgOn)('keeps JSON and normalized children at the latest revision despite clock skew', async () => {
    const stack=await openPersistence(config);
    const saveId=`revision-test-${Date.now()}`;
    const base={id:saveId,name:'RevisionHero',race:'human',profession:'warrior',level:2,xp:10,hp:100,maxHp:100,location:'empery_haven',inventory:['bronze_sword'],equipment:{weapon:'bronze_sword'},skillLevels:{power_strike:2},skillCooldowns:{},questFlags:{},createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',revision:2};
    try {
      await stack.characters!.saveCharacter(base);
      await stack.characters!.saveCharacter({...base,revision:1,updatedAt:'2099-01-01T00:00:00Z',inventory:['rusty_sword'],equipment:{weapon:'rusty_sword'},skillLevels:{power_strike:1}});
      const loaded=await stack.characters!.getBySaveId(saveId);expect(loaded?.revision).toBe(2);expect(loaded?.equipment.weapon).toBe('bronze_sword');
      const {getPgPool}=await import('./persistence/pg.js');
      const equipment=await getPgPool()!.query('SELECT item_id FROM character_equipment WHERE save_id=$1',[saveId]);expect(equipment.rows[0].item_id).toBe('bronze_sword');
      const inventory=await getPgPool()!.query('SELECT item_id FROM character_inventory_items WHERE save_id=$1',[saveId]);expect(inventory.rows[0].item_id).toBe('bronze_sword');
      const skills=await getPgPool()!.query('SELECT level FROM character_skills WHERE save_id=$1',[saveId]);expect(skills.rows[0].level).toBe(2);
    } finally {await stack.characters!.deleteCharacter(saveId);}
  });

  it.runIf(redisOn)('mirrors presence into redis', async () => {
    const stack = await openPersistence(config);
    expect(stack.presence).toBeTruthy();
    const saveId = `pres-${Date.now()}`;
    await stack.presence!.upsertPresence(
      {
        saveId,
        name: 'Scout',
        race: 'elf',
        profession: 'ranger',
        level: 3,
        locationId: 'empery_haven',
        x: 10,
        y: 20,
        facing: 'right',
        moving: false,
        hp: 80,
        maxHp: 100,
        karma: 0,
        pvpStatus: 'peaceful',
        connectionStatus: 'online',
      },
      'empery_haven',
    );
    const list = await stack.presence!.listByLocation('empery_haven');
    expect(list.some((p) => p.saveId === saveId)).toBe(true);
    await stack.presence!.removePresence(saveId);
    const after = await stack.presence!.listByLocation('empery_haven');
    expect(after.some((p) => p.saveId === saveId)).toBe(false);
  });

  it.runIf(redisOn)('fans out presence via pub/sub between two WorldRuntimes', async () => {
    const worldA = new WorldRuntime();
    const worldB = new WorldRuntime();
    const stackA = await openPersistence(config, {
      onPresenceEvent: (e) => worldA.applyRemotePresenceEvent(e),
    });
    // Second subscriber needs its own bus — openPersistence reuses one redis + one bus.
    // Simulate cross-node by publishing through A's bus into B's apply handler via a fresh bus.
    const { PresenceEventBus, createNodeId } = await import('./persistence/presence-bus.js');
    const { getRedis } = await import('./persistence/redis.js');
    const redis = getRedis();
    expect(redis).toBeTruthy();
    const busB = new PresenceEventBus(redis!, createNodeId(), (e) => worldB.applyRemotePresenceEvent(e));
    await busB.start();
    worldA.setPresenceBus(stackA.presenceBus);
    worldA.setPresenceRepository(stackA.presence);

    const save = {
      id: `fan-${Date.now()}`,
      name: 'FanOut',
      race: 'human',
      profession: 'warrior',
      level: 1,
      xp: 0,
      hp: 100,
      maxHp: 100,
      location: 'empery_haven',
      inventory: [] as string[],
      equipment: {} as Record<string, string | null>,
      skillLevels: {},
      skillCooldowns: {},
      questFlags: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    worldA.connect(save, 'conn-a');
    // Wait for pub/sub delivery
    await new Promise((r) => setTimeout(r, 150));
    const players = worldB.snapshot('empery_haven').players;
    expect(players.some((p) => p.saveId === save.id)).toBe(true);
    worldA.disconnect('conn-a');
    await new Promise((r) => setTimeout(r, 150));
    const after = worldB.snapshot('empery_haven').players;
    expect(after.some((p) => p.saveId === save.id)).toBe(false);
    await busB.stop();
  });
});
