import { MOVEMENT_PROTOCOL } from '@empery/shared/movement';
import type {
  MultiplayerBootstrap,
  MultiplayerDesignDecision,
  MultiplayerLocationSnapshot,
  MultiplayerPlayerPresence,
  PlayerSave,
  PvpStatus,
} from '@empery/shared';
import {
  flagRemainingMs,
  playerKarma,
  resolvePvpStatus,
} from './pvp.js';
import { presenceMountLook } from './mount-presence.js';
import { getLocation } from './locations.js';
import type { PresenceRepository } from './multiplayer-persistence.js';
import type { PresenceBusEvent } from './persistence/presence-bus.js';

type PresenceBusLike = {
  publish(
    event:
      | { op: 'upsert'; channelKey: string; presence: MultiplayerPlayerPresence }
      | { op: 'remove'; channelKey: string; saveId: string },
  ): void;
};

const DEFAULT_SPAWN = { x: 640, y: 480 };
/** Сколько держим персонажа в мире после обрыва сокета (anti-logout). */
export const DISCONNECT_GRACE_MS = 60_000;
/** В safe-zone короче — logout-хитрости в городе менее критичны. */
export const DISCONNECT_GRACE_SAFE_MS = 15_000;

/** Private apartments: isolate channel per save so players never share presence. */
export function multiplayerChannelKey(locationId: string, saveId: string): string {
  const loc = getLocation(locationId);
  if (loc?.privateOwnerOnly) return `${locationId}#${saveId}`;
  return locationId;
}

interface ConnectedPlayerState {
  connectionId: string;
  presence: MultiplayerPlayerPresence;
  /** Runtime-only PvP flag deadline (ms epoch). */
  pvpFlagUntilMs: number;
  /** До какого момента мобы «слышат» атаки этого игрока. */
  combatStimulusUntilMs: number;
  /** Grace после disconnect — после этого presence снимается. */
  disconnectedUntilMs?: number;
}

interface LocationChannel {
  locationId: string;
  players: Map<string, ConnectedPlayerState>;
}

export const MULTIPLAYER_DECISION: MultiplayerDesignDecision = {
  releaseTarget: 'shared_world_foundation',
  transport: 'websocket',
  authoritativeSimulation: true,
  persistence: {
    profile: 'postgres',
    realtimeState: 'redis',
  },
};

function ghostConnectionId(saveId: string): string {
  return `ghost:${saveId}`;
}

function isGhostConnectionId(connectionId: string): boolean {
  return connectionId.startsWith('ghost:');
}

function syncPresencePvp(
  presence: MultiplayerPlayerPresence,
  karma: number,
  flagUntilMs: number,
  now = Date.now(),
): MultiplayerPlayerPresence {
  const remaining = flagRemainingMs(flagUntilMs, now);
  const status: PvpStatus = resolvePvpStatus({ karma, flagUntilMs, now });
  return {
    ...presence,
    karma,
    pvpStatus: status,
    pvpFlagRemainingMs: remaining > 0 ? remaining : undefined,
  };
}

function spawnFromSave(save: PlayerSave): { x: number; y: number } {
  if (
    typeof save.worldX === 'number' &&
    Number.isFinite(save.worldX) &&
    typeof save.worldY === 'number' &&
    Number.isFinite(save.worldY)
  ) {
    return { x: save.worldX, y: save.worldY };
  }
  return { ...DEFAULT_SPAWN };
}

export class WorldRuntime {
  private decision:MultiplayerDesignDecision={...MULTIPLAYER_DECISION,persistence:{...MULTIPLAYER_DECISION.persistence}};
  setPersistenceProfile(profile:'postgres'|'file_saves',realtimeState:'memory'|'redis'):void {this.decision={...this.decision,persistence:{profile,realtimeState}};}

  private readonly byConnection = new Map<string, string>();
  private readonly locations = new Map<string, LocationChannel>();
  /** Remote-node presence overlays keyed by channel → saveId. */
  private readonly remoteByChannel = new Map<string, Map<string, MultiplayerPlayerPresence>>();
  private presenceRepo: PresenceRepository | null = null;
  private presenceBus: PresenceBusLike | null = null;
  private readonly lastMirrorAt = new Map<string, number>();

  setPresenceRepository(repo: PresenceRepository | null): void {
    this.presenceRepo = repo;
  }

  setPresenceBus(bus: PresenceBusLike | null): void {
    this.presenceBus = bus;
  }

  /** Apply presence event from another node (ignores local saveIds). */
  applyRemotePresenceEvent(event: PresenceBusEvent): void {
    if (event.op === 'remove') {
      const map = this.remoteByChannel.get(event.channelKey);
      map?.delete(event.saveId);
      if (map && map.size === 0) this.remoteByChannel.delete(event.channelKey);
      return;
    }
    // Local authority wins for the same character.
    if (this.stateForSave(event.presence.saveId)) return;
    let map = this.remoteByChannel.get(event.channelKey);
    if (!map) {
      map = new Map();
      this.remoteByChannel.set(event.channelKey, map);
    }
    map.set(event.presence.saveId, event.presence);
  }

  private mirrorPresence(
    presence: MultiplayerPlayerPresence,
    channelKey: string,
    opts?: { force?: boolean },
  ): void {
    const repo = this.presenceRepo;
    const now = Date.now();
    if (!opts?.force) {
      const last = this.lastMirrorAt.get(presence.saveId) ?? 0;
      if (now - last < 400) return;
    }
    this.lastMirrorAt.set(presence.saveId, now);
    // Drop our own remote ghost if we took ownership.
    this.remoteByChannel.get(channelKey)?.delete(presence.saveId);
    if (repo) {
      void repo.upsertPresence(presence, channelKey).catch(() => {
        /* redis mirror is best-effort */
      });
    }
    this.presenceBus?.publish({ op: 'upsert', channelKey, presence });
  }

  private unmirrorPresence(saveId: string, channelKey?: string): void {
    const repo = this.presenceRepo;
    this.lastMirrorAt.delete(saveId);
    if (repo) {
      void repo.removePresence(saveId).catch(() => {
        /* ignore */
      });
    }
    if (channelKey) {
      this.presenceBus?.publish({ op: 'remove', channelKey, saveId });
      this.remoteByChannel.get(channelKey)?.delete(saveId);
    } else {
      for (const [key, map] of this.remoteByChannel) {
        if (map.delete(saveId)) {
          this.presenceBus?.publish({ op: 'remove', channelKey: key, saveId });
        }
      }
    }
  }

  private channel(locationId: string): LocationChannel {
    let channel = this.locations.get(locationId);
    if (!channel) {
      channel = { locationId, players: new Map() };
      this.locations.set(locationId, channel);
    }
    return channel;
  }

  private buildPresence(
    save: PlayerSave,
    flagUntilMs = 0,
    pos?: { x: number; y: number },
  ): MultiplayerPlayerPresence {
    const karma = playerKarma(save);
    const look = presenceMountLook(save);
    const spawn = pos ?? spawnFromSave(save);
    const base: MultiplayerPlayerPresence = {
      saveId: save.id,
      name: save.name,
      race: save.race,
      gender: save.gender === 'female' ? 'female' : 'male',
      profession: save.profession,
      level: save.level,
      locationId: save.location,
      x: spawn.x,
      y: spawn.y,
      facing: 'right',
      moving: false,
      hp: save.hp,
      maxHp: save.maxHp,
      mp: save.mp ?? 0,
      maxMp: save.maxMp ?? 0,
      karma,
      pvpStatus: 'peaceful',
      mounted: look.mounted,
      mountId: look.mountId,
      armorType: look.armorType,
      cloakVariant: look.cloakVariant,
      weaponKind: look.weaponKind,
      connectionStatus: 'online',
    };
    return syncPresencePvp(base, karma, flagUntilMs);
  }

  bootstrap(save: PlayerSave): MultiplayerBootstrap {
    const presence = this.buildPresence(save);
    const key = multiplayerChannelKey(save.location, save.id);
    return {
      self: presence,
      snapshot: this.snapshot(key),
      decision: this.decision,
      protocolVersion:MOVEMENT_PROTOCOL,
    };
  }

  /** Убрать призрак того же saveId перед живым connect. */
  private takeGhostState(saveId: string): ConnectedPlayerState | null {
    const ghostId = ghostConnectionId(saveId);
    for (const channel of this.locations.values()) {
      const state = channel.players.get(ghostId);
      if (!state) continue;
      channel.players.delete(ghostId);
      if (channel.players.size === 0) this.locations.delete(channel.locationId);
      return state;
    }
    return null;
  }

  connect(save: PlayerSave, connectionId: string): MultiplayerBootstrap {
    this.disconnect(connectionId);
    const ghost = this.takeGhostState(save.id);
    const flagUntil = ghost?.pvpFlagUntilMs ?? 0;
    // Продлеваем combat stimulus — мобы не «забывают» цель на reconnect
    const combatUntil = Math.max(
      ghost?.combatStimulusUntilMs ?? 0,
      Date.now() + (ghost ? 2800 : 0),
    );
    // Призрак из другой локации (travel / смена канала) — координаты устарели.
    // Same-channel ghost far from disk save (e.g. apartment pose after join_location
    // race) must not override arrivalSpawnForTravel.
    const fromSave = spawnFromSave(save);
    const ghostPos =
      ghost && ghost.presence.locationId === save.location
        ? { x: ghost.presence.x, y: ghost.presence.y }
        : undefined;
    const ghostDrift =
      ghostPos != null ? Math.hypot(ghostPos.x - fromSave.x, ghostPos.y - fromSave.y) : 0;
    const pos = ghostPos && ghostDrift < 512 ? ghostPos : fromSave;
    // HP призрака важнее дискового сейва (могли бить пока offline)
    const hpSave =
      ghost && ghost.presence.hp !== save.hp
        ? { ...save, hp: ghost.presence.hp, maxHp: ghost.presence.maxHp || save.maxHp }
        : save;
    const presence = this.buildPresence(hpSave, flagUntil, pos);
    const key = multiplayerChannelKey(hpSave.location, hpSave.id);
    const channel = this.channel(key);
    channel.players.set(connectionId, {
      connectionId,
      presence,
      pvpFlagUntilMs: flagUntil,
      combatStimulusUntilMs: combatUntil,
    });
    this.byConnection.set(connectionId, key);
    this.mirrorPresence(presence, key, { force: true });
    return {
      self: presence,
      snapshot: this.snapshot(key),
      decision: this.decision,
      protocolVersion:MOVEMENT_PROTOCOL,
    };
  }

  /** Жёсткое удаление (истечение grace / смена локации). */
  disconnect(connectionId: string): MultiplayerPlayerPresence | null {
    const locationId = this.byConnection.get(connectionId);
    if (locationId) {
      this.byConnection.delete(connectionId);
      const channel = this.locations.get(locationId);
      if (!channel) return null;
      const state = channel.players.get(connectionId);
      if (!state) return null;
      channel.players.delete(connectionId);
      if (channel.players.size === 0) this.locations.delete(locationId);
      if (!isGhostConnectionId(connectionId)) this.unmirrorPresence(state.presence.saveId, locationId);
      return state.presence;
    }
    // ghost id may not be in byConnection
    for (const channel of this.locations.values()) {
      const state = channel.players.get(connectionId);
      if (!state) continue;
      channel.players.delete(connectionId);
      if (channel.players.size === 0) this.locations.delete(channel.locationId);
      this.unmirrorPresence(state.presence.saveId, channel.locationId);
      return state.presence;
    }
    return null;
  }

  /**
   * Обрыв сокета → призрак DISCONNECT на graceMs (по умолчанию DISCONNECT_GRACE_MS).
   * Возвращает presence для broadcast (или null).
   */
  beginDisconnectGrace(
    connectionId: string,
    now = Date.now(),
    graceMs = DISCONNECT_GRACE_MS,
  ): MultiplayerPlayerPresence | null {
    const locationId = this.byConnection.get(connectionId);
    if (!locationId) return null;
    const channel = this.locations.get(locationId);
    if (!channel) return null;
    const state = channel.players.get(connectionId);
    if (!state) return null;

    this.byConnection.delete(connectionId);
    channel.players.delete(connectionId);

    const ghostId = ghostConnectionId(state.presence.saveId);
    // на случай старого призрака
    channel.players.delete(ghostId);

    const presence: MultiplayerPlayerPresence = syncPresencePvp(
      {
        ...state.presence,
        moving: false,
        connectionStatus: 'disconnected',
      },
      state.presence.karma,
      state.pvpFlagUntilMs,
      now,
    );

    channel.players.set(ghostId, {
      connectionId: ghostId,
      presence,
      pvpFlagUntilMs: state.pvpFlagUntilMs,
      combatStimulusUntilMs: state.combatStimulusUntilMs,
      disconnectedUntilMs: now + Math.max(1_000, graceMs),
    });
    this.mirrorPresence(presence, locationId, { force: true });
    return presence;
  }

  /** Снять протухших призраков. Возвращает locationId где нужно snapshot. */
  purgeExpiredGhosts(now = Date.now()): string[] {
    const touched = new Set<string>();
    for (const channel of this.locations.values()) {
      for (const [id, state] of channel.players) {
        if (!state.disconnectedUntilMs) continue;
        if (state.disconnectedUntilMs > now) continue;
        channel.players.delete(id);
        this.unmirrorPresence(state.presence.saveId, channel.locationId);
        touched.add(channel.locationId);
      }
      if (channel.players.size === 0) this.locations.delete(channel.locationId);
    }
    return [...touched];
  }

  joinLocation(connectionId: string, save: PlayerSave, locationId: string): MultiplayerBootstrap {
    const prev = this.stateForConnection(connectionId);
    const flagUntil = prev?.pvpFlagUntilMs ?? 0;
    const combatUntil = prev?.combatStimulusUntilMs ?? 0;
    this.disconnect(connectionId);
    this.takeGhostState(save.id);
    const nextSave = { ...save, location: locationId };
    const presence = this.buildPresence(nextSave, flagUntil);
    const key = multiplayerChannelKey(locationId, save.id);
    const channel = this.channel(key);
    channel.players.set(connectionId, {
      connectionId,
      presence,
      pvpFlagUntilMs: flagUntil,
      combatStimulusUntilMs: combatUntil,
    });
    this.byConnection.set(connectionId, key);
    this.mirrorPresence(presence, key, { force: true });
    return {
      self: presence,
      snapshot: this.snapshot(key),
      decision: this.decision,
      protocolVersion:MOVEMENT_PROTOCOL,
    };
  }

  private stateForConnection(connectionId: string): ConnectedPlayerState | null {
    const locationId = this.byConnection.get(connectionId);
    if (!locationId) return null;
    return this.locations.get(locationId)?.players.get(connectionId) ?? null;
  }

  private stateForSave(saveId: string): ConnectedPlayerState | null {
    for (const channel of this.locations.values()) {
      for (const state of channel.players.values()) {
        if (state.presence.saveId === saveId) return state;
      }
    }
    return null;
  }

  updatePresence(
    connectionId: string,
    patch: Pick<MultiplayerPlayerPresence, 'x' | 'y' | 'moving' | 'facing'>,
  ): MultiplayerPlayerPresence | null {
    if (!Number.isFinite(patch.x) || !Number.isFinite(patch.y) || typeof patch.moving !== 'boolean' || !['left','right'].includes(patch.facing)) return null;
    if (isGhostConnectionId(connectionId)) return null;
    const state = this.stateForConnection(connectionId);
    if (!state) return null;
    if (state.presence.connectionStatus === 'disconnected') return null;
    state.presence = syncPresencePvp(
      { ...state.presence, x: patch.x, y: patch.y, moving: patch.moving, facing: patch.facing, connectionStatus: 'online' },
      state.presence.karma,
      state.pvpFlagUntilMs,
    );
    const channelKey = this.byConnection.get(connectionId);
    if (channelKey) this.mirrorPresence(state.presence, channelKey);
    return state.presence;
  }

  /** Обновить HP/карму/флаг после PvP или респауна. */
  patchCombatPresence(
    saveId: string,
    patch: {
      hp?: number;
      maxHp?: number;
      mp?: number;
      maxMp?: number;
      karma?: number;
      flagUntilMs?: number;
      clearFlag?: boolean;
      mounted?: boolean;
      mountId?: string | null;
      armorType?: 'light' | 'heavy' | 'robe';
      cloakVariant?: string | null;
      weaponKind?: 'melee' | 'bow' | 'staff' | null;
    },
  ): MultiplayerPlayerPresence | null {
    const state = this.stateForSave(saveId);
    if (!state) return null;
    if (patch.clearFlag) state.pvpFlagUntilMs = 0;
    if (patch.flagUntilMs !== undefined) {
      state.pvpFlagUntilMs = Math.max(state.pvpFlagUntilMs, patch.flagUntilMs);
    }
    const karma = patch.karma !== undefined ? patch.karma : state.presence.karma;
    state.presence = syncPresencePvp(
      {
        ...state.presence,
        hp: patch.hp ?? state.presence.hp,
        maxHp: patch.maxHp ?? state.presence.maxHp,
        mp: patch.mp ?? state.presence.mp,
        maxMp: patch.maxMp ?? state.presence.maxMp,
        mounted: patch.mounted !== undefined ? patch.mounted : state.presence.mounted,
        mountId: patch.mountId !== undefined ? patch.mountId : state.presence.mountId,
        armorType: patch.armorType !== undefined ? patch.armorType : state.presence.armorType,
        cloakVariant:
          patch.cloakVariant !== undefined ? patch.cloakVariant : state.presence.cloakVariant,
        weaponKind: patch.weaponKind !== undefined ? patch.weaponKind : state.presence.weaponKind,
      },
      karma,
      state.pvpFlagUntilMs,
    );
    const channelKey = multiplayerChannelKey(state.presence.locationId, saveId);
    this.mirrorPresence(state.presence, channelKey, { force: true });
    return state.presence;
  }

  /** Полный sync look с сейва (экип / покупка коня). */
  syncLookFromSave(save: PlayerSave): MultiplayerPlayerPresence | null {
    const look = presenceMountLook(save);
    return this.patchCombatPresence(save.id, {
      mounted: look.mounted,
      mountId: look.mountId,
      armorType: look.armorType,
      cloakVariant: look.cloakVariant,
      weaponKind: look.weaponKind,
      hp: save.hp,
      maxHp: save.maxHp,
      mp: save.mp ?? 0,
      maxMp: save.maxMp ?? 0,
    });
  }

  getFlagUntil(saveId: string): number {
    return this.stateForSave(saveId)?.pvpFlagUntilMs ?? 0;
  }

  refreshPvpFlag(saveId: string, untilMs: number): MultiplayerPlayerPresence | null {
    return this.patchCombatPresence(saveId, { flagUntilMs: untilMs });
  }

  clearPvpFlag(saveId: string): MultiplayerPlayerPresence | null {
    return this.patchCombatPresence(saveId, { clearFlag: true });
  }

  /** Отметить, что игрок атаковал — расширяет агро высоких мобов рядом. */
  noteCombatActivity(saveId: string, durationMs = 2800): void {
    const state = this.stateForSave(saveId);
    if (!state) return;
    state.combatStimulusUntilMs = Math.max(state.combatStimulusUntilMs, Date.now() + durationMs);
  }

  isCombatActive(saveId: string, now = Date.now()): boolean {
    const state = this.stateForSave(saveId);
    if (!state) return false;
    return state.combatStimulusUntilMs > now;
  }

  /** Протухшие флаги → обновить status в presence перед snapshot. */
  refreshLocationFlags(locationId: string): void {
    const channel = this.locations.get(locationId);
    if (!channel) return;
    const now = Date.now();
    for (const state of channel.players.values()) {
      let presence = syncPresencePvp(
        state.presence,
        state.presence.karma,
        state.pvpFlagUntilMs,
        now,
      );
      if (state.disconnectedUntilMs && presence.connectionStatus === 'disconnected') {
        presence = {
          ...presence,
          disconnectRemainingMs: Math.max(0, state.disconnectedUntilMs - now),
        };
      } else if (presence.disconnectRemainingMs !== undefined) {
        const { disconnectRemainingMs: _drop, ...rest } = presence;
        presence = rest;
      }
      state.presence = presence;
    }
  }

  /** Жёстко снять призрак DISCONNECT (админка). */
  purgeGhost(saveId: string): MultiplayerPlayerPresence | null {
    const ghostId = ghostConnectionId(saveId);
    return this.disconnect(ghostId);
  }

  private mergedPresences(channelKey: string): MultiplayerPlayerPresence[] {
    this.refreshLocationFlags(channelKey);
    const local = this.locations.get(channelKey);
    const localList = local ? [...local.players.values()].map((e) => e.presence) : [];
    const localIds = new Set(localList.map((p) => p.saveId));
    const remote = this.remoteByChannel.get(channelKey);
    const remoteList = remote
      ? [...remote.values()].filter((p) => !localIds.has(p.saveId))
      : [];
    return [...localList, ...remoteList];
  }

  presences(locationId: string): MultiplayerPlayerPresence[] {
    return this.mergedPresences(locationId);
  }

  /** Только живые WS — для рассылки. */
  connectionIds(locationId: string): string[] {
    const channel = this.locations.get(locationId);
    if (!channel) return [];
    return [...channel.players.keys()].filter((id) => !isGhostConnectionId(id));
  }

  /** Channel map key for a live connection (includes private apartment suffix). */
  channelKeyForConnection(connectionId: string): string | null {
    return this.byConnection.get(connectionId) ?? null;
  }

  snapshot(locationId: string): MultiplayerLocationSnapshot {
    return {
      locationId: locationId.includes('#') ? locationId.slice(0, locationId.indexOf('#')) : locationId,
      players: this.mergedPresences(locationId),
      generatedAt: Date.now(),
    };
  }

  allConnectionIds(): string[] {
    return [...this.byConnection.keys()];
  }

  /** Все онлайн presence (для админки). Призраки тоже видны. */
  listOnline(): MultiplayerPlayerPresence[] {
    const out: MultiplayerPlayerPresence[] = [];
    const seen = new Set<string>();
    for (const locationId of this.locations.keys()) {
      for (const p of this.presences(locationId)) {
        if (seen.has(p.saveId)) continue;
        seen.add(p.saveId);
        out.push(p);
      }
    }
    return out;
  }

  presenceForConnection(connectionId: string): MultiplayerPlayerPresence | null {
    const state = this.stateForConnection(connectionId);
    if (!state) return null;
    state.presence = syncPresencePvp(
      state.presence,
      state.presence.karma,
      state.pvpFlagUntilMs,
    );
    return state.presence;
  }

  presenceForSave(saveId: string): MultiplayerPlayerPresence | null {
    const state = this.stateForSave(saveId);
    if (!state) return null;
    state.presence = syncPresencePvp(
      state.presence,
      state.presence.karma,
      state.pvpFlagUntilMs,
    );
    return state.presence;
  }

  connectionIdsForSave(saveId: string): string[] {
    const out: string[] = [];
    for (const channel of this.locations.values()) {
      for (const [connectionId, state] of channel.players) {
        if (state.presence.saveId === saveId && !isGhostConnectionId(connectionId)) {
          out.push(connectionId);
        }
      }
    }
    return out;
  }

  /** Live sockets only — survival/companion ticks must not scan every save file. */
  listOnlineSaveIds(): string[] {
    const ids = new Set<string>();
    for (const channel of this.locations.values()) {
      for (const [connectionId, state] of channel.players) {
        if (isGhostConnectionId(connectionId)) continue;
        if (state.presence.connectionStatus === 'disconnected') continue;
        ids.add(state.presence.saveId);
      }
    }
    return [...ids];
  }

  /** Case-insensitive exact name match across all connected players. */
  findByPlayerName(name: string): MultiplayerPlayerPresence[] {
    const needle = name.trim().toLowerCase();
    if (!needle) return [];
    const bySave = new Map<string, string>();
    const out: MultiplayerPlayerPresence[] = [];
    for (const channel of this.locations.values()) {
      for (const state of channel.players.values()) {
        if (state.presence.name.toLowerCase() === needle) {
          if (!bySave.has(state.presence.saveId)) {
            bySave.set(state.presence.saveId, state.presence.saveId);
            out.push(
              syncPresencePvp(state.presence, state.presence.karma, state.pvpFlagUntilMs),
            );
          }
        }
      }
    }
    return out;
  }
}
