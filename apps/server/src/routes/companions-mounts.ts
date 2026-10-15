import { locationDisallowsMount, type PlayerSave } from '@empery/shared';
import { computeStats } from '../services/stats.js';
import { getLocation } from '../services/locations.js';
import { pickupGroundLoot } from '../services/ground-loot.js';
import { buyCompanion, feedCompanion, loadCompanions, offerBreadToSeagull, trainCompanion } from '../services/companion.js';
import { gateNpcInteract } from '../services/npc-schedule-gate.js';
import { activateBatteryPack, radioStatus, repairFieldRadio, setRadioPower } from '../services/radio.js';
import { buyMount, getMount, loadMounts, mountStaminaOf, mountCanRunOf, toggleMount, dismount } from '../services/mounts.js';
import { playerCanRunOf, playerStaminaOf } from '../services/player-stamina.js';
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerCompanionsMountsRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
    saves,
    authority,
    dayNight,
    world,
    makePickupDeps,
    broadcastGroundLootRemoved,
    syncPresenceVitalsAndParty,
    executeSaveCommand,
    sendToLocation,
  } = context;
  // HTTP save checkpoints may lag behind the authoritative WebSocket actor.
  // Every mount transition must return the same live pose, including dismounts.
  function atCurrentPose(save: PlayerSave): PlayerSave {
    const presence = world.presenceForSave(save.id);
    if (presence?.locationId !== save.location || !Number.isFinite(presence.x) || !Number.isFinite(presence.y)) return save;
    return { ...save, worldX: presence.x, worldY: presence.y };
  }
  app.post<{Params:{id:string};Body:Record<string,never>}>('/api/saves/:id/mount/stamina',async(req,reply)=>executeSaveCommand(req,reply,req.params.id,save=>({save:{id:save.id,mount:save.mount},stats:{mountStamina:mountStaminaOf(save),mountCanRun:mountCanRunOf(save)}})));

  app.post<{Params:{id:string};Body:Record<string,never>}>('/api/saves/:id/player-stamina',async(req,reply)=>executeSaveCommand(req,reply,req.params.id,save=>({save,stats:{stamina:playerStaminaOf(save),staminaCanRun:playerCanRunOf(save)}})));

  app.get<{ Params: { id: string } }>('/api/saves/:id/radio', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const status = radioStatus(save);
    const saved = saves.save(status.save);
    return { ...status, save: saved };

    });
  });

  app.post<{ Params: { id: string }; Body: { packId?: string } }>(
    '/api/saves/:id/radio/activate',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const result = activateBatteryPack(save, req.body?.packId);
      if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
      const saved = saves.save(result.save);
      return { ...radioStatus(saved), message: result.message };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { on: boolean } }>('/api/saves/:id/radio/power', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const result = setRadioPower(save, Boolean(req.body?.on));
    if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
    const saved = saves.save(result.save);
    return { ...radioStatus(saved), message: result.message };

    });
  });

  app.post<{ Params: { id: string } }>('/api/saves/:id/radio/repair', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const gate = gateNpcInteract(dayNight, 'town_radio', save.location);
    if (!gate.ok) return reply.status(400).send({ error: gate.message, save });
    const result = repairFieldRadio(save);
    if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
    const saved = saves.save(result.save);
    return { ...radioStatus(saved), message: result.message };

    });
  });

  app.get('/api/mounts', async () => ({ mounts: loadMounts() }));

  app.post<{ Params: { id: string }; Body: { mountId?: string } }>(
    '/api/saves/:id/mount/buy',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const gate = gateNpcInteract(dayNight, 'town_stable', save.location);
      if (!gate.ok) return reply.status(400).send({ error: gate.message, save });
      const mountId = req.body?.mountId ?? 'field_horse';
      const result = buyMount(save, mountId);
      if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
      const saved = saves.save(result.save);
      world.syncLookFromSave(saved);
      return { save: saved, stats: computeStats(saved), message: result.message, mount: getMount(mountId) };

    });
  },
  );

  app.post<{ Params: { id: string } }>('/api/saves/:id/mount/toggle', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const loc = getLocation(save.location);
    if (loc && locationDisallowsMount(loc) && !save.mount?.mounted) {
      return reply.status(400).send({ error: 'В помещении нельзя сесть на коня', save });
    }
    const result = toggleMount(atCurrentPose(save));
    if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
    if (result.save.mount?.mounted) {
      const pose = { x: result.save.worldX ?? loc?.spawn.x ?? 0, y: result.save.worldY ?? loc?.spawn.y ?? 0 };
      if (authority.collisionWorld(result.save).blocked(pose.x, pose.y)) return reply.status(400).send({ error: 'Здесь тесно для посадки на коня', save });
      result.save.worldX = pose.x; result.save.worldY = pose.y;
    }
    const saved = saves.save(result.save);
    world.syncLookFromSave(saved);
    return {
      save: saved,
      stats: computeStats(saved),
      message: result.message,
      mounted: Boolean(saved.mount?.mounted),
    };

    });
  });

  app.post<{ Params: { id: string } }>('/api/saves/:id/mount/dismount', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const saved = saves.save(dismount(atCurrentPose(save)));
    world.syncLookFromSave(saved);
    return { save: saved, stats: computeStats(saved), mounted: false };

    });
  });

  app.get('/api/companions', async () => ({ companions: loadCompanions().filter((c) => c.kind === 'puppy') }));

  app.post<{ Params: { id: string }; Body: { companionId?: string } }>(
    '/api/saves/:id/companion/buy',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const gate = gateNpcInteract(dayNight, 'town_stable', save.location);
      if (!gate.ok) return reply.status(400).send({ error: gate.message, save });
      const companionId = req.body?.companionId ?? 'haven_puppy';
      const result = buyCompanion(save, companionId);
      if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
      const saved = saves.save(result.save);
      return { save: saved, stats: computeStats(saved), message: result.message, companion: saved.companion };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { itemId?: string } }>(
    '/api/saves/:id/companion/feed',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const result = feedCompanion(save, req.body?.itemId ?? '');
      if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
      const saved = saves.save(result.save);
      return { save: saved, stats: computeStats(saved), message: result.message, companion: saved.companion };

    });
  },
  );

  app.post<{ Params: { id: string } }>('/api/saves/:id/companion/train', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const result = trainCompanion(save);
    if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
    const saved = saves.save(result.save);
    return { save: saved, stats: computeStats(saved), message: result.message, companion: saved.companion };

    });
  });

  app.post<{
    Params: { id: string };
    Body: { seagullId?: string; x?: number; y?: number };
  }>('/api/saves/:id/companion/offer-bread', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const presence = world.presenceForSave(save.id);
    const px = typeof req.body?.x === 'number' ? req.body.x : presence?.x ?? save.worldX ?? 0;
    const py = typeof req.body?.y === 'number' ? req.body.y : presence?.y ?? save.worldY ?? 0;
    const result = offerBreadToSeagull(save, {
      seagullId: req.body?.seagullId ?? '',
      playerX: px,
      playerY: py,
      locationId: presence?.locationId ?? save.location,
    });
    if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
    const saved = saves.save(result.save);
    if (result.tamed) {
      sendToLocation(saved.location, {
        type: 'companion_tamed',
        payload: {
          saveId: saved.id,
          kind: 'seagull',
          variantId: saved.companion?.variantId ?? 'secret_seagull',
        },
      });
    }
    return {
      save: saved,
      stats: computeStats(saved),
      message: result.message,
      tamed: Boolean(result.tamed),
      companion: saved.companion,
    };

    });
  });

  app.post<{ Params: { id: string }; Body: { lootId?: string } }>(
    '/api/saves/:id/loot/pickup',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const lootId = req.body?.lootId ?? '';
      if (!lootId) return reply.status(400).send({ error: 'lootId required' });
      const result = pickupGroundLoot(save.id, lootId, makePickupDeps());
      if (!result.ok) return reply.status(400).send({ error: result.error });
      if (result.pile) {
        broadcastGroundLootRemoved(result.pile.id, result.pile.locationId, 'picked', {
          pickedBySaveId: save.id,
          via: 'player',
        });
      }
      const refreshed = saves.load(save.id) ?? save;
      for (const grant of result.grants ?? []) {
        const g = saves.load(grant.saveId);
        if (g) syncPresenceVitalsAndParty(g);
      }
      return {
        save: refreshed,
        stats: computeStats(refreshed),
        summary: result.summary,
        lootId,
      };

    });
  },
  );
}
