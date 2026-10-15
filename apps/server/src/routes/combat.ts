import { computeStats } from '../services/stats.js';
import { resolveBatchAttack, resolveMountCharge, toCombatBatchWire } from '../services/batch-combat.js';
import { encounterHasParticipant, startEncounter, getEncounter, syncQuestSpawns } from '../services/encounter.js';
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerCombatRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
    authority,
    saves,
    quests,
    world,
    parties,
    partyLookup,
    withGroundLootWire,
    syncPresenceVitalsAndParty,
    sharePartyKillXp,
    sharePartyQuestCredit,
    killedEnemyTypesFromHits,
    executeSaveCommand,
    broadcastEnemySnapshot,
    broadcastEncounterById,
    refreshQuestSpawnsForParticipants,
    combatContext,
    canAct,
  } = context;
  app.post<{ Params: { id: string }; Body: { locationId: string } }>(
    '/api/saves/:id/encounter/start',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      try {
        const result = startEncounter(save, req.body.locationId);
        broadcastEnemySnapshot(req.body.locationId);
        return result;
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : 'Encounter failed' });
      }

    });
  },
  );

  app.post<{
    Params: { id: string };
    Body: {
      encounterId: string;
      skillId?: string;
      moving?: boolean;
      dashing?: boolean;
      nearbyEnemyCount?: number;
      targetEntityIds: string[];
      playerX?: number;
      playerY?: number;
    };
  }>('/api/saves/:id/combat/batch-attack', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      if (!canAct(save)) return reply.status(409).send({error:'Attack is not ready'});
      const { shareCount } = parties.eligibleForKillXp(save.id, partyLookup);
      const result = resolveBatchAttack(
        save,
        req.body.encounterId,
        req.body.targetEntityIds ?? [],
        {
          skillId: req.body.skillId,
          ...combatContext(save),
          partyShareCount: shareCount,
        },
        quests,
      );

      if ('error' in result) {
        return reply.status(404).send({ error: result.error });
      }

      const withLoot = withGroundLootWire(result);
      const saved = saves.save(withLoot.save);
      if (withLoot.hits.some((h) => h.killed)) {
        if (withLoot.xpGained) sharePartyKillXp(saved, withLoot.xpGained);
        sharePartyQuestCredit(saved, killedEnemyTypesFromHits(req.body.encounterId, withLoot.hits));
        refreshQuestSpawnsForParticipants(req.body.encounterId);
      }
      world.noteCombatActivity(saved.id);
      syncPresenceVitalsAndParty(saved);
      return toCombatBatchWire(save, { ...withLoot, save: saved });
    });
  });

  app.post<{
    Params: { id: string };
    Body: {
      encounterId: string;
      entityId: string;
      moving?: boolean;
      dashing?: boolean;
      nearbyEnemyCount?: number;
    };
  }>('/api/saves/:id/combat/bleed-kill', async (req, reply) => {
    return executeSaveCommand(req,reply,req.params.id,save=>{
      const encounter = getEncounter(req.body.encounterId);
      if (!encounterHasParticipant(encounter,save.id) || encounter?.locationId !== save.location) return reply.status(404).send({error:'Encounter not found'});
      return toCombatBatchWire(save,{save,stats:computeStats(save),hits:[]});
    });
  });

  app.post<{
    Params: { id: string };
    Body: {
      encounterId: string;
      targetEntityIds?: string[];
      playerX?: number;
      playerY?: number;
      nearbyEnemyCount?: number;
    };
  }>('/api/saves/:id/combat/mount-charge', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {

    if (!save.mount?.mounted || !canAct(save)) return reply.status(409).send({error:'Attack is not ready'});
    let chargeSave=save;
    if (!authority.consumeCharge(chargeSave)) {
      const dash=authority.requestDash(chargeSave);
      if (!dash.started || !authority.consumeCharge(dash.save)) return reply.status(409).send({error:'Charge is not ready'});
      chargeSave=saves.save(dash.save);
    }
    const { shareCount } = parties.eligibleForKillXp(save.id, partyLookup);
    const result = resolveMountCharge(
      chargeSave,
      req.body.encounterId,
      req.body.targetEntityIds ?? [],
      {
        partyShareCount: shareCount,
        chargeStaminaPaid: true,
        ...combatContext(save),
        dashing: true,
        moving: true,
      },
      quests,
    );

    if ('error' in result) {
      return reply.status(400).send({ error: result.error });
    }

    const withLoot = withGroundLootWire(result);
    const saved = saves.save(withLoot.save);
    if (withLoot.hits.some((h) => h.killed)) {
      if (withLoot.xpGained) sharePartyKillXp(saved, withLoot.xpGained);
      sharePartyQuestCredit(saved, killedEnemyTypesFromHits(req.body.encounterId, withLoot.hits));
      refreshQuestSpawnsForParticipants(req.body.encounterId);
    }
    world.noteCombatActivity(saved.id);
    syncPresenceVitalsAndParty(saved);
    broadcastEncounterById(req.body.encounterId);
    return toCombatBatchWire(save, { ...withLoot, save: saved });

    });
  });

  app.post<{ Params: { id: string }; Body: { encounterId: string } }>(
    '/api/saves/:id/encounter/farm-respawn',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const encounter = getEncounter(req.body.encounterId);
      if (!encounter || !encounterHasParticipant(encounter, save.id) || encounter.locationId !== save.location) {
        return reply.status(404).send({ error: 'Encounter not found' });
      }
      // Respawn scheduling belongs to the simulation clock, not a client request.
      broadcastEnemySnapshot(encounter.locationId);
      return { spawned: null };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { encounterId: string } }>(
    '/api/saves/:id/encounter/sync-quests',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const added = syncQuestSpawns(req.body.encounterId, save);
      if (added.length) broadcastEncounterById(req.body.encounterId);
      return { entities: added };

    });
  },
  );
}
