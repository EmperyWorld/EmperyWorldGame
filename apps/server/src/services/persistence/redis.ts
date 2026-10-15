/** Redis client for ephemeral multiplayer presence. */

import { Redis } from 'ioredis';
import type { HealthStatus } from '@empery/shared';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  return redis;
}

export async function connectRedis(url: string): Promise<Redis> {
  if (redis) return redis;
  const next = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  try {
    await next.connect();
    redis = next;
    return next;
  } catch (err) {
    next.disconnect();
    throw err;
  }
}

export async function closeRedis(): Promise<void> {
  if (!redis) return;
  await redis.quit();
  redis = null;
}

export async function pingRedis(): Promise<HealthStatus> {
  const t0 = Date.now();
  if (!redis) {
    return { service: 'redis', ok: false, detail: 'not connected' };
  }
  try {
    const pong = await redis.ping();
    return {
      service: 'redis',
      ok: pong === 'PONG',
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      service: 'redis',
      ok: false,
      latencyMs: Date.now() - t0,
      detail: err instanceof Error ? err.message : 'ping failed',
    };
  }
}
