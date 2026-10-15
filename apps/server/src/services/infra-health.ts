/** Lightweight TCP probes for local Postgres/Redis (no driver deps yet). */

import type { HealthStatus } from '@empery/shared';
import { connect as netConnect } from 'node:net';

function probeTcp(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = netConnect({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function parseHostPort(urlStr: string, fallbackPort: number): { host: string; port: number } | null {
  try {
    const u = new URL(urlStr);
    return {
      host: u.hostname || '127.0.0.1',
      port: u.port ? Number(u.port) : fallbackPort,
    };
  } catch {
    return null;
  }
}

export async function probePersistenceHealth(opts: {
  postgresUrl?: string;
  postgresEnabled?: boolean;
  redisUrl?: string;
  redisEnabled?: boolean;
}): Promise<HealthStatus[]> {
  const out: HealthStatus[] = [];

  if (opts.postgresEnabled !== false && opts.postgresUrl) {
    const t0 = Date.now();
    const parsed = parseHostPort(opts.postgresUrl, 5432);
    const ok = parsed ? await probeTcp(parsed.host, parsed.port) : false;
    out.push({
      service: 'postgres',
      ok,
      latencyMs: Date.now() - t0,
      detail: ok ? opts.postgresUrl.replace(/:[^:@/]+@/, ':***@') : 'unreachable',
    });
  }

  if (opts.redisEnabled !== false && opts.redisUrl) {
    const t0 = Date.now();
    const parsed = parseHostPort(opts.redisUrl, 6379);
    const ok = parsed ? await probeTcp(parsed.host, parsed.port) : false;
    out.push({
      service: 'redis',
      ok,
      latencyMs: Date.now() - t0,
      detail: ok ? opts.redisUrl : 'unreachable',
    });
  }

  return out;
}
