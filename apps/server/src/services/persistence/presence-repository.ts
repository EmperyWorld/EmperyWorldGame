/** Ephemeral presence mirror → Redis (WorldRuntime stays in-process authority). */

import type { MultiplayerPlayerPresence } from '@empery/shared';
import type { PresenceRepository } from '../multiplayer-persistence.js';
import type { getRedis } from './redis.js';

type RedisClient = NonNullable<ReturnType<typeof getRedis>>;

const PLAYER_KEY = (saveId: string) => `presence:player:${saveId}`;
const LOC_KEY = (channelKey: string) => `presence:location:${channelKey}`;
/** Soft TTL — refreshed on each upsert; cleans crashed-node leftovers. */
const PRESENCE_TTL_SEC = 120;

export class RedisPresenceRepository implements PresenceRepository {
  constructor(private readonly redis: RedisClient) {}

  async upsertPresence(
    presence: MultiplayerPlayerPresence,
    channelKey?: string,
  ): Promise<void> {
    const key = PLAYER_KEY(presence.saveId);
    const loc = channelKey ?? presence.locationId;
    const prevRaw = await this.redis.get(key);
    const pipe = this.redis.pipeline();
    if (prevRaw) {
      try {
        const prev = JSON.parse(prevRaw) as MultiplayerPlayerPresence & { channelKey?: string };
        const prevLoc = prev.channelKey ?? prev.locationId;
        if (prevLoc && prevLoc !== loc) {
          pipe.srem(LOC_KEY(prevLoc), presence.saveId);
        }
      } catch {
        /* ignore corrupt */
      }
    }
    const payload = JSON.stringify({ ...presence, channelKey: loc });
    pipe.set(key, payload, 'EX', PRESENCE_TTL_SEC);
    pipe.sadd(LOC_KEY(loc), presence.saveId);
    pipe.expire(LOC_KEY(loc), PRESENCE_TTL_SEC);
    await pipe.exec();
  }

  async removePresence(saveId: string): Promise<void> {
    const key = PLAYER_KEY(saveId);
    const prevRaw = await this.redis.get(key);
    const pipe = this.redis.pipeline();
    if (prevRaw) {
      try {
        const prev = JSON.parse(prevRaw) as MultiplayerPlayerPresence & { channelKey?: string };
        const loc = prev.channelKey ?? prev.locationId;
        if (loc) pipe.srem(LOC_KEY(loc), saveId);
      } catch {
        /* ignore */
      }
    }
    pipe.del(key);
    await pipe.exec();
  }

  async listByLocation(locationId: string): Promise<MultiplayerPlayerPresence[]> {
    const ids = await this.redis.smembers(LOC_KEY(locationId));
    if (ids.length === 0) return [];
    const keys = ids.map(PLAYER_KEY);
    const rows = await this.redis.mget(...keys);
    const out: MultiplayerPlayerPresence[] = [];
    for (const row of rows) {
      if (!row) continue;
      try {
        const parsed = JSON.parse(row) as MultiplayerPlayerPresence & { channelKey?: string };
        const { channelKey: _ck, ...presence } = parsed;
        out.push(presence);
      } catch {
        /* skip */
      }
    }
    return out;
  }
}
