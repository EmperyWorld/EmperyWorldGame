import { computeStats, applyStatsToSave } from '../services/stats.js';
import { canTravel, getLocation, loadLocations, homelandForRace, arrivalSpawnForTravel, respawnTownLocation } from '../services/locations.js';
import { invalidateEncounterForSave } from '../services/encounter.js';
import { enforceMountForLocation } from '../services/mounts.js';
import { consumeResurrectionScroll, respawnInPlace, respawnInTown, RESURRECT_REACH, resurrectionPosition } from '../services/respawn.js';
import { distance2d } from '../services/pvp.js';
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerTravelRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
    saves,
    authority,
    world,
    parties,
    broadcastPartySnapshot,
    executeSaveCommand,
    sendToLocation,
  } = context;
  app.post<{ Params: { id: string }; Body: { locationId: string } }>(
    '/api/saves/:id/travel',
    async (req, reply) => {
      return executeSaveCommand(req, reply, req.params.id, (save) => {
        const check = canTravel(save, req.body.locationId);
        if (!check.ok) return reply.status(400).send({ error: check.reason });

        const loc = getLocation(req.body.locationId)!;
        const fromLocationId = save.location;
        const rawArrival = arrivalSpawnForTravel(fromLocationId, loc);
        const arrival = { x: Math.round(rawArrival.x), y: Math.round(rawArrival.y) };
        let traveled: import('@empery/shared').PlayerSave = {
          ...save,
          location: loc.id,
          worldX: Math.round(arrival.x),
          worldY: Math.round(arrival.y),
        };
        if (loc.safeZone) {
          const statsPreview = computeStats(traveled);
          traveled = { ...traveled, mp: statsPreview.maxMp };
        }
        traveled = enforceMountForLocation(traveled, loc);
        if (authority.collisionWorld(traveled).blocked(arrival.x, arrival.y)) return reply.status(409).send({ error: 'Точка перехода недоступна — попробуйте позже' });
        const next = saves.save(applyStatsToSave(traveled), { sync: true });
        invalidateEncounterForSave(save.id);
        world.purgeGhost(save.id);
        world.syncLookFromSave(next);
        return {
          save: next,
          location: { ...loc, spawn: arrival },
          stats: computeStats(next),
        };
      });
    },
  );

  app.get<{ Params: { id: string } }>('/api/saves/:id/travel/options', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {

    const homeland = homelandForRace(save.race);
    return loadLocations()
      .filter((loc) => !loc.privateOwnerOnly)
      .map((loc) => {
        const check = canTravel(save, loc.id);
        return {
          ...loc,
          canTravel: check.ok,
          lockReason: check.ok ? undefined : check.reason,
          recommended: loc.id === homeland,
        };
      });

    });
  });

  app.post<{ Params: { id: string } }>('/api/saves/:id/respawn', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    if (save.hp > 0) return reply.status(400).send({ error: 'Герой ещё жив' });

    const town = respawnTownLocation();
    if (!town) return reply.status(500).send({ error: 'Respawn town missing' });

    const fromLocationId = save.location;
    if (fromLocationId !== town.id) {
      invalidateEncounterForSave(save.id);
    }

    const result = respawnInTown(save);
    const townSpawn = town.spawn;
    const withPos = {
      ...result.save,
      worldX: Math.round(townSpawn.x),
      worldY: Math.round(townSpawn.y),
      lastDeathCause: null,
      lastDeathKind: null,
    };
    const saved = saves.save(withPos, { sync: true });
    authority.stop(saved);
    if (fromLocationId !== saved.location) world.purgeGhost(saved.id);
    else for (const connectionId of world.connectionIdsForSave(saved.id)) {
      world.updatePresence(connectionId, { x: saved.worldX!, y: saved.worldY!, moving: false, facing: world.presenceForSave(saved.id)?.facing ?? 'right' });
    }
    world.patchCombatPresence(saved.id, {
      hp: saved.hp,
      maxHp: saved.maxHp,
      mp: saved.mp ?? 0,
      maxMp: saved.maxMp ?? 0,
      mounted: false,
    });
    // мёртвый призрак / presence в старой локации — жёстко убрать и заново не нужно: клиент join_location
    const party = parties.getPartyForSave(saved.id);
    if (party) broadcastPartySnapshot(party.id);
    return {
      save: saved,
      stats: computeStats(saved),
      location: { ...town, spawn: town.spawn },
      relocated: fromLocationId !== town.id,
      xpLost: result.xpLost,
      adenaLost: result.adenaLost,
      deathKind: result.deathKind,
      mode: 'town' as const,
    };

    });
  });

  app.post<{
    Params: { id: string };
    Body: { targetSaveId: string };
  }>('/api/saves/:id/resurrect', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (caster) => {
    if (caster.hp <= 0) return reply.status(400).send({ error: 'Мёртвым не воскресить' });

    const targetId = req.body?.targetSaveId;
    if (!targetId || targetId === caster.id) {
      return reply.status(400).send({ error: 'Укажи цель' });
    }

    const target = saves.load(targetId);
    if (!target) return reply.status(404).send({ error: 'Цель не найдена' });
    if (target.hp > 0) return reply.status(400).send({ error: 'Цель ещё жива' });
    if (target.location !== caster.location) {
      return reply.status(400).send({ error: 'Цель в другой локации' });
    }

    const casterPres = world.presenceForSave(caster.id);
    const targetPres = world.presenceForSave(target.id);
    const casterPosition = resurrectionPosition(caster, casterPres);
    const targetPosition = resurrectionPosition(target, targetPres);
    if (!casterPosition || !targetPosition) return reply.status(400).send({ error: 'Положение персонажа неизвестно' });
    if (distance2d(casterPosition.x, casterPosition.y, targetPosition.x, targetPosition.y) > RESURRECT_REACH) {
      return reply.status(400).send({ error: 'Подойди ближе к павшему' });
    }
    if (!authority.collisionWorld(caster).hasLineOfSight(casterPosition, targetPosition)) {
      return reply.status(400).send({ error: 'Павший за препятствием' });
    }

    const consumed = consumeResurrectionScroll(caster);
    if (!consumed) {
      return reply.status(400).send({ error: 'Нет свитка воскрешения' });
    }

    const revived = respawnInPlace({ ...target, worldX: targetPosition.x, worldY: targetPosition.y });
    const savedCaster = saves.save(consumed, { sync: true });
    const savedTarget = saves.save(revived, { sync: true });
    authority.stop(savedTarget);
    world.patchCombatPresence(savedTarget.id, {
      hp: savedTarget.hp,
      maxHp: savedTarget.maxHp,
      mp: savedTarget.mp ?? 0,
      maxMp: savedTarget.maxMp ?? 0,
      mounted: false,
    });
    {
      const party = parties.getPartyForSave(savedTarget.id);
      if (party) broadcastPartySnapshot(party.id);
    }

    const payload = {
      targetSaveId: savedTarget.id,
      casterSaveId: savedCaster.id,
      casterName: savedCaster.name,
      targetName: savedTarget.name,
    };
    sendToLocation(savedTarget.location, { type: 'player_resurrected', payload });

    return {
      save: savedCaster,
      stats: computeStats(savedCaster),
      target: { save: savedTarget, stats: computeStats(savedTarget) },
      message: `Воскрешён ${savedTarget.name}`,
    };

    });
  });
}
