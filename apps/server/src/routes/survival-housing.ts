import { computeStats, applyStatsToSave } from '../services/stats.js';
import { getLocation } from '../services/locations.js';
import { invalidateEncounterForSave } from '../services/encounter.js';
import { depositToHousing, enterApartment, housingPublicView, purchaseOrUpgradeApartment, restAtApartment, withdrawFromHousing, type HousingStorageKind } from '../services/housing.js';
import { enforceMountForLocation } from '../services/mounts.js';
import { consumeSurvivalItem, environmentSnapshot, processSurvival, spoilInventoryEntries, simulateSurvival, startSurvivalRest, survivalOf, treatSurvival } from '../services/survival.js';
import { nearbyStationKinds, withHomeHearthAccess } from '../services/processing.js';
import { recordSurvival } from '../services/survival-telemetry.js';
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerSurvivalHousingRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
    saves,
    dayNight,
    world,
    weather,
    executeSaveCommand,
  } = context;
  app.get<{ Params: { id: string } }>('/api/saves/:id/survival', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const now = Date.now();
    const presence = world.presenceForSave(save.id);
    const activePlay = Boolean(presence && presence.connectionStatus !== 'disconnected');
    const loc = getLocation(save.location);
    const mountSafe = enforceMountForLocation(save, loc);
    const withSpoil = spoilInventoryEntries(mountSafe, now);
    const next = simulateSurvival(
      withSpoil,
      {
        weather: weather.snapshot(),
        safeZone: Boolean(getLocation(save.location)?.safeZone),
        activePlay,
      },
      now,
    );
    const saved = saves.save(applyStatsToSave(next));
    return {
      save: saved,
      stats: computeStats(saved),
      survival: survivalOf(saved, now),
      environment: environmentSnapshot(saved.location, weather.snapshot(), weather, dayNight),
    };

    });
  });

  app.post<{ Params: { id: string }; Body: { itemId: string } }>(
    '/api/saves/:id/survival/consume',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const now = Date.now();
      const prepared = simulateSurvival(
        save,
        { weather: weather.snapshot(), safeZone: Boolean(getLocation(save.location)?.safeZone) },
        now,
      );
      const result = consumeSurvivalItem(prepared, req.body?.itemId ?? '', now);
      if (!result.ok) return reply.status(400).send({ error: result.message });
      recordSurvival('consumes');
      const saved = saves.save(applyStatsToSave(result.save));
      return { save: saved, stats: computeStats(saved), message: result.message };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { itemId: string } }>(
    '/api/saves/:id/survival/treat',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const result = treatSurvival(save, req.body?.itemId ?? '');
      if (!result.ok) return reply.status(400).send({ error: result.message });
      recordSurvival('treatments');
      const saved = saves.save(applyStatsToSave(result.save));
      return { save: saved, stats: computeStats(saved), message: result.message };

    });
  },
  );

  app.post<{ Params: { id: string } }>('/api/saves/:id/survival/rest', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const result = startSurvivalRest(save);
    if (!result.ok) return reply.status(400).send({ error: result.message });
    const saved = saves.save(applyStatsToSave(result.save));
    return { save: saved, stats: computeStats(saved), message: result.message };

    });
  });

  app.post<{
    Params: { id: string };
    Body: { recipeId: string };
  }>('/api/saves/:id/survival/process', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const presence = world.presenceForSave(save.id);
    const location = getLocation(save.location);
    const px =
      presence && Number.isFinite(presence.x)
        ? presence.x
        : typeof save.worldX === 'number'
          ? save.worldX
          : location?.spawn.x;
    const py =
      presence && Number.isFinite(presence.y)
        ? presence.y
        : typeof save.worldY === 'number'
          ? save.worldY
          : location?.spawn.y;
    const nearStations =
      location && typeof px === 'number' && typeof py === 'number'
        ? withHomeHearthAccess(location, nearbyStationKinds(location.stations, px, py))
        : location
          ? withHomeHearthAccess(location, new Set())
          : undefined;
    const result = processSurvival(save, req.body?.recipeId ?? '', Date.now(), { nearStations });
    if (!result.ok) return reply.status(400).send({ error: result.message });
    recordSurvival('processes');
    const saved = saves.save(applyStatsToSave(result.save));
    return { save: saved, stats: computeStats(saved), message: result.message };

    });
  });

  app.get<{ Params: { id: string } }>('/api/saves/:id/housing', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    return housingPublicView(save);

    });
  });

  app.post<{ Params: { id: string }; Body: { tier: number } }>(
    '/api/saves/:id/housing/buy',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const result = purchaseOrUpgradeApartment(save, Number(req.body?.tier));
      if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
      const saved = saves.save(result.save);
      return { save: saved, stats: computeStats(saved), message: result.message, housing: housingPublicView(saved) };

    });
  },
  );

  app.post<{ Params: { id: string } }>('/api/saves/:id/housing/enter', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const result = enterApartment(save);
    if (!result.ok || !result.locationId) {
      return reply.status(400).send({ error: result.message, save: result.save });
    }
    invalidateEncounterForSave(save.id);
    const loc = getLocation(result.locationId)!;
    const saved = saves.save(result.save, { sync: true });
    return {
      save: saved,
      stats: computeStats(saved),
      message: result.message,
      location: { ...loc, spawn: loc.spawn },
    };

    });
  });

  app.post<{ Params: { id: string } }>('/api/saves/:id/housing/rest', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const result = restAtApartment(save);
    if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
    const saved = saves.save(result.save);
    return { save: saved, stats: computeStats(saved), message: result.message };

    });
  });

  app.post<{
    Params: { id: string };
    Body: { kind: HousingStorageKind; inventoryIndex: number };
  }>('/api/saves/:id/housing/storage/deposit', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    if (save.location !== 'haven_apartment') {
      return reply.status(400).send({ error: 'Хранилище доступно только в квартире.' });
    }
    const kind = req.body?.kind;
    if (kind !== 'materials' && kind !== 'gear' && kind !== 'food') {
      return reply.status(400).send({ error: 'Неверный тип хранилища.' });
    }
    const result = depositToHousing(save, kind, Number(req.body?.inventoryIndex));
    if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
    const saved = saves.save(result.save);
    return { save: saved, stats: computeStats(saved), message: result.message, housing: housingPublicView(saved) };

    });
  });

  app.post<{
    Params: { id: string };
    Body: { kind: HousingStorageKind; storageIndex: number };
  }>('/api/saves/:id/housing/storage/withdraw', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    if (save.location !== 'haven_apartment') {
      return reply.status(400).send({ error: 'Хранилище доступно только в квартире.' });
    }
    const kind = req.body?.kind;
    if (kind !== 'materials' && kind !== 'gear' && kind !== 'food') {
      return reply.status(400).send({ error: 'Неверный тип хранилища.' });
    }
    const result = withdrawFromHousing(save, kind, Number(req.body?.storageIndex));
    if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
    const saved = saves.save(result.save);
    return { save: saved, stats: computeStats(saved), message: result.message, housing: housingPublicView(saved) };

    });
  });
}
