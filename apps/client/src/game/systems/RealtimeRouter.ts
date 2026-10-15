import type {
  AllyCastPayload,
  MultiplayerBootstrap,
  MultiplayerEnemyPresence,
  MultiplayerServerMessage,
  PartyInvitePayload,
  PartySnapshot,
  PartyXpSharePayload,
  PlayerSave,
  PlayerStats,
  PvpHitPayload,
} from '../../api.js';
import type { CombatSystem } from '../controllers/CombatSystem.js';
import type { PlayerController } from '../controllers/PlayerController.js';
import type { EntityManager } from './EntityManager.js';
import type { NetworkManager } from './NetworkManager.js';
import type { PvpPresenter } from './PvpPresenter.js';
import type { RemotePlayerManager } from './RemotePlayerManager.js';
import type { RealtimeGateway } from './RealtimeGateway.js';
import type { VfxSystem } from './VfxSystem.js';
import { playHurtFlash } from '../../sprites/sprite-loader.js';
import { syncDeathScreen } from '../../death-ui.js';

export interface GameRegistryCallbacks {
  onSaveUpdate?: (
    save: PlayerSave,
    stats?: PlayerStats,
    opts?: { combatTick?: boolean },
  ) => void;
  onTalkNpc?: (npcId: string) => void;
  onUseStation?: (kinds: Array<'campfire' | 'hearth' | 'water' | 'pot'>) => void;
  onCombatFeedback?: (text: string) => void;
  onSkillsChanged?: (unlocked?: string[]) => void;
  onPlayerDeath?: () => void;
  onTravelLocation?: (locationId: string) => void;
  onTravelResult?: (ok: boolean) => void;
  onAutoAttackToggle?: (active: boolean, remainingMs: number) => void;
  onTimedBuffs?: (
    buffs: Array<{ id: string; name: string; remainingMs: number; detail?: string }>,
  ) => void;
  onChatMessage?: (msg: import('../../api.js').MultiplayerChatMessage) => void;
  onChatError?: (error: string) => void;
  onPartySnapshot?: (party: PartySnapshot | null) => void;
  onPartyInvite?: (invite: PartyInvitePayload) => void;
  onPartyError?: (error: string) => void;
  onPartyXp?: (payload: PartyXpSharePayload) => void;
  onPartyQuest?: (payload: import('../../api.js').PartyQuestSharePayload) => void;
  onPartyMemberVitals?: (
    saveId: string,
    vitals: {
      hp?: number;
      maxHp?: number;
      mp?: number;
      maxMp?: number;
      online?: boolean;
      locationId?: string | null;
      locationName?: string | null;
      pvpStatus?: string;
      inCombat?: boolean;
      buffLabels?: Array<{ id: string; name: string; remainingMs: number; detail?: string }>;
    },
  ) => void;
  onPartyMemberLeft?: (saveId: string) => void;
  onPlayerTarget?: (target: { saveId: string; name: string } | null) => void;
  onPvpStatus?: (status: {
    karma: number;
    pvpStatus: string;
    pvpFlagRemainingMs?: number;
  }) => void;
  onRadioIncoming?: (npcId: string) => void;
  onPlayerResurrected?: (payload: {
    targetSaveId: string;
    casterSaveId: string;
    casterName: string;
    targetName: string;
  }) => void;
  onMountStamina?: (info: {
    owned: boolean;
    mounted: boolean;
    stamina: number;
    max: number;
    canRun: boolean;
    carryWeightKg: number;
  } | null) => void;
  onMountStaminaSync?: (stamina: number) => void;
  onPlayerStamina?: (info: {
    stamina: number;
    max: number;
    canRun: boolean;
    carryWeightKg: number;
  }) => void;
  onPlayerStaminaSync?: (stamina: number) => void;
  onGroundLootSnapshot?: (piles: import('@empery/shared').GroundLootPile[] | undefined) => void;
  onGroundLootSpawned?: (pile: import('@empery/shared').GroundLootPile) => void;
  onGroundLootRemoved?: (payload: import('@empery/shared').GroundLootRemovedPayload) => void;
  onCompanionFetchStarted?: (payload: import('@empery/shared').CompanionFetchStartedPayload) => void;
  onLootPicked?: (payload: {
    ok: boolean;
    error?: string;
    lootId?: string;
    saveId: string;
    summary?: string;
  }) => void;
  onCompanionTamed?: (payload: {
    saveId: string;
    kind: string;
    variantId: string;
  }) => void;
}

export interface RealtimeRouterContext {
  getSave: () => PlayerSave;
  setSave: (save: PlayerSave) => void;
  getStats: () => PlayerStats;
  getLocationId: () => string;
  getCallbacks: () => GameRegistryCallbacks | undefined;
  remotePlayers: RemotePlayerManager;
  entities: EntityManager;
  network: NetworkManager;
  realtime: RealtimeGateway;
  pvp: PvpPresenter;
  vfx: VfxSystem;
  getCombat: () => CombatSystem | undefined;
  getPlayerCtrl: () => PlayerController | undefined;
  applyWorldTime?: (
    snapshot: import('@empery/shared').DayNightSnapshot,
    havenSchedule?: import('@empery/shared').HavenScheduleSnapshot,
  ) => void;
}

export class RealtimeRouter {
  private enemyBaseline=new Map<string,MultiplayerEnemyPresence>();
  private enemyEncounter='';
  constructor(private readonly ctx: RealtimeRouterContext) {}

  /** Apply server vitals to local save; show death UI when HP hits zero live (not only on refresh). */
  private syncSelfVitalsAndDeath(
    patch: Partial<PlayerSave>,
    nextStats?: PlayerStats,
  ): void {
    const save = this.ctx.getSave();
    if (!save) return;
    const player = this.ctx.getPlayerCtrl();
    const wasAlive = save.hp > 0 && !player?.isDead;
    const next: PlayerSave = { ...save, ...patch };
    this.ctx.setSave(next);
    this.ctx.getCallbacks()?.onSaveUpdate?.(next, nextStats ?? this.ctx.getStats());

    if (next.hp <= 0) {
      const cause = next.lastDeathCause?.trim();
      if (cause) {
        const deathOpen = document.getElementById('death-screen')?.classList.contains('visible');
        if (wasAlive || deathOpen) syncDeathScreen(cause, next.lastDeathKind);
      }
      if (wasAlive) {
        const cb = this.ctx.getCallbacks();
        cb?.onCombatFeedback?.(cause ?? 'Потерял сознание');
        if (player && !player.isDead) {
          player.beginDeath(() => cb?.onPlayerDeath?.());
        } else {
          cb?.onPlayerDeath?.();
        }
      }
    }
  }

  handleBootstrap(bootstrap: MultiplayerBootstrap): void {
    const save = this.ctx.getSave();
    if (bootstrap.self.locationId !== save.location || bootstrap.self.locationId !== this.ctx.getLocationId()) return;
    this.ctx.remotePlayers.applySnapshot(bootstrap.snapshot);
    const player = this.ctx.getPlayerCtrl();
    const scene = player?.player?.scene;
    const mapW = scene?.physics.world.bounds.width ?? 0;
    const mapH = scene?.physics.world.bounds.height ?? 0;

    const bootX = bootstrap.self.x;
    const bootY = bootstrap.self.y;
    // A compatible current-socket welcome is authoritative even far from the old saved pose.
    const bootInMap =
      mapW > 0 &&
      mapH > 0 &&
      Number.isFinite(bootX) &&
      Number.isFinite(bootY) &&
      bootX >= 0 &&
      bootY >= 0 &&
      bootX < mapW &&
      bootY < mapH;

    if (player?.player?.active && bootInMap) {
      player.setPosition(bootX, bootY);
    }
    const wasAlive = save.hp > 0 && !player?.isDead;
    const diedOffline = bootstrap.self.hp <= 0 && wasAlive;
    const hpLostWhileAway =
      wasAlive && bootstrap.self.hp > 0 && bootstrap.self.hp < save.hp
        ? save.hp - bootstrap.self.hp
        : 0;
    if (
      bootstrap.self.hp !== save.hp ||
      bootstrap.self.maxHp !== save.maxHp ||
      (bootInMap && (bootX !== save.worldX || bootY !== save.worldY))
    ) {
      const next = {
        ...save,
        hp: bootstrap.self.hp,
        maxHp: bootstrap.self.maxHp || save.maxHp,
        ...(bootInMap ? { worldX: bootX, worldY: bootY } : {}),
      };
      this.ctx.setSave(next);
      this.ctx.getCallbacks()?.onSaveUpdate?.(next, this.ctx.getStats());
    }
    const cb = this.ctx.getCallbacks();
    if (bootstrap.self.hp <= 0) {
      if (diedOffline) {
        cb?.onCombatFeedback?.('Вас убили, пока вы были вне игры');
        syncDeathScreen('Вас убили, пока вы были вне игры.', this.ctx.getSave()?.lastDeathKind);
      }
      if (player && !player.isDead) {
        player.beginDeath(() => cb?.onPlayerDeath?.());
      } else {
        cb?.onPlayerDeath?.();
      }
    } else if (hpLostWhileAway > 0) {
      cb?.onCombatFeedback?.(`Пока вас не было: −${hpLostWhileAway} HP`);
    }
    cb?.onPartySnapshot?.(bootstrap.party ?? null);
    cb?.onPvpStatus?.({
      karma: bootstrap.self.karma ?? 0,
      pvpStatus: bootstrap.self.pvpStatus ?? 'peaceful',
      pvpFlagRemainingMs: bootstrap.self.pvpFlagRemainingMs,
    });
  }

  handleMessage(message: MultiplayerServerMessage): void {
    if(message.type==='motion_snapshot'){
      const player=this.ctx.getPlayerCtrl();if(!player||!player.player?.active)return;
      const target=this.ctx.realtime.reconcile(message.payload,player.getPosition());
      if(target){const before=player.getPosition();player.reconcileMotion(target.x,target.y);this.ctx.realtime.applyPredictionCorrection(player.x-before.x,player.y-before.y);}
      return;
    }
    if (message.type === 'position_correction') {
      const player = this.ctx.getPlayerCtrl();
      player?.setPosition(message.payload.x,message.payload.y);
      return;
    }
    if (message.type === 'player_state' || message.type === 'enemy_hit') {
      const current = this.ctx.getSave();
      if (message.payload.save.id !== current.id || message.payload.save.location !== current.location) return;
      this.syncSelfVitalsAndDeath(message.payload.save,message.payload.stats);
      const player = this.ctx.getPlayerCtrl();
      player?.adoptAuthoritativeVitals(message.payload.save,message.payload.stats);
      if (message.type === 'enemy_hit' && player && !player.isDead) {
        if (message.payload.dodged) this.ctx.vfx.floatText(player.x,player.y,'DODGE','#88ccff');
        else if (message.payload.damage > 0) {
          player.playHurt();
          playHurtFlash(player.player.scene,player.player);
          this.ctx.vfx.floatText(player.x,player.y,`-${message.payload.damage}`,'#ffaa77');
        }
      }
      return;
    }
    if(message.type==='presence_delta'){
      if(message.payload.locationId.split('#')[0]!==this.ctx.getLocationId())return;
      for(const id of message.payload.removed)this.ctx.remotePlayers.remove(id);
      for(const player of message.payload.added)this.ctx.remotePlayers.applyPresence(player);
      const changed=[];
      for(const patch of message.payload.changed){
        const previous=this.ctx.remotePlayers.getPresence(patch.saveId);
        if(previous){const {unset,...values}=patch;const player={...previous,...values};for(const key of unset??[])Reflect.deleteProperty(player,key);this.ctx.remotePlayers.applyPresence(player);changed.push(player);}
      }
      this.syncPartyVitalsFromPlayers([...message.payload.added,...changed]);
      if(message.payload.groundLoot!==undefined)this.ctx.getCallbacks()?.onGroundLootSnapshot?.(message.payload.groundLoot);
      return;
    }
    if (message.type === 'location_snapshot') {
      this.ctx.remotePlayers.applySnapshot(message.payload);
      this.syncPartyVitalsFromPlayers(message.payload.players);
      this.ctx.getCallbacks()?.onGroundLootSnapshot?.(message.payload.groundLoot);
      return;
    }
    if (message.type === 'player_joined' || message.type === 'player_updated') {
      const save = this.ctx.getSave();
      if (save && message.payload.saveId === save.id) {
        this.syncSelfVitalsAndDeath({
          hp: message.payload.hp,
          maxHp: message.payload.maxHp,
          mp: message.payload.mp,
          maxMp: message.payload.maxMp,
        });
      }
      this.ctx.remotePlayers.applyPresence(message.payload);
      this.syncPartyVitalsFromPlayers([message.payload]);
      return;
    }
    if (message.type === 'player_left') {
      this.ctx.remotePlayers.remove(message.payload.saveId);
      this.ctx.getCallbacks()?.onPartyMemberLeft?.(message.payload.saveId);
      return;
    }
    if(message.type==='enemy_delta'){
      const payload=message.payload;
      if(payload.locationId!==this.ctx.getLocationId()||payload.encounterId!==this.enemyEncounter)return;
      for(const id of payload.removed){this.enemyBaseline.delete(id);const enemy=this.ctx.entities.getByEntityId(id);if(enemy)this.ctx.entities.recycleEnemy(enemy);}
      for(const id of payload.dead){this.enemyBaseline.delete(id);this.ctx.getCombat()?.applyRemoteDeath(id);}
      for(const enemy of payload.added)this.enemyBaseline.set(enemy.entityId,enemy);
      for(const patch of payload.changed){const old=this.enemyBaseline.get(patch.entityId);if(old){const {unset,...values}=patch;const enemy={...old,...values};for(const key of unset??[])Reflect.deleteProperty(enemy,key);this.enemyBaseline.set(patch.entityId,enemy);}}
      this.handleEnemySnapshot({locationId:payload.locationId,encounterId:payload.encounterId,enemies:[...this.enemyBaseline.values()],interestFiltered:true});
      return;
    }
    if (message.type === 'enemy_snapshot') {
      this.enemyEncounter=message.payload.encounterId;this.enemyBaseline=new Map(message.payload.enemies.map(enemy=>[enemy.entityId,enemy]));
      this.handleEnemySnapshot(message.payload);
      return;
    }
    if (message.type === 'chat_message') {
      this.ctx.getCallbacks()?.onChatMessage?.(message.payload);
      return;
    }
    if (message.type === 'chat_error') {
      this.ctx.getCallbacks()?.onChatError?.(message.error);
      return;
    }
    if (message.type === 'party_snapshot') {
      this.ctx.getCallbacks()?.onPartySnapshot?.(message.payload);
      return;
    }
    if (message.type === 'party_invite') {
      this.ctx.getCallbacks()?.onPartyInvite?.(message.payload);
      return;
    }
    if (message.type === 'party_error') {
      this.ctx.getCallbacks()?.onPartyError?.(message.error);
      return;
    }
    if (message.type === 'party_xp') {
      this.ctx.getCallbacks()?.onPartyXp?.(message.payload);
      return;
    }
    if (message.type === 'party_quest') {
      this.ctx.getCallbacks()?.onPartyQuest?.(message.payload);
      return;
    }
    if (message.type === 'pvp_event') {
      this.handlePvpHit(message.payload);
      return;
    }
    if (message.type === 'pvp_death') {
      this.handlePvpDeath(message.payload);
      return;
    }
    if (message.type === 'player_resurrected') {
      this.ctx.getCallbacks()?.onPlayerResurrected?.(message.payload);
      return;
    }
    if (message.type === 'ally_cast_result') {
      this.handleAllyCast(message.payload);
      return;
    }
    if (message.type === 'ally_cast_error') {
      this.ctx.getCallbacks()?.onCombatFeedback?.(message.error);
      return;
    }
    if (message.type === 'pvp_error') {
      this.ctx.getCallbacks()?.onCombatFeedback?.(message.error);
      return;
    }
    if (message.type === 'survival_update') {
      const save = this.ctx.getSave();
      if (!save || save.id !== message.payload.saveId) return;
      const stats = this.ctx.getStats();
      const nextStats = stats
        ? {
            ...stats,
            survivalSeverity: message.payload.stats?.survivalSeverity ?? stats.survivalSeverity,
            survivalConditions: message.payload.stats?.survivalConditions ?? stats.survivalConditions,
          }
        : undefined;
      this.syncSelfVitalsAndDeath(
        {
          survival: message.payload.survival,
          ...(typeof message.payload.hp === 'number' ? { hp: message.payload.hp } : {}),
          ...(typeof message.payload.maxHp === 'number' ? { maxHp: message.payload.maxHp } : {}),
          ...(message.payload.lastDeathCause !== undefined
            ? { lastDeathCause: message.payload.lastDeathCause }
            : {}),
          ...(message.payload.lastDeathKind !== undefined
            ? { lastDeathKind: message.payload.lastDeathKind }
            : {}),
        },
        nextStats,
      );
      return;
    }
    if (message.type === 'ground_loot_spawned') {
      this.ctx.getCallbacks()?.onGroundLootSpawned?.(message.payload);
      return;
    }
    if (message.type === 'ground_loot_removed') {
      this.ctx.getCallbacks()?.onGroundLootRemoved?.(message.payload);
      return;
    }
    if (message.type === 'companion_fetch_started') {
      this.ctx.getCallbacks()?.onCompanionFetchStarted?.(message.payload);
      return;
    }
    if (message.type === 'world_time') {
      this.ctx.applyWorldTime?.(message.payload.timeOfDay, message.payload.havenSchedule);
      return;
    }
    if (message.type === 'loot_pickup_result') {
      const cb = this.ctx.getCallbacks();
      if (!message.payload.ok) {
        cb?.onCombatFeedback?.(message.payload.error ?? 'Не удалось подобрать');
        return;
      }
      cb?.onLootPicked?.(message.payload);
      return;
    }
    if (message.type === 'companion_tamed') {
      this.ctx.getCallbacks()?.onCompanionTamed?.(message.payload);
      return;
    }
  }

  private handleAllyCast(payload: AllyCastPayload): void {
    const me = this.ctx.getSave().id;
    const cb = this.ctx.getCallbacks();
    const effects =
      payload.targets?.length > 0
        ? payload.targets
        : payload.target
          ? [
              {
                saveId: payload.targetSaveId ?? payload.target.saveId,
                healAmount: payload.healAmount,
                mpAmount: 0,
                buffApplied: payload.buffApplied,
                presence: payload.target,
                buffLabels: payload.targetBuffLabels,
              },
            ]
          : [];

    this.ctx.remotePlayers.applyPresence(payload.caster);
    cb?.onPartyMemberVitals?.(payload.casterSaveId, {
      hp: payload.caster.hp,
      maxHp: payload.caster.maxHp,
      mp: payload.caster.mp,
      maxMp: payload.caster.maxMp,
      online: true,
      locationId: payload.caster.locationId,
      pvpStatus: payload.caster.pvpStatus,
    });

    for (const fx of effects) {
      const px = fx.presence.x;
      const py = fx.presence.y;
      const hpDelta = fx.hpDelta ?? (fx.healAmount > 0 ? fx.healAmount : 0);
      if (hpDelta > 0) {
        this.ctx.vfx.floatText(px, py - 20, `+${hpDelta}`, '#66ee99');
        this.ctx.vfx.sparks(px, py, 0x66ee99, 10);
      } else if (hpDelta < 0) {
        this.ctx.vfx.floatText(px, py - 20, `${hpDelta}`, '#e8a060');
        this.ctx.vfx.sparks(px, py, 0xe8a060, 6);
      } else if (fx.mpAmount > 0) {
        this.ctx.vfx.floatText(px, py - 20, `+${fx.mpAmount} MP`, '#66aaff');
        this.ctx.vfx.sparks(px, py, 0x6688ff, 8);
      } else if (fx.buffApplied) {
        this.ctx.vfx.floatText(px, py - 20, payload.skillName, '#88ccff');
        this.ctx.vfx.sparks(px, py, 0x88aaff, 8);
      }
      if (fx.saveId !== payload.casterSaveId) {
        this.ctx.remotePlayers.applyPresence(fx.presence);
      }
      cb?.onPartyMemberVitals?.(fx.saveId, {
        hp: fx.presence.hp,
        maxHp: fx.presence.maxHp,
        mp: fx.presence.mp,
        maxMp: fx.presence.maxMp,
        online: true,
        locationId: fx.presence.locationId,
        pvpStatus: fx.presence.pvpStatus,
        buffLabels: fx.buffLabels,
      });
    }

    if (payload.casterSaveId === me) {
      const save = {
        ...this.ctx.getSave(),
        hp: payload.caster.hp,
        maxHp: payload.caster.maxHp,
        mp: payload.casterMp ?? payload.caster.mp ?? this.ctx.getSave().mp,
        maxMp: payload.caster.maxMp,
        skillCooldowns: payload.casterSkillCooldowns ?? this.ctx.getSave().skillCooldowns,
      };
      this.ctx.setSave(save);
      cb?.onSaveUpdate?.(save, undefined, { combatTick: true });
    }

    const selfFx = effects.find((e) => e.saveId === me);
    if (selfFx) {
      if (payload.casterSaveId !== me) {
        const save = {
          ...this.ctx.getSave(),
          hp: selfFx.presence.hp,
          maxHp: selfFx.presence.maxHp,
          mp: selfFx.presence.mp ?? this.ctx.getSave().mp,
          maxMp: selfFx.presence.maxMp,
        };
        this.ctx.setSave(save);
        cb?.onSaveUpdate?.(save, undefined, { combatTick: true });
      }
      const labels = selfFx.buffLabels ?? payload.targetBuffLabels;
      if (selfFx.buffApplied && labels?.length) {
        this.ctx.getCombat()?.setAllyHudBuffs(labels);
      }
    }
  }

  sendChat(channel: 'location' | 'global' | 'private' | 'party', text: string, toName?: string): void {
    if (channel === 'private') {
      this.ctx.realtime.send({ type: 'chat_send', channel: 'private', text, toName });
      return;
    }
    this.ctx.realtime.send({ type: 'chat_send', channel, text });
  }

  sendPartyInvite(toName: string): void {
    this.ctx.realtime.send({ type: 'party_invite', toName });
  }

  sendPartyAccept(partyId: string): void {
    this.ctx.realtime.send({ type: 'party_accept', partyId });
  }

  sendPartyDecline(partyId: string): void {
    this.ctx.realtime.send({ type: 'party_decline', partyId });
  }

  sendPartyLeave(): void {
    this.ctx.realtime.send({ type: 'party_leave' });
  }

  sendPartyKick(saveId: string): void {
    this.ctx.realtime.send({ type: 'party_kick', saveId });
  }

  sendPartyDisband(): void {
    this.ctx.realtime.send({ type: 'party_disband' });
  }

  sendPartyPromote(saveId: string): void {
    this.ctx.realtime.send({ type: 'party_promote', saveId });
  }

  sendPartyAssist(targetSaveId: string | null): void {
    this.ctx.realtime.send({ type: 'party_assist', targetSaveId });
  }

  private syncPartyVitalsFromPlayers(
    players: Array<{
      saveId: string;
      hp: number;
      maxHp: number;
      mp?: number;
      maxMp?: number;
      locationId?: string;
      pvpStatus?: string;
    }>,
  ): void {
    const cb = this.ctx.getCallbacks();
    for (const p of players) {
      cb?.onPartyMemberVitals?.(p.saveId, {
        hp: p.hp,
        maxHp: p.maxHp,
        mp: p.mp,
        maxMp: p.maxMp,
        online: true,
        locationId: p.locationId,
        pvpStatus: p.pvpStatus,
      });
    }
  }

  private handleEnemySnapshot(payload: {
    locationId: string;
    encounterId: string;
    enemies: MultiplayerEnemyPresence[];
    interestFiltered?:boolean;
  }): void {
    const combat = this.ctx.getCombat();
    if (!this.ctx.entities.isReady() || !combat) return;
    if (payload.locationId !== this.ctx.getLocationId()) return;
    const localEnc = this.ctx.network.getEncounterId();
    if (localEnc && payload.encounterId && payload.encounterId !== localEnc) return;

    const missing = this.ctx.entities.applyEnemySnapshot(payload.enemies);
    for (const entityId of missing) {
      if(payload.interestFiltered){const enemy=this.ctx.entities.getByEntityId(entityId);if(enemy&&!enemy.isDying)this.ctx.entities.recycleEnemy(enemy);}
      else combat.applyRemoteDeath(entityId);
    }
  }

  private handlePvpHit(payload: PvpHitPayload): void {
    const playerCtrl = this.ctx.getPlayerCtrl();
    if (!playerCtrl) return;
    this.ctx.pvp.applyHit(payload, {
      scene: playerCtrl.player.scene,
      save: this.ctx.getSave(),
      stats: this.ctx.getStats(),
      setSave: this.ctx.setSave,
      playerCtrl,
      remotePlayers: this.ctx.remotePlayers,
      vfx: this.ctx.vfx,
      callbacks: this.ctx.getCallbacks() ?? {},
    });
  }

  private handlePvpDeath(payload: {
    victimId: string;
    killerId: string;
    killerName: string;
    victimName: string;
    wasPk: boolean;
    victimDisconnected?: boolean;
  }): void {
    const playerCtrl = this.ctx.getPlayerCtrl();
    if (!playerCtrl) return;
    this.ctx.pvp.handleDeath(payload, {
      save: this.ctx.getSave(),
      playerCtrl,
      callbacks: this.ctx.getCallbacks() ?? {},
    });
  }
}
