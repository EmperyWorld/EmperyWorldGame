import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SaveManager } from '@empery/save';
import type { AuthService, AccountRecord } from './auth.js';
import type { WorldRuntime } from './multiplayer.js';
import { loadItems } from './items.js';
import { loadSkills } from './skills.js';
import { loadEnemies } from './enemies.js';
import { loadLocations } from './locations.js';
import { resetEncounterForLocation } from './encounter.js';
import type { WorldWeather } from './survival.js';
import {
  applyAdminSavePatch,
  grantItemToSave,
  toAdminSaveListRow,
  type AdminSavePatch,
} from './admin-saves.js';
import {
  cancelAdminJob,
  configureAdminJobs,
  getAdminJob,
  getLatestAdminJob,
  listAdminJobs,
  startGenerateItemsJob,
  startGenerateMediaJob,
  type GenerateItemsJobInput,
  type GenerateMediaJobInput,
} from './admin-jobs.js';
import { buildHavenMapDump, havenMapDumpAllowed } from './haven-map-dump.js';
import { buildAdminMediaStatus } from './admin-media.js';
import {
  saveHavenPropOverrides,
  type SaveHavenPropsInput,
} from './haven-map-editor.js';

export interface AdminRoutesDeps {
  rootDir: string;
  mediaOutputDir?: string;
  auth: AuthService;
  saves: SaveManager;
  world: WorldRuntime;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => AccountRecord | null;
  logAdmin: (who: string, action: string, detail?: Record<string, unknown>) => void;
  /** После purge ghost — разослать snapshot локации. */
  onLocationChanged?: (locationId: string) => void;
  survivalAdmin?: {
    weather: () => WorldWeather;
    setWeather: (id: WorldWeather['id']) => WorldWeather | null;
    telemetry?: () => Record<string, number | string>;
    patchSurvival?: (
      saveId: string,
      patch: Partial<{
        satiety: number;
        hydration: number;
        bodyTemperature: number;
        fatigue: number;
        wetness: number;
        clearConditions: boolean;
      }>,
    ) => { ok: boolean; message: string; save?: unknown };
  };
}

export async function registerAdminRoutes(app: FastifyInstance, deps: AdminRoutesDeps): Promise<void> {
  const {
    rootDir,
    mediaOutputDir,
    saves,
    world,
    requireAdmin,
    logAdmin,
    onLocationChanged,
    survivalAdmin,
  } = deps;
  configureAdminJobs(rootDir);

  app.get('/api/admin/saves', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    const rows = saves
      .list()
      .map((slot) => {
        const save = saves.load(slot.id);
        return save ? toAdminSaveListRow(save) : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    logAdmin(account.username, 'saves.list', { count: rows.length });
    return { saves: rows };
  });

  app.get<{ Params: { id: string } }>('/api/admin/saves/:id', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    const save = saves.load(req.params.id);
    if (!save) return reply.status(404).send({ error: 'Save not found' });
    logAdmin(account.username, 'saves.get', { saveId: save.id });
    return { save };
  });

  app.patch<{ Params: { id: string }; Body: AdminSavePatch }>(
    '/api/admin/saves/:id',
    async (req, reply) => {
      const account = requireAdmin(req, reply);
      if (!account) return;
      const existing = saves.load(req.params.id);
      if (!existing) return reply.status(404).send({ error: 'Save not found' });
      const body = req.body ?? {};
      const allowed: AdminSavePatch = {};
      if (body.hp !== undefined) allowed.hp = body.hp;
      if (body.mp !== undefined) allowed.mp = body.mp;
      if (body.xp !== undefined) allowed.xp = body.xp;
      if (body.level !== undefined) allowed.level = body.level;
      if (body.adena !== undefined) allowed.adena = body.adena;
      if (body.location !== undefined) allowed.location = body.location;
      if (body.karma !== undefined) allowed.karma = body.karma;
      const next = applyAdminSavePatch(existing, allowed);
      const saved = saves.save(next, { sync: true });
      logAdmin(account.username, 'saves.patch', { saveId: saved.id, patch: allowed });
      return { save: saved };
    },
  );

  app.post<{ Params: { id: string }; Body: { itemId?: string; count?: number } }>(
    '/api/admin/saves/:id/grant-item',
    async (req, reply) => {
      const account = requireAdmin(req, reply);
      if (!account) return;
      const existing = saves.load(req.params.id);
      if (!existing) return reply.status(404).send({ error: 'Save not found' });
      const result = grantItemToSave(existing, req.body?.itemId ?? '', req.body?.count ?? 1);
      if ('error' in result) return reply.status(400).send(result);
      const saved = saves.save(result.save, { sync: true });
      logAdmin(account.username, 'saves.grant-item', {
        saveId: saved.id,
        itemId: req.body?.itemId,
        granted: result.granted,
      });
      return { save: saved, granted: result.granted };
    },
  );

  app.get('/api/admin/online', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    const players = world.listOnline();
    const ghosts = players.filter((p) => p.connectionStatus === 'disconnected');
    const live = players.filter((p) => p.connectionStatus !== 'disconnected');
    return {
      count: players.length,
      liveCount: live.length,
      ghostCount: ghosts.length,
      players,
    };
  });

  app.post<{ Params: { saveId: string } }>(
    '/api/admin/online/:saveId/purge-ghost',
    async (req, reply) => {
      const account = requireAdmin(req, reply);
      if (!account) return;
      const saveId = req.params.saveId;
      const presence = world.presenceForSave(saveId);
      if (!presence) {
        return reply.status(404).send({ error: 'Игрок не в мире' });
      }
      if (presence.connectionStatus !== 'disconnected') {
        return reply.status(400).send({ error: 'Это не DISCONNECT-призрак' });
      }
      const left = world.purgeGhost(saveId);
      if (!left) {
        return reply.status(404).send({ error: 'Призрак не найден' });
      }
      onLocationChanged?.(left.locationId);
      logAdmin(account.username, 'online.purge-ghost', {
        saveId,
        name: left.name,
        locationId: left.locationId,
      });
      return { ok: true, purged: left };
    },
  );

  app.post<{ Params: { locationId: string } }>(
    '/api/admin/encounters/:locationId/reset',
    async (req, reply) => {
      const account = requireAdmin(req, reply);
      if (!account) return;
      const locationId = req.params.locationId;
      const reset = resetEncounterForLocation(locationId);
      logAdmin(account.username, 'encounters.reset', { locationId, reset });
      return { locationId, reset };
    },
  );

  app.get('/api/admin/survival/weather', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    if (!survivalAdmin) return reply.status(404).send({ error: 'Survival is unavailable' });
    return { weather: survivalAdmin.weather() };
  });

  app.post<{ Body: { id?: WorldWeather['id'] } }>(
    '/api/admin/survival/weather',
    async (req, reply) => {
      const account = requireAdmin(req, reply);
      if (!account) return;
      if (!survivalAdmin) return reply.status(404).send({ error: 'Survival is unavailable' });
      const weather = req.body?.id ? survivalAdmin.setWeather(req.body.id) : null;
      if (!weather) return reply.status(400).send({ error: 'Unknown weather state' });
      logAdmin(account.username, 'survival.weather', { weather: weather.id });
      return { weather };
    },
  );

  app.get('/api/admin/survival/telemetry', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    if (!survivalAdmin?.telemetry) return reply.status(404).send({ error: 'Survival is unavailable' });
    return { telemetry: survivalAdmin.telemetry() };
  });

  app.get<{ Params: { id: string } }>('/api/admin/saves/:id/survival/events', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    const save = saves.load(req.params.id);
    if (!save) return reply.status(404).send({ error: 'Save not found' });
    return {
      saveId: save.id,
      events: save.survival?.events ?? [],
      conditions: save.survival?.conditions ?? [],
    };
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      satiety: number;
      hydration: number;
      bodyTemperature: number;
      fatigue: number;
      wetness: number;
      clearConditions: boolean;
    }>;
  }>('/api/admin/saves/:id/survival', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    if (!survivalAdmin?.patchSurvival) return reply.status(404).send({ error: 'Survival is unavailable' });
    const result = survivalAdmin.patchSurvival(req.params.id, req.body ?? {});
    if (!result.ok) return reply.status(400).send({ error: result.message });
    logAdmin(account.username, 'survival.patch', { saveId: req.params.id, body: req.body });
    return result;
  });

  app.get('/api/admin/content/summary', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    return {
      items: loadItems().length,
      skills: loadSkills().length,
      enemies: loadEnemies().length,
      locations: loadLocations().length,
    };
  });

  app.post<{ Body: GenerateItemsJobInput }>('/api/admin/generate/items', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    try {
      const job = startGenerateItemsJob(rootDir, account.username, req.body ?? {});
      logAdmin(account.username, 'generate.items', { jobId: job.id, args: job.args });
      return { job };
    } catch (err) {
      return reply.status(409).send({
        error: err instanceof Error ? err.message : 'Unable to start item generation',
      });
    }
  });

  app.post<{ Body: GenerateMediaJobInput }>('/api/admin/generate/media', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    try {
      const job = startGenerateMediaJob(rootDir, account.username, req.body ?? {});
      logAdmin(account.username, 'generate.media', { jobId: job.id, args: job.args });
      return { job };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bad request';
      return reply.status(message.includes('already running') ? 409 : 400).send({
        error: message,
      });
    }
  });

  app.get('/api/admin/media/status', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    const status = buildAdminMediaStatus(rootDir, mediaOutputDir);
    return {
      ...status,
      latestJob: getLatestAdminJob('generate_media') ?? null,
    };
  });

  app.get<{ Params: { id: string } }>('/api/admin/jobs/:id', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    const job = getAdminJob(req.params.id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    return { job };
  });

  app.get<{ Querystring: { limit?: string } }>('/api/admin/jobs', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    const limit = Number.parseInt(req.query.limit ?? '50', 10);
    return { jobs: listAdminJobs(Number.isFinite(limit) ? limit : 50) };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/jobs/:id', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    const existing = getAdminJob(req.params.id);
    if (!existing) return reply.status(404).send({ error: 'Job not found' });
    if (existing.status !== 'queued' && existing.status !== 'running') {
      return reply.status(409).send({ error: `Job is already ${existing.status}` });
    }
    const job = cancelAdminJob(existing.id, account.username);
    logAdmin(account.username, 'job.cancel', { jobId: existing.id, kind: existing.kind });
    return { job };
  });

  app.get('/api/admin/debug/haven-map', async (req, reply) => {
    const account = requireAdmin(req, reply);
    if (!account) return;
    if (!havenMapDumpAllowed()) {
      return reply.status(404).send({ error: 'Not found' });
    }
    try {
      const dump = buildHavenMapDump(rootDir);
      logAdmin(account.username, 'debug.haven-map', { tiles: dump.tiles.data.length });
      return dump;
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'haven-map dump failed',
      });
    }
  });

  app.put<{ Body: SaveHavenPropsInput }>(
    '/api/admin/debug/haven-map/props',
    async (req, reply) => {
      const account = requireAdmin(req, reply);
      if (!account) return;
      if (!havenMapDumpAllowed()) {
        return reply.status(404).send({ error: 'Not found' });
      }
      try {
        const result = await saveHavenPropOverrides(rootDir, account.username, req.body);
        logAdmin(account.username, 'haven-map.props.save', { ...result });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Haven map save failed';
        const status = message.includes('reload before saving') ? 409 : 400;
        return reply.status(status).send({ error: message });
      }
    },
  );
}
