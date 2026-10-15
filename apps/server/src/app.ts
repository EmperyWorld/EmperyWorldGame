import { redactRequestUrl } from './services/request-logging.js';
import { PostgresAuthRepository } from './services/persistence/auth-repository.js';
import { getPgPool } from './services/persistence/pg.js';
import { MOVEMENT_STEP_MS } from '@empery/shared/movement';
import { EnemyReplication } from './services/enemy-replication.js';
import { PresenceReplication } from './services/presence-replication.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { registerWorldRoutes } from './routes/world.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCharactersRoutes } from './routes/characters.js';
import { registerSurvivalHousingRoutes } from './routes/survival-housing.js';
import { registerCompanionsMountsRoutes } from './routes/companions-mounts.js';
import { registerEconomyRoutes } from './routes/economy.js';
import { registerDialogueRoutes } from './routes/dialogue.js';
import { registerCombatRoutes } from './routes/combat.js';
import { registerTravelRoutes } from './routes/travel.js';
import { mkdirSync } from 'node:fs';

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { expireMobControl, type MultiplayerServerMessage, type PlayerSave } from '@empery/shared';
import { loadServicesConfig } from '@empery/shared/config';
import { GameKernel } from '@empery/core';
import { LlamaStack } from '@empery/llm';
import { ComfyUIClient, FileMediaJobStore } from '@empery/media';
import { SaveManager } from '@empery/save';
import { DialogueService } from './services/dialogue.js';

import { mediaStaticCacheControl } from './services/media-cache-headers.js';

import { computeStats, applyStatsToSave } from './services/stats.js';
import { applyVitalsRegen, VITALS_REGEN_MS } from './services/vitals-regen.js';
import { QuestService, getQuest, radioNpcForQuest } from './services/quests.js';

import { getLocation } from './services/locations.js';
import { createSnapshotCoalescer } from './services/snapshot-coalesce.js';
import { resolveEnemyHit } from './services/combat.js';
import { resolveBleedKill, type KillLootPending, type BatchAttackResult } from './services/batch-combat.js';
import { expireStale, listGroundLoot, pickupGroundLoot, spawnGroundLoot, type PickupDeps } from './services/ground-loot.js';
import { resolveLootOwner } from './services/loot-owner.js';
import { tickCompanionNeeds, normalizeCompanionState } from './services/companion.js';
import { DayNightService } from './services/day-night.js';
import { havenScheduleSnapshot } from './services/haven-schedule.js';

import { tickCompanionLoot } from './services/companion-loot.js';
import type { GroundLootPile, GroundLootSpawnedResult } from '@empery/shared';
import { getEncounter, getEncounterForLocation, listActiveEncounters, processFarmRespawns, syncQuestSpawns } from './services/encounter.js';
import { buildEnemySnapshot, tickEncounter, ENEMY_STOP_RANGE } from './services/encounter-sim.js';
import { questIdForEnemyType } from './services/quest-ids.js';

import { WorldRuntime } from './services/multiplayer.js';
import { openPersistence, closePersistence } from './services/persistence/index.js';
import { normalizeSave } from './services/save-normalize.js';

import { canRadioTalk } from './services/radio.js';

import { markCombatDeath } from './services/respawn.js';
import { AuthBusyError, AuthStorageError, AuthService, accountsFilePath, sessionsFilePath } from './services/auth.js';
import { registerAdminRoutes } from './services/admin-routes.js';
import { flushAdminJobs } from './services/admin-jobs.js';
import { PartyService } from './services/party.js';
import { grantXp } from './services/progression.js';

import { SURVIVAL_TICK_MS, WeatherService, applySurvivalCollapse, locationHeatSources, spoilInventoryEntries, simulateSurvival, survivalOf } from './services/survival.js';

import { recordSurvival, survivalTelemetrySnapshot } from './services/survival-telemetry.js';
import { applySharedQuestActivation, isQuestActiveFlag } from './services/party-quest-share.js';

import { registerRequestContracts } from './services/request-contracts.js';
import { RuntimeMetrics } from './services/runtime-metrics.js';
import { DurableProgress, ProgressUnavailableError } from './services/durable-progress.js';
import { PlayerAuthority } from './services/player-authority.js';
import type { DayNightConfig, ServicesConfig } from '@empery/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface GameServerOptions {
  config?: ServicesConfig;
  rootDir?: string;
  persistence?: boolean;
  simulation?: boolean;
  logger?: boolean;
  /** Isolated simulations can supply a clock without changing production content. */
  dayNightConfig?: DayNightConfig;
}
export async function createGameServer(options: GameServerOptions = {}) {
const config = options.config ?? loadServicesConfig();
const rootDir = options.rootDir ?? join(dirname(fileURLToPath(import.meta.url)), '../../../');
const authority = new PlayerAuthority(join(dirname(fileURLToPath(import.meta.url)), '../../client/public/maps'),()=>!havenScheduleSnapshot(dayNight).restActive);
const metrics = new RuntimeMetrics();
let progress: DurableProgress | null = null;
const primaryMode = options.persistence !== false && config.save.backend !== 'files';
let deferredCommandMessages:Array<()=>void>|null=null;
const timers: Array<ReturnType<typeof setInterval>> = [];
function scheduleInterval(fn: () => void, ms: number, label=`simulation.${ms}ms`): void {
  if(options.simulation===false)return;
  timers.push(setInterval(()=>{
    if(progress&&(!progress.healthy()||!auth.healthy()))return;
    const emissions:Array<()=>void>=[];deferredCommandMessages=emissions;
    try{metrics.measure(label,fn);}catch(error){console.error('[simulation]',error);if(progress)progress.invalidate(error);}
    finally{deferredCommandMessages=null;}
    if(progress&&(!progress.healthy()||!auth.healthy()))return;
    if(progress)void progress.flush().then(()=>{for(const emit of emissions)emit();}).catch(err=>console.error('[progress]',err));
    else for(const emit of emissions)emit();
  },ms));
}

const outputDir = join(rootDir, config.comfyui.outputDir);
const jobsDir = join(rootDir, config.comfyui.jobsDir);
mkdirSync(outputDir, { recursive: true });
mkdirSync(jobsDir, { recursive: true });

const llm = new LlamaStack(config.llama);
const comfy = new ComfyUIClient(config.comfyui.url, { ...config.comfyui, outputDir, jobsDir });
const mediaJobs = new FileMediaJobStore(jobsDir);
const saveDir = join(rootDir, config.save.dir);
const saves = new SaveManager(saveDir, normalizeSave);
let auth:AuthService;
const dayNight = new DayNightService(options.dayNightConfig ? { ...options.dayNightConfig } : undefined);
const dialogue = new DialogueService(llm, dayNight);
const quests = new QuestService();
const world = new WorldRuntime();
const parties = new PartyService();
const weather = new WeatherService();

const persistence = options.persistence === false ? { characters: null, presence: null, presenceBus: null, nodeId: 'offline' } : await openPersistence(primaryMode?config:{...config,persistence:{...config.persistence,postgres:undefined}}, {
  onPresenceEvent: (event) => world.applyRemotePresenceEvent(event),
}).catch((err) => {
  if (primaryMode) { metrics.close(); throw err; }
  console.error('[persistence] unavailable in explicit file mode', err);
  return { characters: null, presence: null, presenceBus: null, nodeId: 'offline' };
});
if (primaryMode) {
  if (!persistence.characters) { metrics.close(); throw new Error('save.backend=postgres requires configured PostgreSQL; file fallback is disabled'); }
  const repository = persistence.characters;
  try {
    let ownerLost:unknown;
    await repository.claimWorld(error=>{ownerLost=error;progress?.invalidate(error);});
    // Import only absent IDs while holding the world owner lock. Never overwrite DB progress.
    if(!await repository.migrationApplied()) {
      const remote=await repository.listAll(),ids=new Set(remote.map(save=>save.id));
      const imported=saves.listForMigration().filter(save=>!ids.has(save.id));
      await repository.commitChanges([...imported.map(save=>({id:save.id,save})),...saves.listDeletedIds().map(id=>({id,save:null}))],undefined,undefined,true);
      metrics.count('progress.imported',imported.length);
    }
    saves.usePrimary(await repository.listAll());
    if(ownerLost)throw ownerLost;
    const revisions=new Map((await repository.listAll()).map(save=>[save.id,save.revision??0]));
    progress = new DurableProgress(saves,async(changes,receipt)=>{
      await repository.commitChanges(changes,revisions,receipt);
      for(const change of changes)if(change.save)revisions.set(change.id,change.save.revision??0);else revisions.delete(change.id);
    },metrics);
  } catch (error) {
    await repository.releaseWorld().catch(()=>undefined);
    await closePersistence(); metrics.close(); throw error;
  }
  console.log('[persistence] PostgreSQL primary; local JSON retained as migration backups');
}
try {
  auth=primaryMode?await AuthService.postgres(accountsFilePath(rootDir),sessionsFilePath(rootDir),new PostgresAuthRepository(getPgPool()!)):new AuthService(accountsFilePath(rootDir),sessionsFilePath(rootDir));
}catch(error){await persistence.characters?.releaseWorld();await closePersistence();metrics.close();throw error;}
if (persistence.presence) {
  world.setPresenceRepository(persistence.presence);
  console.log('[persistence] Redis presence mirror on');
}
if (persistence.presenceBus) {
  world.setPresenceBus(persistence.presenceBus);
  console.log(`[persistence] Redis presence bus on (node=${persistence.nodeId})`);
}
world.setPersistenceProfile(primaryMode?'postgres':'file_saves',persistence.presence?'redis':'memory');
const presenceReplication=new PresenceReplication();
const enemyReplication=new EnemyReplication();
const socketIndex = new Map<string, { send: (payload: string) => void; close: () => void; bufferedAmount?:number; readyState?:number; once?:(event:string,fn:()=>void)=>unknown; terminate?:()=>void }>();
const chatLastSentAt = new Map<string, number>();
/** Throttle записи worldX/Y в сейв с player_input. */
/** Кулдаун удара моба по disconnect-призраку (как клиентский touch ~1400ms). */
const GHOST_ENEMY_HIT_MS = 1400;
/** Set EMPERY_SURVIVAL=0 for a reversible rollout rollback. */
const SURVIVAL_ENABLED = process.env.EMPERY_SURVIVAL !== '0';
/** Shadow mode: simulate and log, but do not persist vitals/collapse. */
const SURVIVAL_SHADOW = process.env.EMPERY_SURVIVAL_SHADOW === '1';

const partyLookup = {
  presenceForSave: (saveId: string) => world.presenceForSave(saveId),
  loadSave: (saveId: string) => saves.load(saveId),
  isCombatActive: (saveId: string) => world.isCombatActive(saveId),
};

const lootPartyLookup = {
  partyIdForSave: (saveId: string) => parties.getPartyId(saveId),
  partyLeaderSaveId: (partyId: string) => parties.getParty(partyId)?.leaderSaveId ?? null,
};

function makePickupDeps(): PickupDeps {
  return {
    partyIdForSave: (saveId) => parties.getPartyId(saveId),
    partyMemberSaveIds: (partyId) => parties.getParty(partyId)?.memberSaveIds ?? [],
    presenceForSave: (saveId) => {
      const p = world.presenceForSave(saveId);
      if (!p) return null;
      return { saveId: p.saveId, locationId: p.locationId, x: p.x, y: p.y };
    },
    canPickupAt: (saveId, x, y) => {
      const save = saves.load(saveId);
      const pose = world.presenceForSave(saveId);
      return Boolean(save && pose && pose.locationId === save.location && authority.collisionWorld(save).hasLineOfSight(pose, { x, y }));
    },
    loadSave: (saveId) => saves.load(saveId),
    savePlayer: (save) => saves.save(save),
  };
}

function broadcastGroundLootSpawned(pile: GroundLootPile): void {
  sendToLocation(pile.locationId, { type: 'ground_loot_spawned', payload: pile });
}

function broadcastGroundLootRemoved(
  id: string,
  locationId: string,
  reason: 'picked' | 'expired',
  meta?: { pickedBySaveId?: string; via?: 'player' | 'companion' },
): void {
  sendToLocation(locationId, {
    type: 'ground_loot_removed',
    payload: { id, locationId, reason, ...meta },
  });
}

/** Spawn ground piles from kill loot and return wire payloads. */
function finalizeKillLoot(pending: KillLootPending[] | undefined): GroundLootSpawnedResult[] {
  if (!pending?.length) return [];
  const spawned: GroundLootSpawnedResult[] = [];
  for (const kill of pending) {
    const owner = resolveLootOwner(kill.damageBySaveId, kill.killerSaveId, lootPartyLookup);
    const pile = spawnGroundLoot({
      locationId: kill.locationId,
      x: kill.x,
      y: kill.y,
      drops: kill.drops,
      owner,
    });
    if (!pile) continue;
    broadcastGroundLootSpawned(pile);
    spawned.push({
      id: pile.id,
      x: pile.x,
      y: pile.y,
      drops: pile.drops,
      ownerUntil: pile.ownerUntil,
    });
  }
  return spawned;
}

function withGroundLootWire(result: BatchAttackResult): BatchAttackResult {
  const groundLoot = finalizeKillLoot(result.killLoot);
  return groundLoot.length ? { ...result, groundLoot } : result;
}

function applyLootPickup(pickerSaveId: string, lootId: string): void {
  const result = pickupGroundLoot(pickerSaveId, lootId, makePickupDeps());
  const msg: MultiplayerServerMessage = {
    type: 'loot_pickup_result',
    payload: {
      ok: result.ok,
      error: result.error,
      lootId,
      saveId: pickerSaveId,
      summary: result.summary,
    },
  };
  for (const connId of world.connectionIdsForSave(pickerSaveId)) {
    sendToConnection(connId, msg);
  }
  if (result.ok && result.pile) {
    broadcastGroundLootRemoved(result.pile.id, result.pile.locationId, 'picked', {
      pickedBySaveId: pickerSaveId,
      via: 'player',
    });
    // Notify party members who received shares via presence vitals / inventory reload hint
    for (const grant of result.grants ?? []) {
      const saved = saves.load(grant.saveId);
      if (saved) syncPresenceVitalsAndParty(saved);
      if (grant.saveId === pickerSaveId) continue;
      for (const connId of world.connectionIdsForSave(grant.saveId)) {
        sendToConnection(connId, {
          type: 'loot_pickup_result',
          payload: {
            ok: true,
            lootId,
            saveId: grant.saveId,
            summary: result.summary,
          },
        });
      }
    }
  }
}

function partySnapshotFor(saveId: string) {
  const party = parties.getPartyForSave(saveId);
  return party ? parties.buildSnapshot(party, partyLookup) : null;
}

function sendPartySnapshotToSave(saveId: string): void {
  const payload = partySnapshotFor(saveId);
  const msg: MultiplayerServerMessage = { type: 'party_snapshot', payload };
  for (const id of world.connectionIdsForSave(saveId)) {
    sendToConnection(id, msg);
  }
}

function broadcastPartySnapshot(partyId: string | null, extraSaveIds: string[] = []): void {
  const notified = new Set<string>(extraSaveIds);
  if (partyId) {
    const party = parties.getParty(partyId);
    if (party) {
      for (const id of party.memberSaveIds) notified.add(id);
    }
  }
  for (const saveId of notified) sendPartySnapshotToSave(saveId);
}

/** HP/MP в presence + party UI (между локациями через party_snapshot). */
function syncPresenceVitalsAndParty(saved: {
  id: string;
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
}): void {
  const prev = world.presenceForSave(saved.id);
  if (!prev) return;
  const nextMp = saved.mp ?? 0;
  const nextMaxMp = saved.maxMp ?? 0;
  if (
    prev.hp === saved.hp &&
    prev.maxHp === saved.maxHp &&
    (prev.mp ?? 0) === nextMp &&
    (prev.maxMp ?? 0) === nextMaxMp
  ) {
    return;
  }
  const presence = world.patchCombatPresence(saved.id, {
    hp: saved.hp,
    maxHp: saved.maxHp,
    mp: nextMp,
    maxMp: nextMaxMp,
  });
  if (!presence) return;
  sendToLocation(presence.locationId, { type: 'player_updated', payload: presence });
  const party = parties.getPartyForSave(saved.id);
  if (party) broadcastPartySnapshot(party.id);
}

function sharePartyKillXp(killer: import('@empery/shared').PlayerSave, shareXp: number): void {
  if (shareXp <= 0) return;
  const { saveIds, shareCount } = parties.eligibleForKillXp(killer.id, partyLookup);
  if (shareCount < 2) return;
  for (const saveId of saveIds) {
    if (saveId === killer.id) continue;
    const ally = saves.load(saveId);
    if (!ally) continue;
    const result = grantXp(ally, shareXp);
    saves.save(result.save);
    const msg: MultiplayerServerMessage = {
      type: 'party_xp',
      payload: {
        fromSaveId: killer.id,
        fromName: killer.name,
        xpGained: result.xpGained,
        leveledUp: result.leveledUp,
      },
    };
    for (const connId of world.connectionIdsForSave(saveId)) {
      sendToConnection(connId, msg);
    }
  }
}

/** Квестовые киллы для пати в радиусе (тот же критерий, что и XP). */
function sharePartyQuestCredit(killer: PlayerSave, enemyTypes: string[]): void {
  if (enemyTypes.length === 0) return;
  const { saveIds, shareCount } = parties.eligibleForKillXp(killer.id, partyLookup);
  if (shareCount < 2) return;

  for (const saveId of saveIds) {
    if (saveId === killer.id) continue;
    let ally = saves.load(saveId);
    if (!ally) continue;

    let changed = false;
    let questCompleted = false;
    let completedQuestId: string | undefined;
    let radioNpcId: string | undefined;

    for (const enemyType of enemyTypes) {
      const questId = questIdForEnemyType(enemyType, ally);
      if (!questId) continue;
      const cfg = getQuest(questId);
      const beforeComplete = cfg ? Boolean(ally.questFlags[cfg.completeFlag]) : false;
      const next = quests.onEnemyDefeated(ally, questId, enemyType);
      if (next === ally) continue;
      ally = next;
      changed = true;
      if (cfg && !beforeComplete && ally.questFlags[cfg.completeFlag]) {
        questCompleted = true;
        completedQuestId = questId;
        const npcId = radioNpcForQuest(questId);
        if (npcId) {
          // Всегда шлём входящий вызов при завершении квеста.
          // canRadioTalk лишь обновляет сейв; отказ не блокирует звонок (ответ проверит условия).
          const gate = canRadioTalk(ally, npcId);
          ally = gate.save;
          radioNpcId = npcId;
          if (!gate.ok) {
            console.info(
              `[party_quest] radio incoming for ${ally.name} (${npcId}), talk gate: ${gate.message}`,
            );
          }
        }
      }
    }

    if (!changed) continue;
    saves.save(ally);
    const msg: MultiplayerServerMessage = {
      type: 'party_quest',
      payload: {
        fromSaveId: killer.id,
        fromName: killer.name,
        enemyTypes,
        questCompleted: questCompleted || undefined,
        questId: completedQuestId,
        radioNpcId,
      },
    };
    for (const connId of world.connectionIdsForSave(saveId)) {
      sendToConnection(connId, msg);
    }
  }
}

/** Когда член пати взял квест — активировать тот же флаг у союзников в радиусе. */
function sharePartyQuestActivation(activator: PlayerSave, before: PlayerSave, after: PlayerSave): void {
  const newlyActive: string[] = [];
  for (const [flag, val] of Object.entries(after.questFlags)) {
    if (!val || !isQuestActiveFlag(flag)) continue;
    if (before.questFlags[flag]) continue;
    newlyActive.push(flag);
  }
  if (newlyActive.length === 0) return;

  const { saveIds, shareCount } = parties.eligibleForKillXp(activator.id, partyLookup);
  if (shareCount < 2) return;

  let touchedEncounter = false;
  for (const activeFlag of newlyActive) {
    for (const saveId of saveIds) {
      if (saveId === activator.id) continue;
      const ally = saves.load(saveId);
      if (!ally) continue;
      const next = applySharedQuestActivation(ally, activeFlag);
      if (!next) continue;
      saves.save(next);
      const msg: MultiplayerServerMessage = {
        type: 'party_quest',
        payload: {
          fromSaveId: activator.id,
          fromName: activator.name,
          activatedFlag: activeFlag,
        },
      };
      for (const connId of world.connectionIdsForSave(saveId)) {
        sendToConnection(connId, msg);
      }
      touchedEncounter = true;
    }
  }

  if (touchedEncounter) {
    const enc = getEncounterForLocation(activator.location);
    if (enc) refreshQuestSpawnsForParticipants(enc.encounterId);
  }
}

function killedEnemyTypesFromHits(
  encounterId: string | undefined,
  hits: Array<{ entityId: string; killed?: boolean }>,
): string[] {
  if (!encounterId || hits.length === 0) return [];
  const encounter = getEncounter(encounterId);
  if (!encounter) return [];
  const types: string[] = [];
  for (const hit of hits) {
    if (!hit.killed) continue;
    const entity = encounter.entities.get(hit.entityId);
    if (entity?.type) types.push(entity.type);
  }
  return types;
}

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim() || null;
  }
  const q = (req.query as { token?: string } | undefined)?.token;
  return typeof q === 'string' && q ? q : null;
}

function requireAccount(req: FastifyRequest, reply: FastifyReply) {
  const session = auth.resolveToken(bearerToken(req));
  if (!session) {
    reply.status(401).send({ error: 'Войдите в аккаунт', code: 'AUTH_REQUIRED' });
    return null;
  }
  const account = auth.getAccount(session.accountId);
  if (!account) {
    reply.status(401).send({ error: 'Сессия недействительна', code: 'AUTH_INVALID' });
    return null;
  }
  return account;
}

async function requireOwnedSave(
  req: FastifyRequest,
  reply: FastifyReply,
  saveId: string,
): Promise<PlayerSave | null> {
  const account = requireAccount(req, reply);
  if (!account) return null;
  let save = saves.load(saveId);
  if (!save) save = await saves.loadAsync(saveId);
  if (!save) {
    reply.status(404).send({ error: 'Save not found' });
    return null;
  }
  const owns = save.accountId === account.id || auth.ownsSave(account.id, save.id);
  if (!owns) {
    reply.status(403).send({ error: 'Чужой персонаж', code: 'FORBIDDEN_SAVE' });
    return null;
  }
  return save;
}

const commandInflight=new Map<string,Promise<void>>();
const commandFingerprint=(req:FastifyRequest)=>createHash('sha256').update(JSON.stringify([req.method,req.url,req.body??null])).digest('hex');
async function executeAccountCommand<T>(req:FastifyRequest,reply:FastifyReply,accountId:string,fn:()=>T):Promise<T|undefined> {
  const header=req.headers['idempotency-key'];
  if(header!==undefined&&(typeof header!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(header)))return reply.status(400).send({error:'Invalid idempotency key'}) as T;
  const key=typeof header==='string'?header:null;
  const scope=key?`${accountId}:${key}`:null;
  const fingerprint=commandFingerprint(req);
  if(scope)while(commandInflight.has(scope))await commandInflight.get(scope);
  let release:(()=>void)|undefined;
  if(scope)commandInflight.set(scope,new Promise<void>(resolve=>{release=resolve;}));
  try {
    progress?.assertHealthy();
    if(key&&progress&&persistence.characters){
      const existing=await persistence.characters.findReceipt(accountId,key);
      if(existing){
        if(existing.fingerprint!==fingerprint)return reply.status(409).send({error:'Idempotency key reused for a different command',code:'COMMAND_CONFLICT'}) as T;
        metrics.count('command.replays');return existing.result as T;
      }
    }
    const emissions:Array<()=>void>=[];deferredCommandMessages=emissions;
    let result:T;
    try {result=metrics.measure('command.domainMs',fn);}finally{deferredCommandMessages=null;}
    const receipt=key&&progress&&reply.statusCode<400?{accountId,key,fingerprint,result}:undefined;
    await progress?.flush(receipt);
    for(const emit of emissions)emit();
    return result;
  } finally {if(scope){commandInflight.delete(scope);release?.();}}
}
async function executeSaveCommand<T>(req:FastifyRequest,reply:FastifyReply,saveId:string,fn:(save:PlayerSave)=>T):Promise<T|undefined> {
  const account=requireAccount(req,reply);if(!account)return undefined;
  const key=req.headers['idempotency-key'];
  if(typeof key==='string'&&!/^[a-zA-Z0-9_-]{1,128}$/.test(key))return reply.status(400).send({error:'Invalid idempotency key'}) as T;
  if(typeof key==='string'&&progress&&persistence.characters){
    const scope=`${account.id}:${key}`;
    while(commandInflight.has(scope))await commandInflight.get(scope);
    let existing=await persistence.characters.findReceipt(account.id,key);
    while(commandInflight.has(scope)){await commandInflight.get(scope);existing=await persistence.characters.findReceipt(account.id,key);}
    if(existing){
      if(existing.fingerprint!==commandFingerprint(req))return reply.status(409).send({error:'Idempotency key reused for a different command',code:'COMMAND_CONFLICT'}) as T;
      metrics.count('command.replays');return existing.result as T;
    }
  }
  const owned=await requireOwnedSave(req,reply,saveId);if(!owned)return undefined;
  return executeAccountCommand(req,reply,account.id,()=>saves.command(owned.id,fn));
}

function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  auth.reloadAccountsFromDisk();
  const account = requireAccount(req, reply);
  if (!account) return null;
  if (!account.admin) {
    reply.status(403).send({ error: 'Нужны права администратора', code: 'ADMIN_REQUIRED' });
    return null;
  }
  return account;
}

/** Re-link saves stamped with accountId and drop missing ids from the account. */
async function syncAccountSaves(accountId: string): Promise<string[]> {
  const account = auth.getAccount(accountId);
  if (!account) return [];
  for (const slot of saves.list()) {
    const save = saves.load(slot.id);
    if (save?.accountId === accountId) auth.attachSave(accountId, save.id);
  }
  // Pull account characters that only exist in Postgres (other node wrote them).
  if (persistence.characters?.listSaveIdsForAccount) {
    try {
      const remoteIds = await persistence.characters.listSaveIdsForAccount(accountId);
      for (const id of remoteIds) {
        if (!saves.load(id)) await saves.loadAsync(id);
        auth.attachSave(accountId, id);
      }
    } catch {
      /* ignore */
    }
  }
  for (const id of auth.getAccount(accountId)?.saveIds ?? []) {
    const local = saves.load(id) ?? (await saves.loadAsync(id));
    if (!local) auth.detachSave(accountId, id);
  }
  return auth.getAccount(accountId)?.saveIds ?? [];
}

function kickDuplicateSaveSessions(saveId: string): void {
  for (const oldId of world.connectionIdsForSave(saveId)) {
    const oldSocket = socketIndex.get(oldId);
    if (oldSocket) {
      const msg: MultiplayerServerMessage = {
        type: 'error',
        error: 'Персонаж зашёл с другого клиента',
        code: 'SESSION_REPLACED',
      };
      try {
        oldSocket.send(JSON.stringify(msg));
      } catch {
        /* ignore */
      }
      try {
        oldSocket.close();
      } catch {
        /* ignore */
      }
    }
    // Grace вместо hard-disconnect — мобы не теряют агро между kick и connect
    const left = world.beginDisconnectGrace(oldId) ?? world.disconnect(oldId);
    socketIndex.delete(oldId);presenceReplication.forget(oldId);enemyReplication.forget(oldId);
    chatLastSentAt.delete(oldId);
    if (left) broadcastLocationSnapshot(left.locationId, left.saveId);
  }
}

const ENEMY_TICK_MS = 50;
const ENEMY_SNAPSHOT_MS = 100;

const encodedMessages=new WeakMap<object,{raw:string;bytes:number}>();
function sendToConnection(connectionId: string, msg: MultiplayerServerMessage): void {
  let encoded=encodedMessages.get(msg);if(!encoded){const raw=JSON.stringify(msg);encoded={raw,bytes:Buffer.byteLength(raw)};encodedMessages.set(msg,encoded);}
  const {raw,bytes}=encoded;
  const send = () => { const socket=socketIndex.get(connectionId);if(!socket)return;
    if((socket.bufferedAmount??0)>262144){metrics.count('network.slowDisconnects');socket.close();return;}
    metrics.count('network.txBytes',bytes);metrics.count(`network.txBytes.${msg.type}`,bytes); socket.send(raw); };
  if(msg.type==='motion_snapshot'){send();return;}
  if(deferredCommandMessages){deferredCommandMessages.push(send);return;}
  if (progress) void progress.flush().then(send).catch(()=>undefined); else send();
}

function sendToLocation(locationId: string, msg: MultiplayerServerMessage): void {
  for (const id of world.connectionIds(locationId)) {
    sendToConnection(id,msg);
  }
}

function broadcastToAll(msg: MultiplayerServerMessage): void {
  for (const id of world.allConnectionIds()) {
    sendToConnection(id,msg);
  }
}

function emitLocationSnapshot(locationId: string, saveId?: string): void {
  const key =
    saveId && getLocation(locationId)?.privateOwnerOnly
      ? `${locationId}#${saveId}`
      : locationId;
  const baseLocationId = key.includes('#') ? key.split('#')[0]! : key;
  const expired = expireStale(baseLocationId);
  for (const pile of expired) {
    broadcastGroundLootRemoved(pile.id, pile.locationId, 'expired');
  }
  const snapshot={...world.snapshot(key),groundLoot:listGroundLoot(baseLocationId)};
  for(const id of world.connectionIds(key)){
    const self=world.presenceForConnection(id);if(!self)continue;
    const message=presenceReplication.message(id,snapshot,self);
    if(message)sendToConnection(id,message);
  }
}

const locationSnapshotCoalescer = createSnapshotCoalescer((locationId,saveId)=>metrics.measure('replication.presenceMs',()=>emitLocationSnapshot(locationId,saveId)));

function broadcastLocationSnapshot(locationId: string, saveId?: string): void {
  // Combat bursts and movement share one flush; explicit combat results remain immediate.
  locationSnapshotCoalescer.schedule(locationId,getLocation(locationId)?.privateOwnerOnly?saveId:undefined);
}

function scheduleLocationSnapshot(locationId: string, saveId?: string): void {
  locationSnapshotCoalescer.schedule(locationId, saveId);
}

function broadcastEnemySnapshot(locationId: string): void {
  const encounter=getEncounterForLocation(locationId);
  const snapshot=encounter?buildEnemySnapshot(encounter):{locationId,encounterId:'',enemies:[],generatedAt:Date.now()};
  for(const id of world.connectionIds(locationId)){
    const self=world.presenceForConnection(id);if(!self)continue;
    const message=enemyReplication.message(id,snapshot,self);if(message)sendToConnection(id,message);
  }
}

function broadcastEncounterById(encounterId: string): void {
  const encounter = getEncounter(encounterId);
  if (!encounter) return;
  broadcastEnemySnapshot(encounter.locationId);
}

/** После зачистки квестовой пачки — респавн для участников, у кого квест ещё активен. */
function refreshQuestSpawnsForParticipants(encounterId: string): void {
  const encounter = getEncounter(encounterId);
  if (!encounter) return;
  let addedAny = false;
  for (const saveId of encounter.participants) {
    const participant = saves.load(saveId);
    if (!participant) continue;
    const added = syncQuestSpawns(encounterId, participant);
    if (added.length) addedAny = true;
  }
  if (addedAny) broadcastEncounterById(encounterId);
}

function combatContext(save: PlayerSave) {
  const presence = world.presenceForSave(save.id);
  const location = getLocation(save.location)!;
  return authority.context(save, presence?.locationId === save.location ? presence : {x:save.worldX ?? location.spawn.x,y:save.worldY ?? location.spawn.y});
}
function canAct(save: PlayerSave): boolean {
  const presence = world.presenceForSave(save.id);
  return Boolean(presence && presence.connectionStatus === 'online' && presence.locationId === save.location && authority.attack(save));
}
function applyDots(encounter: import('./services/encounter.js').LocationEncounter, now: number): void {
  for (const entity of encounter.entities.values()) {
    if (!entity.alive || !entity.dot) continue;
    const source = saves.load(entity.dot.sourceSaveId);
    if (!source || source.location !== encounter.locationId) { entity.dot = undefined; continue; }
    const {shareCount} = parties.eligibleForKillXp(source.id,partyLookup);
    const result = resolveBleedKill(source,encounter.encounterId,entity.entityId,{partyShareCount:shareCount},quests,now);
    if ('error' in result || !result.hits.length) continue;
    const withLoot = withGroundLootWire(result);
    const saved = saves.save(withLoot.save);
    if (withLoot.hits.some(hit=>hit.killed)) {
      if (withLoot.xpGained) sharePartyKillXp(saved,withLoot.xpGained);
      sharePartyQuestCredit(saved,[entity.type]);
      refreshQuestSpawnsForParticipants(encounter.encounterId);
    }
    for (const id of world.connectionIdsForSave(saved.id)) sendToConnection(id,{type:'player_state',payload:{save:saved,stats:computeStats(saved)}});
  }
}
let lastMotionSnapshotAt=0;
let lastVitalsSnapshotAt=0;
let lastMotionCheckpointAt=0;
scheduleInterval(() => {
  const now=Date.now();
  for(const saveId of world.listOnlineSaveIds()) {
    const save=saves.load(saveId),pose=world.presenceForSave(saveId);if(!save||!pose||pose.locationId!==save.location)continue;
    const motion=authority.step(save,pose,now);
    const current={...motion.save,worldX:motion.x,worldY:motion.y};
    const saved=motion.persist||now-lastMotionCheckpointAt>=1000?saves.save(current,{sync:motion.persist}):saves.updateRuntime(current);
    for(const id of world.connectionIdsForSave(saveId)) {
      world.updatePresence(id,{x:motion.x,y:motion.y,moving:motion.moving,facing:motion.x<pose.x?'left':motion.x>pose.x?'right':pose.facing});
      if(now-lastMotionSnapshotAt>=100)sendToConnection(id,{type:'motion_snapshot',payload:{locationId:save.location,x:motion.x,y:motion.y,ack:motion.ack,moving:motion.moving,serverTime:now}});
      if(now-lastVitalsSnapshotAt>=250)sendToConnection(id,{type:'player_state',payload:{save:saved,stats:computeStats(saved)}});
    }
    scheduleLocationSnapshot(pose.locationId);
  }
  if(now-lastMotionSnapshotAt>=100)lastMotionSnapshotAt=now;
  if(now-lastVitalsSnapshotAt>=250)lastVitalsSnapshotAt=now;
  if(now-lastMotionCheckpointAt>=1000)lastMotionCheckpointAt=now;
},MOVEMENT_STEP_MS,'movement.tickMs');

let lastEnemySnapshotAt = 0;
let lastGhostPurgeAt = 0;
scheduleInterval(() => {
  const now = Date.now();
  const dt=ENEMY_TICK_MS;

  if (now - lastGhostPurgeAt >= 1000) {
    lastGhostPurgeAt = now;
    for (const locationId of world.purgeExpiredGhosts(now)) {
      broadcastLocationSnapshot(locationId);
    }
  }

  for (const encounter of listActiveEncounters()) {
    const players = world.presences(encounter.locationId);
    const observer=players[0]?saves.load(players[0].saveId):null;
    tickEncounter(
      encounter,
      players.map((p) => ({
        saveId: p.saveId,
        x: p.x,
        y: p.y,
        level: p.level,
        combatActive: world.isCombatActive(p.saveId),
      })),
      dt,
      observer?authority.collisionWorld(observer):undefined,
    );
    applyEnemyHits(encounter, players, now);
    applyDots(encounter, now);
    const level = players.reduce((max, p) => Math.max(max, p.level), 1);
    processFarmRespawns(encounter, level, now);
  }

  if (now - lastEnemySnapshotAt >= ENEMY_SNAPSHOT_MS) {
    lastEnemySnapshotAt = now;
    const seen = new Set<string>();
    for (const encounter of listActiveEncounters()) {
      if (seen.has(encounter.locationId)) continue;
      seen.add(encounter.locationId);
      broadcastEnemySnapshot(encounter.locationId);
    }
  }
}, ENEMY_TICK_MS,'enemy.tickMs');

/** Low-frequency, server-authoritative survival simulation; isolated from combat ticks. */
scheduleInterval(() => {
  if (!SURVIVAL_ENABLED) return;
  const now = Date.now();
  const currentWeather = weather.refresh(now);
  for (const saveId of world.listOnlineSaveIds()) {
    const save = saves.load(saveId);
    if (!save || save.hp <= 0) continue;
    const location = getLocation(save.location);
    const presence = world.presenceForSave(save.id);
    const nearHeatSource = Boolean(
      presence &&
        locationHeatSources(location).some((source) => {
          const radius = source.radius ?? 160;
          return Math.hypot(presence.x - source.x, presence.y - source.y) <= radius;
        }),
    );
    const activePlay = Boolean(presence && presence.connectionStatus !== 'disconnected');
    const withSpoil = spoilInventoryEntries(save, now);
    const next = simulateSurvival(
      withSpoil,
      {
        weather: currentWeather,
        safeZone: Boolean(location?.safeZone),
        nearHeatSource,
        activePlay,
      },
      now,
    );
    if (next.survival?.lastSimulatedAt === save.survival?.lastSimulatedAt) continue;
    const collapsed = activePlay ? applySurvivalCollapse(next) : next;
    const severity = collapsed.survival?.conditions.some((c) => c.severity === 'critical')
      ? 'critical'
      : collapsed.survival?.conditions.some((c) => c.severity === 'deficit')
        ? 'deficit'
        : 'ok';
    recordSurvival('ticks');
    if (severity === 'deficit') recordSurvival('deficits');
    if (severity === 'critical') recordSurvival('criticals');
    if (collapsed.hp <= 0 && save.hp > 0) {
      recordSurvival('collapses');
      if (collapsed.lastDeathKind === 'doom') recordSurvival('dooms');
    }
    if (SURVIVAL_SHADOW) continue;
    const saved = saves.save(applyStatsToSave(collapsed));
    syncPresenceVitalsAndParty(saved);
    const stats = computeStats(saved);
    const msg: import('@empery/shared').MultiplayerServerMessage = {
      type: 'survival_update',
      payload: {
        saveId: saved.id,
        survival: saved.survival!,
        hp: saved.hp,
        maxHp: saved.maxHp,
        lastDeathCause: saved.lastDeathCause ?? null,
        lastDeathKind: saved.lastDeathKind ?? null,
        stats: {
          survivalSeverity: stats.survivalSeverity,
          survivalConditions: stats.survivalConditions,
        },
      },
    };
    for (const connId of world.connectionIdsForSave(saved.id)) {
      sendToConnection(connId, msg);
    }
  }
}, SURVIVAL_TICK_MS);

/** Server-authoritative HP/MP regen — client HUD must not PATCH vitals. */
scheduleInterval(() => {
  for (const saveId of world.listOnlineSaveIds()) {
    saves.command(saveId, (save) => {
      if (save.hp <= 0) return;
      const next = applyVitalsRegen(save, computeStats(save));
      if (next === save) return;
      const saved = saves.save(applyStatsToSave(next));
      syncPresenceVitalsAndParty(saved);
    });
  }
}, VITALS_REGEN_MS);

/** Companion auto-loot + needs tick (separate from survival). */
const COMPANION_TICK_MS = 900;
scheduleInterval(() => {
  const now = Date.now();
  const expired = expireStale(undefined, now);
  for (const pile of expired) {
    broadcastGroundLootRemoved(pile.id, pile.locationId, 'expired');
  }
  for (const saveId of world.listOnlineSaveIds()) {
    let save = saves.load(saveId);
    if (!save || save.hp <= 0) continue;
    if (!normalizeCompanionState(save.companion)) continue;
    const presence = world.presenceForSave(save.id);
    if (!presence || presence.connectionStatus === 'disconnected') continue;

    const needs = tickCompanionNeeds(save, now);
    if (needs !== save) {
      save = saves.save(needs);
    }

    const fetch = tickCompanionLoot(
      save,
      { locationId: presence.locationId, x: presence.x, y: presence.y },
      makePickupDeps(),
      now,
    );
    if (fetch.status === 'started') {
      sendToLocation(presence.locationId, {
        type: 'companion_fetch_started',
        payload: {
          saveId: fetch.saveId,
          lootId: fetch.lootId,
          locationId: fetch.locationId,
          lootX: fetch.lootX,
          lootY: fetch.lootY,
          fromX: fetch.fromX,
          fromY: fetch.fromY,
          arriveAt: fetch.arriveAt,
        },
      });
    }
    if (fetch.status === 'completed') {
      broadcastGroundLootRemoved(fetch.lootId, fetch.locationId, 'picked', {
        pickedBySaveId: save.id,
        via: 'companion',
      });
      const refreshed = saves.load(save.id);
      if (refreshed) syncPresenceVitalsAndParty(refreshed);
      for (const connId of world.connectionIdsForSave(save.id)) {
        sendToConnection(connId, {
          type: 'loot_pickup_result',
          payload: {
            ok: true,
            lootId: fetch.lootId,
            saveId: save.id,
            summary: fetch.summary,
          },
        });
      }
    }
  }
}, COMPANION_TICK_MS);

/** Sync authoritative world clock/schedule to clients (smooth server-driven life). */
const WORLD_TIME_MS = 2_000;
scheduleInterval(() => {
  const now = Date.now();
  const snap = dayNight.baseSnapshot(now);
  const msg: MultiplayerServerMessage = {
    type: 'world_time',
    payload: {
      timeOfDay: snap,
      havenSchedule: havenScheduleSnapshot(dayNight, now),
    },
  };
  for (const connId of world.allConnectionIds()) {
    const presence=world.presenceForConnection(connId);
    sendToConnection(connId,presence?.locationId==='empery_haven'?msg:{type:'world_time',payload:{timeOfDay:snap}});
  }
}, WORLD_TIME_MS);

/** Мобы бьют offline-призраков на сервере (клиент enemy-hit не шлёт). */
function applyEnemyHits(
  encounter: import('./services/encounter.js').LocationEncounter,
  players: import('@empery/shared').MultiplayerPlayerPresence[],
  now: number,
): void {
  const ghosts = new Map(
    players.filter((p) => p.hp > 0).map((p) => [p.saveId, p]),
  );
  if (ghosts.size === 0) return;

  for (const entity of encounter.entities.values()) {
    if (!entity.alive || !entity.aggroSaveId) continue;
    expireMobControl(entity, now);
    if (entity.control?.kind === 'stun') continue;
    const ghost = ghosts.get(entity.aggroSaveId);
    if (!ghost) continue;
    const dist = Math.hypot(entity.x - ghost.x, entity.y - ghost.y);
    if (dist > ENEMY_STOP_RANGE + 2) continue;
    if ((entity.nextAttackAt ?? 0) > now) continue;
    entity.nextAttackAt = now + GHOST_ENEMY_HIT_MS;

    const save = saves.load(ghost.saveId);
    if (!save || save.hp <= 0 || save.location !== encounter.locationId) continue;
    if(!authority.collisionWorld(save).hasLineOfSight(entity,ghost))continue;
    const loc = getLocation(encounter.locationId);
    if (loc?.safeZone) continue;

    const result = resolveEnemyHit(save, entity.type, {
      ...combatContext(save),
      enemyLevel: entity.level,
    });
    let nextSave = result.save;
    if (nextSave.hp <= 0) {
      const enemyName = entity.type.replace(/_/g, ' ');
      nextSave = markCombatDeath(
        nextSave,
        `Убит мобом (${enemyName}, ур.${entity.level})${ghost.connectionStatus === 'disconnected' ? ' пока вы были вне игры' : ''}`,
      );
    }
    const saved = saves.save(nextSave);
    syncPresenceVitalsAndParty(saved);
    for (const connection of world.connectionIdsForSave(saved.id)) sendToConnection(connection,{type:'enemy_hit',payload:{save:saved,stats:computeStats(saved),damage:result.damage,dodged:result.dodged,perfectDodge:result.perfectDodge}});
    if (saved.hp <= 0) {
      world.patchCombatPresence(saved.id, { hp: 0, mounted: false });
      const party = parties.getPartyForSave(saved.id);
      if (party) broadcastPartySnapshot(party.id);
    }
  }
}

const kernel = new GameKernel(config);
const app = Fastify({ logger: options.logger ?? {serializers:{req:(req:FastifyRequest)=>({id:req.id,method:req.method,url:redactRequestUrl(req.url),hostname:req.hostname,remoteAddress:req.ip})}}, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
registerRequestContracts(app);
app.addHook('onRequest', async (req, reply) => {
  const path=req.url.split('?')[0]!;
  if(!['/health','/ready','/api/ops/metrics'].includes(path))await auth.refresh();
  if (progress && !progress.healthy() && !['/health','/ready','/api/admin/runtime-metrics','/api/ops/metrics'].includes(req.url.split('?')[0]!)) {
    return reply.status(503).send({error:'Хранилище прогресса недоступно',code:'PROGRESS_UNAVAILABLE'});
  }
});
app.addHook('onSend', async (req, reply, payload) => {
  if (progress && reply.statusCode < 400 && !['/health','/ready','/api/admin/runtime-metrics','/api/ops/metrics'].includes(req.url.split('?')[0]!)) await progress.flush();
  if(reply.statusCode<400&&!['/health','/ready','/api/ops/metrics'].includes(req.url.split('?')[0]!))await auth.flush();
  return payload;
});
const operationsToken=process.env.EMPERY_OPERATIONS_TOKEN;
if(operationsToken)app.get('/api/ops/metrics',async(req,reply)=>{
  const provided=bearerToken(req)??'';
  const expected=createHash('sha256').update(operationsToken).digest();
  const actual=createHash('sha256').update(provided).digest();
  if(!timingSafeEqual(expected,actual))return reply.status(401).send({error:'Unauthorized'});
  return metrics.snapshot();
});
app.addHook('onResponse', async (_req, reply) => {
  metrics.observe('http.responseMs',reply.elapsedTime);
  metrics.count('http.responses');
  if (reply.statusCode >= 500) metrics.count('http.failures');
});

const authAttempts = new Map<string, {count: number; until: number}>();
app.addHook('preHandler', async (req, reply) => {
  if (!['/api/auth/login','/api/auth/register'].includes(req.routeOptions.url ?? '')) return;
  const now = Date.now();
  for (const [key, value] of authAttempts) if (value.until <= now) authAttempts.delete(key);
  const key = req.ip;
  if (!authAttempts.has(key) && authAttempts.size >= 10000) return reply.status(429).send({error:'Слишком много запросов входа',code:'AUTH_RATE'});
  const value = authAttempts.get(key) ?? {count:0,until:now+60_000};
  value.count += 1; authAttempts.set(key,value);
  if (value.count > 20 || authAttempts.size > 10000) return reply.status(429).send({error:'Слишком много запросов входа',code:'AUTH_RATE'});
});
app.setErrorHandler((error, req, reply) => {
  if (error instanceof ProgressUnavailableError) return reply.status(503).send({error:'Хранилище прогресса недоступно',code:'PROGRESS_UNAVAILABLE'});
  if (error instanceof AuthStorageError) return reply.status(503).send({error:'Хранилище авторизации недоступно',code:'AUTH_UNAVAILABLE'});
  if (error instanceof AuthBusyError) return reply.status(429).send({error:error.message,code:'AUTH_BUSY'});
  req.log.error(error);
  const status = (error as { statusCode?: number }).statusCode ?? 500;
  return reply.status(status).send({ error: status < 500 ? (error as Error).message : 'Внутренняя ошибка сервера' });
});

function logAdminAction(who: string, action: string, detail?: Record<string, unknown>): void {
  app.log.info({ admin: who, action, ...detail }, `admin:${action}`);
}

await app.register(cors, { origin: true });
await app.register(fastifyWebsocket,{options:{maxPayload:16_384}});
await app.register(fastifyStatic, {
  root: outputDir,
  prefix: '/media/',
  decorateReply: false,
  setHeaders(reply, filePath) {
    const ctrl = mediaStaticCacheControl(String(filePath));
    if (ctrl) reply.header('Cache-Control', ctrl);
  },
});
await kernel.start();

const routeContext = {
  authority,
  metrics,
  progress,
  llm,
  comfy,
  saves,
  auth,
  dayNight,
  world,
  parties,
  socketIndex,
  chatLastSentAt,
  presenceReplication,
  enemyReplication,
  applyLootPickup,
  partySnapshotFor,
  sendPartySnapshotToSave,
  broadcastPartySnapshot,
  syncPresenceVitalsAndParty,
  executeSaveCommand,
  executeAccountCommand,
  kickDuplicateSaveSessions,
  sendToConnection,
  sendToLocation,
  broadcastToAll,
  broadcastLocationSnapshot,
  scheduleLocationSnapshot,
  broadcastEnemySnapshot,
  combatContext,
  canAct,
  mediaJobs,
  bearerToken,
  requireAccount,
  requireAdmin,
  rootDir,
  requireOwnedSave,
  syncAccountSaves,
  weather,
  makePickupDeps,
  broadcastGroundLootRemoved,
  dialogue,
  sharePartyQuestActivation,
  quests,
  partyLookup,
  withGroundLootWire,
  sharePartyKillXp,
  sharePartyQuestCredit,
  killedEnemyTypesFromHits,
  broadcastEncounterById,
  refreshQuestSpawnsForParticipants,
};
registerWorldRoutes(app,routeContext);
registerMediaRoutes(app,routeContext);
registerAuthRoutes(app,routeContext);
registerCharactersRoutes(app,routeContext);
registerSurvivalHousingRoutes(app,routeContext);
registerCompanionsMountsRoutes(app,routeContext);
registerEconomyRoutes(app,routeContext);
registerDialogueRoutes(app,routeContext);
registerCombatRoutes(app,routeContext);
registerTravelRoutes(app,routeContext);

await registerAdminRoutes(app, {
  rootDir,
  mediaOutputDir: outputDir,
  auth,
  saves,
  world,
  requireAdmin,
  logAdmin: logAdminAction,
  onLocationChanged: broadcastLocationSnapshot,
  survivalAdmin: {
    weather: () => weather.snapshot(),
    setWeather: (id) => weather.set(id),
    telemetry: () => survivalTelemetrySnapshot(),
    patchSurvival: (saveId, patch) => {
      const save = saves.load(saveId);
      if (!save) return { ok: false, message: 'Save not found' };
      const state = survivalOf(save);
      const next = {
        ...state,
        satiety:
          typeof patch.satiety === 'number' ? Math.max(0, Math.min(100, patch.satiety)) : state.satiety,
        hydration:
          typeof patch.hydration === 'number'
            ? Math.max(0, Math.min(100, patch.hydration))
            : state.hydration,
        bodyTemperature:
          typeof patch.bodyTemperature === 'number'
            ? Math.max(30, Math.min(43, patch.bodyTemperature))
            : state.bodyTemperature,
        fatigue:
          typeof patch.fatigue === 'number' ? Math.max(0, Math.min(100, patch.fatigue)) : state.fatigue,
        wetness:
          typeof patch.wetness === 'number' ? Math.max(0, Math.min(100, patch.wetness)) : state.wetness,
        conditions: patch.clearConditions ? [] : state.conditions,
      };
      const saved = saves.save(applyStatsToSave({ ...save, survival: next }));
      return { ok: true, message: 'Survival updated', save: saved };
    },
  },
});

app.addHook('preClose', async () => {
  for(const timer of timers)clearInterval(timer);
  locationSnapshotCoalescer.cancelAll();
  await Promise.all([...socketIndex.values()].map(socket=>new Promise<void>(resolve=>{
    if(!socket.once||socket.readyState===3){socket.close();resolve();return;}
    const timeout=setTimeout(()=>{socket.terminate?.();resolve();},1000);
    socket.once('close',()=>{clearTimeout(timeout);resolve();});socket.close();
  })));
});
app.addHook('onClose', async () => {
  saves.flushAll();
  await flushAdminJobs();
  let primaryError: unknown;
  try { await auth.flush();await progress?.flush(); } catch (error) { primaryError=error; }
  try {await persistence.characters?.releaseWorld();} catch(error){primaryError??=error;}
  metrics.close();
  if (options.persistence !== false)try {await closePersistence();}catch(error){primaryError??=error;}
  if (primaryError) throw primaryError;
});

if(primaryMode&&options.simulation!==false)timers.push(setInterval(()=>{void auth.refresh().catch(error=>app.log.error(error));},5000));
const bootstrapUser = process.env.EMPERY_BOOTSTRAP_ADMIN;
const bootstrapped = auth.bootstrapAdminFromEnv(bootstrapUser);
await auth.flush();
if (bootstrapped) {
  app.log.info(`Bootstrap admin granted to "${bootstrapped.username}"`);
} else if (bootstrapUser?.trim()) {
  app.log.warn(`EMPERY_BOOTSTRAP_ADMIN="${bootstrapUser.trim()}" — аккаунт не найден`);
}

return {app,context:routeContext};
}

/** Server-internal dependencies, never serialized to a client. */
export type GameRouteContext = Awaited<ReturnType<typeof createGameServer>>['context'];
