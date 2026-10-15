/** Boot helper: connect configured Postgres/Redis and build repositories. */

import type { ServicesConfig } from '@empery/shared';
import { PostgresCharacterRepository } from './character-repository.js';
import { connectPostgres, closePostgres, pingPostgres, getPgPool } from './pg.js';
import { createNodeId, PresenceEventBus } from './presence-bus.js';
import { RedisPresenceRepository } from './presence-repository.js';
import { connectRedis, closeRedis, pingRedis, getRedis } from './redis.js';

export interface PersistenceStack {
  characters: PostgresCharacterRepository | null;
  presence: RedisPresenceRepository | null;
  presenceBus: PresenceEventBus | null;
  nodeId: string;
}

let activeBus: PresenceEventBus | null = null;

export async function openPersistence(
  config: ServicesConfig,
  opts?: { onPresenceEvent?: (event: import('./presence-bus.js').PresenceBusEvent) => void },
): Promise<PersistenceStack> {
  let characters: PostgresCharacterRepository | null = null;
  let presence: RedisPresenceRepository | null = null;
  let presenceBus: PresenceEventBus | null = null;
  const nodeId = createNodeId();

  try {
    const pgCfg = config.persistence?.postgres;
    if (pgCfg?.enabled !== false && pgCfg?.url) {
      const pool = await connectPostgres(pgCfg.url);
      characters = new PostgresCharacterRepository(pool);
    }

    const rdCfg = config.persistence?.redis;
    if (rdCfg?.enabled !== false && rdCfg?.url) {
      const redis = await connectRedis(rdCfg.url);
      presence = new RedisPresenceRepository(redis);
      if (opts?.onPresenceEvent) {
        presenceBus = new PresenceEventBus(redis, nodeId, opts.onPresenceEvent);
        await presenceBus.start();
        activeBus = presenceBus;
      }
    }

    return { characters, presence, presenceBus, nodeId };
  } catch (err) {
    await presenceBus?.stop().catch(() => undefined);
    if (activeBus === presenceBus) activeBus = null;
    await closeRedis().catch(() => undefined);
    await closePostgres().catch(() => undefined);
    throw err;
  }
}

export async function closePersistence(): Promise<void> {
  const errors:unknown[]=[];const bus=activeBus;activeBus=null;
  try {await bus?.stop();}catch(error){errors.push(error);}
  const results=await Promise.allSettled([closeRedis(),closePostgres()]);
  for(const result of results)if(result.status==='rejected')errors.push(result.reason);
  if(errors.length)throw new AggregateError(errors,'Persistence close failed');
}

export async function persistenceHealth(): Promise<
  Array<{ service: string; ok: boolean; latencyMs?: number; detail?: string }>
> {
  const out = [];
  if (getPgPool()) out.push(await pingPostgres());
  if (getRedis()) out.push(await pingRedis());
  return out;
}

export type { PostgresCharacterRepository, RedisPresenceRepository, PresenceEventBus };
