import { attackReach, type MultiplayerServerMessage } from '@empery/shared';
import { MOVEMENT_PROTOCOL } from '@empery/shared/movement';
import { loadRaces } from '../services/content.js';
import { loadItems } from '../services/items.js';
import { applyStatsToSave } from '../services/stats.js';
import { authorizeJoinLocation, getLocation, loadLocations } from '../services/locations.js';
import { havenScheduleSnapshot } from '../services/haven-schedule.js';
import { loadProfessions } from '../services/professions.js';
import { loadSkills, getSkill } from '../services/skills.js';
import { loadEnemies } from '../services/enemies.js';
import { buildChatMessage, CHAT_MIN_INTERVAL_MS, sanitizeChatText } from '../services/chat.js';
import { DISCONNECT_GRACE_MS, DISCONNECT_GRACE_SAFE_MS } from '../services/multiplayer.js';
import { persistenceHealth } from '../services/persistence/index.js';
import { markCombatDeath } from '../services/respawn.js';
import { canAttackPlayer, distance2d, isInnocentForPk, pvpRejectMessage, refreshFlagUntil } from '../services/pvp.js';
import { resolvePvpStrike } from '../services/pvp-combat.js';
import { resolveSupportCastWithRange } from '../services/ally-skills.js';
import { getAllyBuffBonuses } from '../services/ally-buffs.js';
import { attackRangeForSave, rangedRejectMessage } from '../services/ranged.js';
import { parseClientMessage } from '../services/request-contracts.js';
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerWorldRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
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
    kickDuplicateSaveSessions,
    sendToConnection,
    sendToLocation,
    broadcastToAll,
    broadcastLocationSnapshot,
    broadcastEnemySnapshot,
    combatContext,
    canAct,
  } = context;
  const telemetryAt=new Map<string,number>();
  app.post<{Body:Record<string,number>}>('/api/telemetry/client',async(req,reply)=>{
    const account=context.requireAccount(req,reply);if(!account)return;
    const now=Date.now();
    for(const [id,at] of telemetryAt)if(now-at>60_000)telemetryAt.delete(id);
    if(now-(telemetryAt.get(account.id)??0)<5000||telemetryAt.size>=10000)return reply.status(429).send({error:'Telemetry rate exceeded'});
    telemetryAt.set(account.id,now);
    for(const [key,value] of Object.entries(req.body))metrics.observe(`client.${key}`,value);
    return {ok:true};
  });
  app.get('/ready', async (_req,reply) => {
    const ok=(progress?.healthy()??true)&&context.auth.healthy();
    return reply.status(ok?200:503).send({ok,backend:progress?'postgres':'files',protocol:MOVEMENT_PROTOCOL});
  });
  app.get('/api/admin/runtime-metrics',async(req,reply)=>{
    if(!context.requireAdmin(req,reply))return;
    return metrics.snapshot();
  });

  app.get('/health', async () => {
    const [llamaHealth, comfyHealth, infraHealth] = await Promise.all([
      llm.healthCheck(),
      comfy.healthCheck(),
      persistenceHealth(),
    ]);
    const services = [...llamaHealth, comfyHealth, ...infraHealth];
    return {
      ok: services.every((item) => item.ok) && (progress?.healthy()??true),
      services,
    };
  });

  app.get('/api/races', async () => loadRaces());

  app.get('/api/professions', async () => loadProfessions());

  app.get('/api/skills', async () => loadSkills());

  app.get('/api/enemies', async () => loadEnemies());

  app.get('/api/items', async () => loadItems());

  app.get('/api/locations', async () => loadLocations());

  app.get<{ Params: { id: string } }>('/api/locations/:id', async (req, reply) => {
    const loc = getLocation(req.params.id);
    if (!loc) return reply.status(404).send({ error: 'Location not found' });
    return loc;
  });

  app.get<{ Params: { id: string } }>('/api/saves/:id/multiplayer/bootstrap', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    return {
      ...world.bootstrap(save),
      party: partySnapshotFor(save.id),
      worldTime: dayNight.baseSnapshot(),
      havenSchedule: havenScheduleSnapshot(dayNight),
    };

    });
  });

  app.get('/ws', { websocket: true }, async (socket, req) => {
    const url = new URL(req.url, 'http://localhost');
    const saveId = url.searchParams.get('saveId');
    if (!saveId) {
      const msg: MultiplayerServerMessage = { type: 'error', error: 'saveId required', code: 'BAD_SAVE_ID' };
      socket.send(JSON.stringify(msg));
      socket.close();
      return;
    }
    const token = url.searchParams.get('token');
    const session = auth.resolveToken(token);
    if (!session) {
      const msg: MultiplayerServerMessage = { type: 'error', error: 'Auth required', code: 'AUTH_REQUIRED' };
      socket.send(JSON.stringify(msg));
      socket.close();
      return;
    }
    let save = saves.load(saveId);
    if (!save) save = await saves.loadAsync(saveId);
    if (!save) {
      const msg: MultiplayerServerMessage = { type: 'error', error: 'Save not found', code: 'SAVE_NOT_FOUND' };
      socket.send(JSON.stringify(msg));
      socket.close();
      return;
    }
    const owns = save.accountId === session.accountId || auth.ownsSave(session.accountId, save.id);
    if (!owns) {
      const msg: MultiplayerServerMessage = { type: 'error', error: 'Forbidden save', code: 'FORBIDDEN_SAVE' };
      socket.send(JSON.stringify(msg));
      socket.close();
      return;
    }

    kickDuplicateSaveSessions(save.id);

    const connectionId = `${save.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    socketIndex.set(connectionId, socket);
    const safePose=authority.collisionWorld(save).nearestWalkable({x:save.worldX??getLocation(save.location)!.spawn.x,y:save.worldY??getLocation(save.location)!.spawn.y});
    save=saves.save({...authority.tick(save),worldX:safePose.x,worldY:safePose.y});
    authority.beginSession(save);
    const bootstrap = world.connect(save, connectionId);
    // Призрак мог потерять HP — синхронизируем сейв с presence
    if (bootstrap.self.hp !== save.hp || bootstrap.self.maxHp !== save.maxHp) {
      const synced = saves.save({
        ...save,
        hp: bootstrap.self.hp,
        maxHp: bootstrap.self.maxHp || save.maxHp,
        worldX: Math.round(bootstrap.self.x),
        worldY: Math.round(bootstrap.self.y),
        location: bootstrap.self.locationId,
      });
      Object.assign(save, synced);
    }
    const welcome: MultiplayerServerMessage = {
      type: 'welcome',
      payload: {
        ...bootstrap,
        party: partySnapshotFor(save.id),
        worldTime: dayNight.baseSnapshot(),
        havenSchedule: havenScheduleSnapshot(dayNight),
      },
    };
    await progress?.flush();
    socket.send(JSON.stringify(welcome));
    broadcastLocationSnapshot(save.location, save.id);
    broadcastEnemySnapshot(save.location);
    const existingParty = parties.getPartyForSave(save.id);
    if (existingParty) broadcastPartySnapshot(existingParty.id);

    socket.on('message', (raw: unknown) => {
      try {
        if (!auth.healthy() || (progress && !progress.healthy())) { socket.close();return; }
        metrics.count('network.rxBytes',Buffer.byteLength(String(raw)));
        if (!auth.resolveToken(token)) { socket.close(); return; }
        const message = parseClientMessage(JSON.parse(String(raw)));
        if (!message) { sendToConnection(connectionId, {type:'error',error:'Invalid message',code:'BAD_MESSAGE'}); return; }
        if (message.type === 'ping') {
          const pong: MultiplayerServerMessage = { type: 'pong', ts: message.ts };
          socket.send(JSON.stringify(pong));
          return;
        }
        if (message.type === 'join_location') {
          const fresh = saves.load(save.id) ?? save;
          const auth = authorizeJoinLocation(fresh, message.locationId);
          if (!auth.ok) {
            const err: MultiplayerServerMessage = {
              type: 'error',
              error: auth.reason ?? 'Сначала используй переход',
              code: 'TRAVEL_REQUIRED',
            };
            socket.send(JSON.stringify(err));
            return;
          }
          const prevLocation = save.location;
          const prevSaveId = save.id;
          const next = world.joinLocation(connectionId, fresh, message.locationId);
          save.location = fresh.location;
          if (typeof fresh.worldX === 'number') save.worldX = fresh.worldX;
          if (typeof fresh.worldY === 'number') save.worldY = fresh.worldY;
          broadcastLocationSnapshot(prevLocation, prevSaveId);
          broadcastLocationSnapshot(next.snapshot.locationId, prevSaveId);
          broadcastEnemySnapshot(next.snapshot.locationId);
          const party = parties.getPartyForSave(save.id);
          if (party) broadcastPartySnapshot(party.id);
          return;
        }
        if (message.type === 'player_input') {
          // Protocol v1 coordinates are never admitted into the simulation.
          const pose=world.presenceForConnection(connectionId);
          if(pose)sendToConnection(connectionId,{type:'position_correction',payload:{x:pose.x,y:pose.y}});
          sendToConnection(connectionId,{type:'error',error:'Обновите клиент игры',code:'PROTOCOL_UPGRADE'});
          metrics.count('movement.legacyRejected');return;
        }
        if (message.type === 'move_command') {
          const current=saves.load(save.id),pose=world.presenceForConnection(connectionId);
          if(!current||!pose||pose.locationId!==current.location)return;
          if(!authority.enqueue(current,message))metrics.count('movement.rejected');
          else metrics.count('movement.commands');
          return;
        }
        if (message.type === 'chat_send') {
          const from = world.presenceForConnection(connectionId);
          if (!from) return;

          const now = Date.now();
          const last = chatLastSentAt.get(connectionId) ?? 0;
          if (now - last < CHAT_MIN_INTERVAL_MS) {
            sendToConnection(connectionId, {
              type: 'chat_error',
              error: 'Слишком быстро',
              code: 'CHAT_RATE',
            });
            return;
          }

          const text = sanitizeChatText(message.text);
          if (!text) {
            sendToConnection(connectionId, {
              type: 'chat_error',
              error: 'Пустое сообщение',
              code: 'CHAT_EMPTY',
            });
            return;
          }

          if (message.channel === 'private') {
            const toName = message.toName?.trim() ?? '';
            if (!toName) {
              sendToConnection(connectionId, {
                type: 'chat_error',
                error: 'Укажи имя: /w Имя текст',
                code: 'CHAT_NO_TARGET',
              });
              return;
            }
            const targets = world.findByPlayerName(toName);
            if (targets.length === 0) {
              sendToConnection(connectionId, {
                type: 'chat_error',
                error: `Игрок «${toName}» не в сети`,
                code: 'CHAT_OFFLINE',
              });
              return;
            }
            chatLastSentAt.set(connectionId, now);
            for (const to of targets) {
              const payload = buildChatMessage({ channel: 'private', from, text, to });
              const msg: MultiplayerServerMessage = { type: 'chat_message', payload };
              const recipients = new Set([
                ...world.connectionIdsForSave(from.saveId),
                ...world.connectionIdsForSave(to.saveId),
              ]);
              for (const id of recipients) sendToConnection(id, msg);
            }
            return;
          }

          chatLastSentAt.set(connectionId, now);
          if (message.channel === 'global') {
            broadcastToAll({
              type: 'chat_message',
              payload: buildChatMessage({ channel: 'global', from, text }),
            });
            return;
          }

          if (message.channel === 'party') {
            const party = parties.getPartyForSave(from.saveId);
            if (!party) {
              sendToConnection(connectionId, {
                type: 'chat_error',
                error: 'Ты не в пати',
                code: 'PARTY_NONE',
              });
              return;
            }
            const payload = buildChatMessage({ channel: 'party', from, text });
            const msg: MultiplayerServerMessage = { type: 'chat_message', payload };
            for (const memberId of party.memberSaveIds) {
              for (const id of world.connectionIdsForSave(memberId)) sendToConnection(id, msg);
            }
            return;
          }

          sendToLocation(from.locationId, {
            type: 'chat_message',
            payload: buildChatMessage({ channel: 'location', from, text }),
          });
          return;
        }

        if (message.type === 'party_invite') {
          const fromSave = saves.load(save.id);
          if (!fromSave) return;
          const targets = world.findByPlayerName(message.toName);
          if (targets.length === 0) {
            sendToConnection(connectionId, {
              type: 'party_error',
              error: `Игрок «${message.toName}» не в сети`,
              code: 'CHAT_OFFLINE',
            });
            return;
          }
          const toPresence = targets[0]!;
          const toSave = saves.load(toPresence.saveId);
          if (!toSave) {
            sendToConnection(connectionId, {
              type: 'party_error',
              error: 'Персонаж не найден',
              code: 'SAVE_NOT_FOUND',
            });
            return;
          }
          const result = parties.invite(fromSave, toSave);
          if ('error' in result) {
            sendToConnection(connectionId, { type: 'party_error', error: result.error, code: result.code });
            return;
          }
          sendPartySnapshotToSave(fromSave.id);
          const inviteMsg: MultiplayerServerMessage = { type: 'party_invite', payload: result.invite };
          for (const id of world.connectionIdsForSave(toSave.id)) sendToConnection(id, inviteMsg);
          sendToConnection(connectionId, {
            type: 'chat_error',
            error: `Приглашение отправлено: ${toSave.name}`,
            code: 'PARTY_INVITE_SENT',
          });
          return;
        }

        if (message.type === 'party_accept') {
          const toSave = saves.load(save.id);
          if (!toSave) return;
          const result = parties.accept(toSave, message.partyId);
          if ('error' in result) {
            sendToConnection(connectionId, { type: 'party_error', error: result.error, code: result.code });
            return;
          }
          broadcastPartySnapshot(result.party.id);
          return;
        }

        if (message.type === 'party_decline') {
          parties.decline(save.id, message.partyId);
          sendToConnection(connectionId, {
            type: 'chat_error',
            error: 'Приглашение отклонено',
            code: 'PARTY_DECLINED',
          });
          return;
        }

        if (message.type === 'party_leave') {
          const result = parties.leave(save.id);
          if ('error' in result) {
            sendToConnection(connectionId, { type: 'party_error', error: result.error, code: result.code });
            return;
          }
          if (result.party) {
            sendPartySnapshotToSave(save.id);
            broadcastPartySnapshot(result.party.id);
          } else {
            broadcastPartySnapshot(null, [save.id, ...result.leftoverSaveIds]);
          }
          return;
        }

        if (message.type === 'party_kick') {
          const result = parties.kick(save.id, message.saveId);
          if ('error' in result) {
            sendToConnection(connectionId, { type: 'party_error', error: result.error, code: result.code });
            return;
          }
          sendPartySnapshotToSave(result.kickedSaveId);
          if (result.party) broadcastPartySnapshot(result.party.id, [result.kickedSaveId]);
          else broadcastPartySnapshot(null, [save.id, result.kickedSaveId]);
          return;
        }

        if (message.type === 'party_disband') {
          const result = parties.disband(save.id);
          if ('error' in result) {
            sendToConnection(connectionId, { type: 'party_error', error: result.error, code: result.code });
            return;
          }
          broadcastPartySnapshot(null, result.members);
          return;
        }

        if (message.type === 'party_promote') {
          const result = parties.promote(save.id, message.saveId);
          if ('error' in result) {
            sendToConnection(connectionId, { type: 'party_error', error: result.error, code: result.code });
            return;
          }
          broadcastPartySnapshot(result.party.id);
          return;
        }

        if (message.type === 'party_assist') {
          const targetId = message.targetSaveId;
          let targetName: string | null = null;
          if (targetId) {
            const pres = world.presenceForSave(targetId);
            const targetSave = saves.load(targetId);
            targetName = pres?.name ?? targetSave?.name ?? 'Цель';
          }
          const result = parties.setAssistTarget(save.id, targetId, targetName);
          if ('error' in result) {
            sendToConnection(connectionId, { type: 'party_error', error: result.error, code: result.code });
            return;
          }
          broadcastPartySnapshot(result.party.id);
          return;
        }

        if (message.type === 'ally_cast') {
          const casterPresence = world.presenceForConnection(connectionId);
          if (!casterPresence) return;

          const skillId = message.skillId;
          if (!skillId) {
            sendToConnection(connectionId, {
              type: 'ally_cast_error',
              error: 'Укажи навык',
              code: 'BAD_REQUEST',
            });
            return;
          }

          const casterSave = saves.load(save.id);
          if (!casterSave) {
            sendToConnection(connectionId, {
              type: 'ally_cast_error',
              error: 'Персонаж не найден',
              code: 'SAVE_NOT_FOUND',
            });
            return;
          }

          const skillDef = getSkill(skillId);
          const mode = skillDef?.targetMode ?? 'ally';
          const range = attackReach(attackRangeForSave(casterSave, skillId));
          const party = parties.getPartyForSave(casterSave.id);
          const memberIds = party?.memberSaveIds ?? [casterSave.id];

          const candidates = [];
          for (const mid of memberIds) {
            const mSave = mid === casterSave.id ? casterSave : saves.load(mid);
            if (!mSave) continue;
            const pres =
              mid === casterSave.id ? casterPresence : world.presenceForSave(mid);
            const sameLocation = Boolean(
              mid === casterSave.id ||
                (pres && pres.locationId === casterPresence.locationId),
            );
            const dist =
              mid === casterSave.id || !pres
                ? 0
                : distance2d(casterPresence.x, casterPresence.y, pres.x, pres.y);
            candidates.push({
              save: mSave,
              distance: dist,
              sameLocation,
              sameParty: true,
            });
          }

          const primaryId =
            mode === 'party'
              ? casterSave.id
              : (message.targetSaveId ?? casterSave.id);

          if (mode === 'ally' && primaryId !== casterSave.id && !memberIds.includes(primaryId)) {
            // allow self; non-party rejected inside resolve
          }

          // If primary is not in candidates (solo cast on self ok)
          if (!candidates.some((c) => c.save.id === primaryId) && primaryId === casterSave.id) {
            candidates.push({
              save: casterSave,
              distance: 0,
              sameLocation: true,
              sameParty: true,
            });
          } else if (!candidates.some((c) => c.save.id === primaryId)) {
            const solo = saves.load(primaryId);
            const pres = world.presenceForSave(primaryId);
            if (solo && party?.memberSaveIds.includes(primaryId)) {
              candidates.push({
                save: solo,
                distance: pres
                  ? distance2d(casterPresence.x, casterPresence.y, pres.x, pres.y)
                  : 99999,
                sameLocation: Boolean(pres && pres.locationId === casterPresence.locationId),
                sameParty: true,
              });
            }
          }

          const result = resolveSupportCastWithRange(casterSave, skillId, candidates, {
            primaryTargetId: primaryId,
            range,
          });

          if (!result.ok) {
            sendToConnection(connectionId, {
              type: 'ally_cast_error',
              error: result.error,
              code: result.code,
            });
            return;
          }

          const savedCaster = saves.save(result.caster);
          save.hp = savedCaster.hp;
          save.mp = savedCaster.mp;
          save.skillCooldowns = savedCaster.skillCooldowns;
          save.questFlags = savedCaster.questFlags;
          save.xp = savedCaster.xp;
          save.level = savedCaster.level;
          save.skillLevels = savedCaster.skillLevels;

          const atkPres = world.patchCombatPresence(savedCaster.id, {
            hp: savedCaster.hp,
            maxHp: savedCaster.maxHp,
            mp: savedCaster.mp ?? 0,
            maxMp: savedCaster.maxMp ?? 0,
          });

          const targetEffects = [];
          for (const t of result.targets) {
            const savedT =
              t.save.id === savedCaster.id ? savedCaster : saves.save(t.save);
            const pres =
              savedT.id === savedCaster.id
                ? atkPres
                : world.patchCombatPresence(savedT.id, {
                    hp: savedT.hp,
                    maxHp: savedT.maxHp,
                    mp: savedT.mp ?? 0,
                    maxMp: savedT.maxMp ?? 0,
                  });
            syncPresenceVitalsAndParty(savedT);
            targetEffects.push({
              saveId: savedT.id,
              healAmount: t.healAmount,
              mpAmount: t.mpAmount,
              hpDelta: t.hpDelta,
              buffApplied: t.buffApplied,
              presence: pres ?? world.presenceForSave(savedT.id)!,
              buffLabels: getAllyBuffBonuses(savedT).labels,
            });
          }

          const primaryFx = targetEffects[0]!;
          const payload = {
            casterSaveId: savedCaster.id,
            targetSaveId: primaryFx.saveId,
            skillId: result.skillId,
            skillName: result.skillName,
            healAmount: result.healAmount,
            buffApplied: result.buffApplied,
            caster: atkPres ?? world.presenceForSave(savedCaster.id)!,
            target: primaryFx.presence,
            casterMp: savedCaster.mp,
            casterSkillCooldowns: savedCaster.skillCooldowns,
            targetBuffLabels: primaryFx.buffLabels,
            targets: targetEffects,
          };

          sendToLocation(casterPresence.locationId, { type: 'ally_cast_result', payload });
          return;
        }

        if (message.type === 'loot_pickup') {
          const from = world.presenceForConnection(connectionId);
          if (!from) return;
          applyLootPickup(from.saveId, message.lootId);
          return;
        }
        if (message.type === 'pvp_attack') {
          const attackerPresence = world.presenceForConnection(connectionId);
          if (!attackerPresence) return;

          const targetPresence = world.presenceForSave(message.targetSaveId);
          if (!targetPresence) {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: pvpRejectMessage('OFFLINE'),
              code: 'OFFLINE',
            });
            return;
          }

          const attackerSave = saves.load(save.id);
          let defenderSave = saves.load(message.targetSaveId);
          if (!attackerSave || !defenderSave) {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: 'Персонаж не найден',
              code: 'SAVE_NOT_FOUND',
            });
            return;
          }

          if (attackerSave.location !== attackerPresence.locationId || defenderSave.location !== targetPresence.locationId) return;
          // Presence HP авторитетнее при DISCONNECT grace (мобы/PvP били призрака)
          const targetHp = Math.min(defenderSave.hp, targetPresence.hp);
          if (targetHp !== defenderSave.hp) {
            defenderSave = { ...defenderSave, hp: targetHp };
          }
          const victimDisconnected = targetPresence.connectionStatus === 'disconnected';

          if (!canAct(attackerSave)) { sendToConnection(connectionId,{type:'pvp_error',error:'Attack is not ready',code:'ATTACK_COOLDOWN'}); return; }
          const loc = getLocation(attackerPresence.locationId);
          const party = parties.getPartyForSave(attackerSave.id);
          const sameParty = Boolean(party?.memberSaveIds.includes(defenderSave.id));
          const dist = distance2d(
            attackerPresence.x,
            attackerPresence.y,
            targetPresence.x,
            targetPresence.y,
          );
          if(!authority.collisionWorld(attackerSave).hasLineOfSight(attackerPresence,targetPresence)){sendToConnection(connectionId,{type:'pvp_error',error:'Цель за препятствием',code:'TARGET_OBSTRUCTED'});return;}
          const atkRange = attackReach(attackRangeForSave(attackerSave, message.skillId));
          const gate = canAttackPlayer({
            attackerId: attackerSave.id,
            targetId: defenderSave.id,
            safeZone: Boolean(loc?.safeZone),
            sameParty,
            sameLocation: attackerPresence.locationId === targetPresence.locationId,
            attackerHp: attackerSave.hp,
            targetHp,
            distance: dist,
            range: atkRange,
          });
          if (!gate.ok) {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: gate.error,
              code: gate.code,
            });
            return;
          }

          const now = Date.now();
          world.noteCombatActivity(attackerSave.id);

          const victimInnocent = isInnocentForPk(
            defenderSave.karma ?? 0,
            world.getFlagUntil(defenderSave.id),
            now,
          );
          const strike = resolvePvpStrike({
            attacker: attackerSave,
            defender: defenderSave,
            attackerCtx: combatContext(attackerSave),
            defenderCtx: { moving: targetPresence.moving },
            skillId: message.skillId,
            victimInnocent,
            attackerX: attackerPresence.x,
            attackerY: attackerPresence.y,
            defenderX: targetPresence.x,
            defenderY: targetPresence.y,
            defenderFacing: targetPresence.facing,
          });

          if (strike.skillOnCooldown) {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: 'Скилл на перезарядке',
              code: 'SKILL_CD',
            });
            return;
          }
          if (strike.insufficientMp) {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: 'Не хватает MP',
              code: 'NO_MP',
            });
            return;
          }
          if (strike.insufficientStamina) {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: 'Не хватает выносливости',
              code: 'NO_STAMINA',
            });
            return;
          }
          if (strike.skillRequireFailed === 'backstab') {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: 'Нужна спина или фланг',
              code: 'SKILL_POS',
            });
            return;
          }
          if (strike.skillRequireFailed === 'execute') {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: 'Цель слишком жива для казни',
              code: 'SKILL_HP',
            });
            return;
          }
          if (strike.skillRequireFailed === 'vanish') {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: 'Нужен рывок',
              code: 'SKILL_DASH',
            });
            return;
          }
          if (strike.noBow || strike.noAmmo) {
            sendToConnection(connectionId, {
              type: 'pvp_error',
              error: rangedRejectMessage(strike.noBow ? 'NO_BOW' : 'NO_AMMO'),
              code: strike.noBow ? 'NO_BOW' : 'NO_AMMO',
            });
            return;
          }

          const flagUntil = refreshFlagUntil(now);
          const savedAtk = saves.save(applyStatsToSave(strike.attacker));
          let defToSave = applyStatsToSave(strike.defender);
          if (strike.killed) {
            const disc = victimDisconnected ? ' (DISCONNECT)' : '';
            defToSave = markCombatDeath(
              defToSave,
              `Убит игроком ${savedAtk.name}${disc}${strike.wasPk ? ' · ПК' : ''}`,
            );
          }
          const savedDef = saves.save(defToSave);
          save.hp = savedAtk.hp;
          save.mp = savedAtk.mp;
          save.stamina = savedAtk.stamina;
          save.staminaAt = savedAtk.staminaAt;
          save.karma = savedAtk.karma;
          save.pkCount = savedAtk.pkCount;
          save.pvpCount = savedAtk.pvpCount;
          save.skillCooldowns = savedAtk.skillCooldowns;
          save.questFlags = savedAtk.questFlags;
          save.inventory = savedAtk.inventory;
          save.equipment = savedAtk.equipment;
          save.inventoryEnchants = savedAtk.inventoryEnchants;
          save.equipmentEnchants = savedAtk.equipmentEnchants;

          const atkPres = world.patchCombatPresence(savedAtk.id, {
            hp: savedAtk.hp,
            maxHp: savedAtk.maxHp,
            mp: savedAtk.mp ?? 0,
            maxMp: savedAtk.maxMp ?? 0,
            karma: savedAtk.karma ?? 0,
            flagUntilMs: flagUntil,
          });
          const defPres = world.patchCombatPresence(
            savedDef.id,
            strike.killed
              ? {
                  hp: savedDef.hp,
                  maxHp: savedDef.maxHp,
                  mp: savedDef.mp ?? 0,
                  maxMp: savedDef.maxMp ?? 0,
                  karma: savedDef.karma ?? 0,
                  clearFlag: true,
                  mounted: false,
                }
              : {
                  hp: savedDef.hp,
                  maxHp: savedDef.maxHp,
                  mp: savedDef.mp ?? 0,
                  maxMp: savedDef.maxMp ?? 0,
                  karma: savedDef.karma ?? 0,
                  flagUntilMs: flagUntil,
                },
          );

          const payload = {
            attackerId: savedAtk.id,
            targetId: savedDef.id,
            hit: strike.hit,
            missed: strike.missed,
            crit: strike.crit,
            blocked: strike.blocked || undefined,
            fullyBlocked: strike.fullyBlocked || undefined,
            damage: strike.damage,
            killed: strike.killed,
            attacker: atkPres ?? world.presenceForSave(savedAtk.id)!,
            target: defPres ?? world.presenceForSave(savedDef.id)!,
            skillId: message.skillId,
            attackerMp: savedAtk.mp,
            attackerSkillCooldowns: savedAtk.skillCooldowns,
            riposteConsumed: strike.riposteConsumed,
            shieldRiposteProc: strike.shieldRiposteProc,
            attackerShieldRiposteRemainingMs: strike.attackerShieldRiposteRemainingMs,
            targetShieldRiposteRemainingMs: strike.targetShieldRiposteRemainingMs,
            attackerInventory: savedAtk.inventory,
            attackerEquipment: savedAtk.equipment,
            attackerInventoryEnchants: savedAtk.inventoryEnchants,
            attackerEquipmentEnchants: savedAtk.equipmentEnchants,
            backstab: strike.backstab,
            execute: strike.execute,
            snipe: strike.snipe,
            vanish: strike.vanish,
            seek: strike.seek,
            pyre: strike.pyre,
            arc: strike.arc,
            combo: strike.combo,
          };

          sendToLocation(attackerPresence.locationId, { type: 'pvp_event', payload });
          broadcastLocationSnapshot(attackerPresence.locationId, attackerPresence.saveId);
          {
            const partyIds = new Set<string>();
            const atkParty = parties.getPartyForSave(savedAtk.id);
            const defParty = parties.getPartyForSave(savedDef.id);
            if (atkParty) partyIds.add(atkParty.id);
            if (defParty) partyIds.add(defParty.id);
            for (const pid of partyIds) broadcastPartySnapshot(pid);
          }

          if (strike.killed) {
            sendToLocation(attackerPresence.locationId, {
              type: 'pvp_death',
              payload: {
                victimId: savedDef.id,
                killerId: savedAtk.id,
                victimName: savedDef.name,
                killerName: savedAtk.name,
                wasPk: strike.wasPk,
                victimDisconnected: victimDisconnected || undefined,
              },
            });
          }
          return;
        }
      } catch (err) {
        const reply: MultiplayerServerMessage = {
          type: 'error',
          error: err instanceof Error ? err.message : 'Invalid websocket message',
          code: 'BAD_MESSAGE',
        };
        socket.send(JSON.stringify(reply));
      }
    });

    socket.on('close', () => {
      const before = world.presenceForConnection(connectionId);
      const current=saves.load(save.id);
      if (before && current?.location !== before.locationId) {
        world.disconnect(connectionId);
        socketIndex.delete(connectionId);presenceReplication.forget(connectionId);enemyReplication.forget(connectionId);
        chatLastSentAt.delete(connectionId);
        broadcastLocationSnapshot(before.locationId,before.saveId);
        return;
      }
      if (before && current) authority.stop(current);
      const loc = before ? getLocation(before.locationId) : null;
      const graceMs = loc?.safeZone ? DISCONNECT_GRACE_SAFE_MS : DISCONNECT_GRACE_MS;
      const left = world.beginDisconnectGrace(connectionId, Date.now(), graceMs);
      socketIndex.delete(connectionId);presenceReplication.forget(connectionId);enemyReplication.forget(connectionId);
      chatLastSentAt.delete(connectionId);
      if (left) {
        // Фиксируем точку выхода — при входе появишься здесь
        const existing = saves.load(left.saveId);
        if (existing) {
          const stamped = saves.save({
            ...existing,
            worldX: Math.round(left.x),
            worldY: Math.round(left.y),
            location: left.locationId,
          });
          // если призрак уже били — hp в presence актуален
          world.patchCombatPresence(stamped.id, { hp: stamped.hp, maxHp: stamped.maxHp });
        }
        broadcastLocationSnapshot(left.locationId, left.saveId);
        const party = parties.getPartyForSave(left.saveId);
        if (party) broadcastPartySnapshot(party.id);
      }
    });
  });
}
