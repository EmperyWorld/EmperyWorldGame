import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type PlayerSave } from '@empery/shared';
import { getRace } from '../services/content.js';
import { computeStats, applyStatsToSave } from '../services/stats.js';
import { getProfession, starterSkillsFor } from '../services/professions.js';
import { skillsForSave, nextSkillRankAtLevel } from '../services/skills.js';
import { normalizeSave, applySavePatch } from '../services/save-normalize.js';
import { refreshMountStamina } from '../services/mounts.js';
import { refreshPlayerStamina } from '../services/player-stamina.js';
import { applyArcherStarterGear, applyMysticStarterGear } from '../services/ranged.js';
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerCharactersRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
    rootDir,
    comfy,
    mediaJobs,
    saves,
    auth,
    world,
    requireAccount,
    requireOwnedSave,
    executeSaveCommand,
    executeAccountCommand,
    syncAccountSaves,
  } = context;
  app.get('/api/saves', async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return;
    const saveIds = await syncAccountSaves(account.id);
    return saves.listByIds(saveIds);
  });

  app.get('/api/saves/orphans', async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return;
    return saves.listOrphans();
  });

  app.post<{ Body: { saveId?: string; all?: boolean } }>('/api/saves/claim', async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return;

    return executeAccountCommand(req,reply,account.id,()=>{
    const claimOne = (saveId: string): PlayerSave | null => {
      const save = saves.load(saveId);
      if (!save) return null;
      if (save.accountId && save.accountId !== account.id) return null;
      if (save.accountId === account.id) {
        auth.attachSave(account.id, save.id);
        return save;
      }
      const stamped = saves.save({ ...save, accountId: account.id });
      auth.attachSave(account.id, stamped.id);
      return stamped;
    };

    if (req.body?.all) {
      const claimed = saves
        .listOrphans()
        .map((slot) => claimOne(slot.id))
        .filter((s): s is PlayerSave => s !== null);
      return { claimed: claimed.map((s) => ({ id: s.id, name: s.name, level: s.level })) };
    }

    const saveId = req.body?.saveId?.trim();
    if (!saveId) return reply.status(400).send({ error: 'saveId required', code: 'BAD_SAVE_ID' });
    const save = claimOne(saveId);
    if (!save) {
      return reply.status(404).send({ error: 'Нет свободного сохранения', code: 'NOT_ORPHAN' });
    }
    return { claimed: [{ id: save.id, name: save.name, level: save.level }] };
    });
  });

  app.post<{ Body: { name: string; race: string; gender?: string; profession?: string } }>(
    '/api/saves',
    async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return;

    return executeAccountCommand(req,reply,account.id,()=>{
    const race = getRace(req.body.race);
    if (!race) return reply.status(400).send({ error: 'Unknown race' });

    const gender = req.body.gender === 'female' ? 'female' : 'male';

    const professionId = req.body.profession ?? 'warrior';
    const profession = getProfession(professionId);
    if (!profession) return reply.status(400).send({ error: 'Unknown profession' });

    const save = normalizeSave(
      applyStatsToSave(
        applyMysticStarterGear(
          applyArcherStarterGear(
            saves.create({
              name: req.body.name,
              race: race.id,
              gender,
              profession: profession.id,
              location: race.startLocation,
              skillLevels: starterSkillsFor(profession.id, race.id),
              accountId: account.id,
            }),
          ),
        ),
      ),
    );
    const saved = saves.save({ ...save, accountId: account.id });
    auth.attachSave(account.id, saved.id);

    const portraitJob = mediaJobs.create(comfy, {
      profile: 'character_sheet',
      params: {
        name: saved.name,
        race: saved.race,
        gender: saved.gender ?? gender,
        profession: saved.profession ?? profession.id,
      },
    }, account.id);

    return { ...saved, portraitJobId: portraitJob.id };
    });
  });

  app.get<{ Params: { id: string } }>('/api/saves/:id', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    return save;

    });
  });

  app.delete<{ Params: { id: string } }>('/api/saves/:id', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const account = requireAccount(req, reply);
    if (!account) return;
    if (!saves.delete(save.id)) {
      return reply.status(404).send({ error: 'Save not found' });
    }
    auth.detachSave(account.id, save.id);
    return { ok: true };

    });
  });

  app.get<{ Params: { id: string } }>('/api/saves/:id/stats', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    let next = refreshMountStamina(save);
    next = refreshPlayerStamina(next);
    if (
      next.mount?.stamina !== save.mount?.stamina ||
      next.mount?.staminaAt !== save.mount?.staminaAt ||
      next.stamina !== save.stamina ||
      next.staminaAt !== save.staminaAt
    ) {
      saves.save(next);
    }
    return computeStats(next);

    });
  });

  app.post<{
    Body: {
      source?: string;
      now?: number;
      url?: string;
      userAgent?: string;
      saveId?: string | null;
      locationId?: string | null;
      worldTime?: unknown;
      havenSchedule?: unknown;
      settings?: unknown;
      graphicsQuality?: unknown;
      npcLifeEvents?: unknown[];
      note?: string;
    };
  }>('/api/debug/bug-report', async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return;

    const body = req.body ?? {};
    const saveId = typeof body.saveId === 'string' && body.saveId ? body.saveId : null;
    if (saveId) {
      const owned = await requireOwnedSave(req, reply, saveId);
      if (!owned) return;
    }

    const reportId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const report = {
      reportId,
      receivedAt: new Date().toISOString(),
      accountId: account.id,
      username: account.username,
      source: typeof body.source === 'string' ? body.source : 'unknown',
      now: typeof body.now === 'number' ? body.now : Date.now(),
      url: typeof body.url === 'string' ? body.url : null,
      userAgent: typeof body.userAgent === 'string' ? body.userAgent : null,
      saveId,
      locationId: typeof body.locationId === 'string' ? body.locationId : null,
      worldTime: body.worldTime ?? null,
      havenSchedule: body.havenSchedule ?? null,
      settings: body.settings ?? null,
      graphicsQuality: body.graphicsQuality ?? null,
      npcLifeEvents: Array.isArray(body.npcLifeEvents) ? body.npcLifeEvents.slice(-120) : [],
      note: typeof body.note === 'string' ? body.note : null,
    };

    const debugDir = join(rootDir, 'data');
    const reportFile = join(debugDir, 'bug-reports.jsonl');
    try {
      await mkdir(debugDir, { recursive: true });
      await appendFile(reportFile, `${JSON.stringify(report)}\n`, 'utf8');
    } catch (error) {
      req.log.warn({ err: error }, 'debug bug report persist failed');
      return reply.status(500).send({ error: 'Не удалось сохранить bug report' });
    }

    req.log.info({ reportId, saveId, accountId: account.id }, 'debug bug report stored');
    return { ok: true as const, reportId };
  });

  app.patch<{ Params: { id: string }; Body: Pick<PlayerSave, 'skillHotbar'> }>(
    '/api/saves/:id', async (req, reply) => executeSaveCommand(req, reply, req.params.id, save => saves.save(applySavePatch(save, req.body))),
  );

  app.post<{Params:{id:string};Body:{location:string}}>(
    '/api/saves/:id/position', async (req,reply) => executeSaveCommand(req,reply,req.params.id,save=>{
      const position = world.presenceForSave(save.id);
      if (!position || position.locationId !== save.location || req.body.location !== save.location) return reply.status(409).send({error:'Position session is stale'});
      // A keepalive checkpoints the server pose; client coordinates are never required.
      return saves.save({...save,worldX:position.x,worldY:position.y},{sync:true});
    }),
  );

  app.get<{ Params: { id: string } }>('/api/saves/:id/skills', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    return skillsForSave(save).map((skill) => {
      const level = save.skillLevels[skill.id] ?? 0;
      return {
        ...skill,
        level,
        cooldownUntil: save.skillCooldowns[skill.id] ?? null,
        nextRankAt: nextSkillRankAtLevel(skill, level),
      };
    });

    });
  });
}
