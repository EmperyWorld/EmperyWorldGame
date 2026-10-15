import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SaveManager } from '@empery/save';
import { AuthService } from './auth.js';
import { WorldRuntime } from './multiplayer.js';
import { registerAdminRoutes } from './admin-routes.js';
import { normalizeSave } from './save-normalize.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccountRecord } from './auth.js';
import type { PlayerSave } from '@empery/shared';
import { EMPTY_EQUIPMENT } from '@empery/shared';

describe('admin routes requireAdmin', () => {
  it('returns 403 for non-admin session on /api/admin/online', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'empery-admin-api-'));
    const auth = new AuthService(join(dir, 'accounts.json'), join(dir, 'sessions.json'));
    const saves = new SaveManager(join(dir, 'saves'), normalizeSave);
    const world = new WorldRuntime();
    const app = Fastify({ logger: false });

    const reg = await auth.register('player1', 'secret12');
    expect('token' in reg).toBe(true);
    if (!('token' in reg)) return;
    const token = reg.token;

    function requireAdmin(req: FastifyRequest, reply: FastifyReply): AccountRecord | null {
      const header = req.headers.authorization;
      const t =
        typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
      const session = auth.resolveToken(t);
      if (!session) {
        reply.status(401).send({ error: 'auth', code: 'AUTH_REQUIRED' });
        return null;
      }
      const account = auth.getAccount(session.accountId);
      if (!account) {
        reply.status(401).send({ error: 'auth', code: 'AUTH_INVALID' });
        return null;
      }
      if (!account.admin) {
        reply.status(403).send({ error: 'Нужны права администратора', code: 'ADMIN_REQUIRED' });
        return null;
      }
      return account;
    }

    await registerAdminRoutes(app, {
      rootDir: dir,
      auth,
      saves,
      world,
      requireAdmin,
      logAdmin: () => undefined,
    });

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/online',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(JSON.parse(forbidden.body).code).toBe('ADMIN_REQUIRED');

    auth.setAdmin('player1', true);
    const ok = await app.inject({
      method: 'GET',
      url: '/api/admin/online',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).count).toBe(0);

    const jobs = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(jobs.statusCode).toBe(200);
    expect(JSON.parse(jobs.body).jobs).toEqual([]);

    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('patches save with clamp via admin API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'empery-admin-patch-'));
    const auth = new AuthService(join(dir, 'accounts.json'), join(dir, 'sessions.json'));
    const saves = new SaveManager(join(dir, 'saves'), normalizeSave);
    const world = new WorldRuntime();
    const app = Fastify({ logger: false });

    const reg = await auth.register('boss', 'secret12');
    if (!('token' in reg)) return;
    auth.setAdmin('boss', true);
    const now = new Date().toISOString();
    const save: PlayerSave = {
      id: 's1',
      accountId: reg.account.id,
      name: 'Hero',
      race: 'human',
      profession: 'warrior',
      level: 3,
      xp: 10,
      hp: 40,
      maxHp: 100,
      mp: 10,
      maxMp: 30,
      location: 'empery_haven',
      adena: 5,
      inventory: ['rusty_sword'],
      inventoryEnchants: [0],
      equipment: { ...EMPTY_EQUIPMENT, weapon: 'rusty_sword' },
      skillLevels: {},
      skillCooldowns: {},
      questFlags: {},
      createdAt: now,
      updatedAt: now,
    };
    saves.save(save, { sync: true });

    function requireAdmin(req: FastifyRequest, reply: FastifyReply): AccountRecord | null {
      const header = req.headers.authorization;
      const t =
        typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
      const session = auth.resolveToken(t);
      const account = session ? auth.getAccount(session.accountId) : null;
      if (!account?.admin) {
        reply.status(403).send({ code: 'ADMIN_REQUIRED' });
        return null;
      }
      return account;
    }

    await registerAdminRoutes(app, {
      rootDir: dir,
      auth,
      saves,
      world,
      requireAdmin,
      logAdmin: () => undefined,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/saves/s1',
      headers: { authorization: `Bearer ${reg.token}` },
      payload: { hp: 99999, level: 200, adena: -1 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { save: PlayerSave };
    expect(body.save.level).toBe(99);
    expect(body.save.adena).toBe(0);
    expect(body.save.hp).toBeLessThanOrEqual(body.save.maxHp);

    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('purges DISCONNECT ghost via admin API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'empery-admin-purge-'));
    const auth = new AuthService(join(dir, 'accounts.json'), join(dir, 'sessions.json'));
    const saves = new SaveManager(join(dir, 'saves'), normalizeSave);
    const world = new WorldRuntime();
    const app = Fastify({ logger: false });
    const changed: string[] = [];

    const reg = await auth.register('boss2', 'secret12');
    if (!('token' in reg)) return;
    auth.setAdmin('boss2', true);

    const now = new Date().toISOString();
    const save: PlayerSave = {
      id: 'ghost1',
      accountId: reg.account.id,
      name: 'Ghost',
      race: 'human',
      profession: 'warrior',
      level: 1,
      xp: 0,
      hp: 50,
      maxHp: 100,
      mp: 10,
      maxMp: 30,
      location: 'starter_grove',
      adena: 0,
      inventory: [],
      inventoryEnchants: [],
      equipment: { ...EMPTY_EQUIPMENT },
      skillLevels: {},
      skillCooldowns: {},
      questFlags: {},
      createdAt: now,
      updatedAt: now,
    };
    world.connect(save, 'ws1');
    world.beginDisconnectGrace('ws1');

    function requireAdmin(req: FastifyRequest, reply: FastifyReply): AccountRecord | null {
      const header = req.headers.authorization;
      const t =
        typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
      const session = auth.resolveToken(t);
      const account = session ? auth.getAccount(session.accountId) : null;
      if (!account?.admin) {
        reply.status(403).send({ code: 'ADMIN_REQUIRED' });
        return null;
      }
      return account;
    }

    await registerAdminRoutes(app, {
      rootDir: dir,
      auth,
      saves,
      world,
      requireAdmin,
      logAdmin: () => undefined,
      onLocationChanged: (id) => changed.push(id),
    });

    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/online/nope/purge-ghost',
      headers: { authorization: `Bearer ${reg.token}` },
    });
    expect(bad.statusCode).toBe(404);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/admin/online/ghost1/purge-ghost',
      headers: { authorization: `Bearer ${reg.token}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).ok).toBe(true);
    expect(changed).toEqual(['starter_grove']);
    expect(world.listOnline()).toHaveLength(0);

    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/admin/debug/haven-map is admin-only and returns Tiled census', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'empery-admin-haven-map-'));
    const auth = new AuthService(join(dir, 'accounts.json'), join(dir, 'sessions.json'));
    const saves = new SaveManager(join(dir, 'saves'), normalizeSave);
    const world = new WorldRuntime();
    const app = Fastify({ logger: false });
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../');

    const reg = await auth.register('mapper', 'secret12');
    expect('token' in reg).toBe(true);
    if (!('token' in reg)) return;
    const token = reg.token;

    function requireAdmin(req: FastifyRequest, reply: FastifyReply): AccountRecord | null {
      const header = req.headers.authorization;
      const t =
        typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
      const session = auth.resolveToken(t);
      if (!session) {
        reply.status(401).send({ error: 'auth', code: 'AUTH_REQUIRED' });
        return null;
      }
      const account = auth.getAccount(session.accountId);
      if (!account?.admin) {
        reply.status(403).send({ error: 'Нужны права администратора', code: 'ADMIN_REQUIRED' });
        return null;
      }
      return account;
    }

    await registerAdminRoutes(app, {
      rootDir: repoRoot,
      auth,
      saves,
      world,
      requireAdmin,
      logAdmin: () => undefined,
    });

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/debug/haven-map',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(forbidden.statusCode).toBe(403);

    auth.setAdmin('mapper', true);
    const ok = await app.inject({
      method: 'GET',
      url: '/api/admin/debug/haven-map',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.statusCode).toBe(200);
    const body = JSON.parse(ok.body) as { tilesW: number; tilesH: number; npcs: unknown[] };
    expect(body.tilesW).toBe(120);
    expect(body.tilesH).toBe(84);
    expect(body.npcs.length).toBeGreaterThan(10);

    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
