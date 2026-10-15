/** Postgres pool for multiplayer character persistence. */

import pg from 'pg';
import type { HealthStatus } from '@empery/shared';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPgPool(): pg.Pool | null {
  return pool;
}

export async function connectPostgres(url: string): Promise<pg.Pool> {
  if (pool) return pool;
  const next = new Pool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 4_000,
  });
  try {
    // Fail fast if URL is wrong without retaining a poisoned singleton.
    const client = await next.connect();
    client.release();
    pool = next;
    return next;
  } catch (err) {
    await next.end().catch(() => undefined);
    throw err;
  }
}

export async function closePostgres(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export async function pingPostgres(): Promise<HealthStatus> {
  const t0 = Date.now();
  if (!pool) {
    return { service: 'postgres', ok: false, detail: 'not connected' };
  }
  try {
    await pool.query('SELECT 1');
    return { service: 'postgres', ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      service: 'postgres',
      ok: false,
      latencyMs: Date.now() - t0,
      detail: err instanceof Error ? err.message : 'query failed',
    };
  }
}
