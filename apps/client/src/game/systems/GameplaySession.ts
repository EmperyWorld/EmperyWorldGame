import { selectNightLanterns } from './night-lanterns.js';
import { PLAYER_INTERACTION_LOS_KEY } from '../../sprites/citizen-interaction.js';
import { MovementConnectionStatus } from './movement-connection-status.js';
import { ClientPerformance } from './client-performance.js';
import Phaser from 'phaser';
import type { PlayerSave, PlayerStats, SkillDefinition } from '../../api.js';
import { flushSavePosition } from '../../api.js';
import { PLAYER_XY_KEY } from '../../sprites/haven-citizens.js';
import {
  addLocationDecorations,
  addLocationBackground,
  applyMapCollision,
  applyGroundLayerStyle,
  bindPlayerToPropColliders,
  clearPropColliders,
  nudgePointFromPropColliders,
} from '../../sprites/location-decor.js';
import { setGroundCollisionLayer } from '../../sprites/world-tiles.js';
import { createGroundLayers, type GroundLayer } from './ground-layer.js';
import { Depth } from '../constants/depth.js';
import { questFlagsChanged } from '../utils/save-utils.js';
import type { InputManager } from './InputManager.js';
import type { NetworkManager } from './NetworkManager.js';
import type { RealtimeGateway } from './RealtimeGateway.js';
import { RealtimeRouter, type GameRegistryCallbacks } from './RealtimeRouter.js';
import type { EntityManager } from './EntityManager.js';
import type { RemotePlayerManager } from './RemotePlayerManager.js';
import { resourceCache } from './ResourceCache.js';
import type { VfxSystem } from './VfxSystem.js';
import type { MinimapSystem } from './MinimapSystem.js';
import type { QuestPresenter } from './QuestPresenter.js';
import type { PortalSystem } from './PortalSystem.js';
import type { PvpPresenter } from './PvpPresenter.js';
import { PlayerController } from '../controllers/PlayerController.js';
import { EnemyAIController } from '../controllers/EnemyAIController.js';
import type { CombatSystem } from '../controllers/CombatSystem.js';
import { PerfMonitor } from '../dev/perf-monitor.js';
import type { LocationConfig } from '../scenes/location-types.js';
import type {
  MultiplayerBootstrap,
  MultiplayerServerMessage,
} from '../../api.js';
import { bootstrapEncounter as runEncounterBootstrap } from './encounter-bootstrap.js';
import {
  syncRealtimePlayerInput,
  flushRealtimePlayerPosition,
  syncStaminaHud,
  type RealtimeInputState,
  type StaminaHudSyncState,
} from './session-hud-sync.js';
import { wireCombatSystem } from './session-combat-wire.js';
import { GroundLootManager } from '../../ground-loot.js';
import { CompanionSprite } from '../../companion-sprite.js';
import { offerBreadToSeagull, pickupLoot, fetchSurvival } from '../../api.js';
import { appendChatSystem } from '../../chat-ui.js';
import { DayNightOverlay } from '../../day-night-overlay.js';
import { DayNightLights } from '../../day-night-lights.js';
import { applyLight2DPipeline, setSceneLight2DEnabled, shouldEnableLocationLight2D } from '../../sprites/light2d-pipeline.js';
import {
  havenShipTimetable,
  havenSnapLeakedIndoorPose,
  resolveDayNightProfile,
  resolveHavenShipVoyage,
  type DayNightSnapshot,
  type HavenScheduleSnapshot,
  type HavenShipVoyageState,
} from '@empery/shared';
import {
  applyWorldClock,
  getAbsoluteGameHours,
  getHavenSchedule,
} from '../../world-clock.js';
import { COMPANION_SEAGULL_OFFER_RADIUS } from '@empery/shared';
import { getGraphicsProfile } from './graphics-quality.js';

export interface GameplaySystems {
  inputManager: InputManager;
  network: NetworkManager;
  realtime: RealtimeGateway;
  entities: EntityManager;
  remotePlayers: RemotePlayerManager;
  vfx: VfxSystem;
  minimap: MinimapSystem;
  quests: QuestPresenter;
  portals: PortalSystem;
  pvp: PvpPresenter;
}

/**
 * Orchestration for an active GameScene: controllers, update loop, encounter,
 * realtime input, stamina HUD, shutdown. Scene keeps system instances + thin API.
 */
export class GameplaySession {
  private scene!: Phaser.Scene;
  private systems!: GameplaySystems;
  private save!: PlayerSave;
  private stats!: PlayerStats;
  private location!: LocationConfig;
  private sceneGeneration = 0;

  private playerCtrl!: PlayerController;
  private enemyAi!: EnemyAIController;
  private combat!: CombatSystem;
  private realtimeRouter?: RealtimeRouter;
  private perf = new PerfMonitor();
  private soakTimer?: Phaser.Time.TimerEvent;

  private mapW = 1280;
  private mapH = 896;
  private readonly staminaHud: StaminaHudSyncState = { lastKey: '', lastAt: 0 };
  private readonly realtimeInput: RealtimeInputState = {
    lastAt: 0,
    lastSent: { x: 0, y: 0, moving: false, facing: 'right' },
  };
  private onPointerDownGround?: (
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[],
  ) => void;
  private onPointerMoveGround?: (pointer: Phaser.Input.Pointer) => void;
  private onPointerUpGround?: (pointer: Phaser.Input.Pointer) => void;
  private clickHoldActive = false;
  private onTravelLocation?: (locationId: string) => void;
  private boundPageHide?: () => void;
  private boundVisibility?: () => void;
  private readonly groundLoot = new GroundLootManager();
  private readonly companionSprite = new CompanionSprite();
  private readonly dayNightOverlay = new DayNightOverlay();
  private readonly dayNightLights = new DayNightLights();
  /** QA pin so world_time ticks cannot undo day/night proof shots. */
  private pinnedHour: number | null = null;
  private readonly movingLightBuffer: Array<{ x: number; y: number }> = [];
  private dayNightClockAt = 0;
  private lastAnnouncedPhase: 'day' | 'night' | null = null;
  private pickupBusy = false;
  private seagullHint?: Phaser.GameObjects.Text;
  private havenScheduleMissingSinceMs: number | null = null;
  private havenScheduleWarningShown = false;
  private havenScheduleWaitingLabel?: Phaser.GameObjects.Text;

  /** После HTTP travel — снять in-flight lock порталов при ошибке. */
  notifyTravelResult(ok: boolean): void {
    this.systems?.portals.endTravelAttempt(!ok);
  }

  begin(data: { save: PlayerSave; stats: PlayerStats; location: LocationConfig }): void {
    this.pickupBusy = false;
    this.realtimeInput.lastAt = 0;
    this.realtimeInput.lastSent = { x: data.save.worldX ?? data.location.spawn.x, y: data.save.worldY ?? data.location.spawn.y, moving: false, facing: 'right', dash: false };
    this.save = data.save;
    this.stats = data.stats;
    this.location = data.location;
    this.dayNightOverlay.setProfile(resolveDayNightProfile(this.location));
    this.pinnedHour = null;
    this.sceneGeneration += 1;
  }

  handleRealtimeMessage(message: MultiplayerServerMessage): void {
    this.realtimeRouter?.handleMessage(message);
  }

  handleRealtimeError(error: string): void {
    if (!error) return;
    const callbacks = this.scene?.registry.get('callbacks') as GameRegistryCallbacks | undefined;
    callbacks?.onCombatFeedback?.(error);
  }

  handleRealtimeReconnect(): void {
    if (!this.systems) return;
    void this.bootstrapEncounter({ notifyOnError: true });
  }

  boot(scene: Phaser.Scene, systems: GameplaySystems): void {
    this.scene = scene;
    this.systems = systems;
    const callbacks = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
    this.onTravelLocation = callbacks?.onTravelLocation;

    resourceCache.ensureCombatAssets(scene, this.save.race);
    scene.cameras.main.setBackgroundColor('#0f1115');
    // Drop any leftover prop static group before rebuilding the location.
    clearPropColliders(scene);
    setGroundCollisionLayer(scene, null);

    const map = scene.make.tilemap({ key: this.location.mapKey });
    setSceneLight2DEnabled(scene, shouldEnableLocationLight2D(this.location));
    const tiles = map.addTilesetImage('terrain', 'terrain-tiles');
    let groundLayer: GroundLayer | null = null;
    if (tiles) {
      const layers = createGroundLayers(scene, map, tiles);
      groundLayer = layers?.collision ?? null;
      if (layers) {
        applyGroundLayerStyle(layers.render, this.location.id);
        applyLight2DPipeline(layers.render as { scene?: Phaser.Scene | null; setPipeline?: (name: string) => unknown });
        applyMapCollision(map, layers.collision);
        setGroundCollisionLayer(scene, layers.collision);
      }
    }

    this.mapW = map.widthInPixels;
    this.mapH = map.heightInPixels;
    scene.physics.world.setBounds(0, 0, this.mapW, this.mapH);
    scene.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    scene.cameras.main.setZoom(getGraphicsProfile().resolutionScale);

    addLocationBackground(scene, this.location, this.mapW, this.mapH);

    systems.vfx.init(scene);
    systems.vfx.addAtmosphere(this.location.id);
    systems.vfx.spawnAmbient(this.location.id, this.mapW, this.mapH);

    systems.inputManager.bind(scene);
    systems.network.setSaveId(this.save.id);
    systems.entities.init(scene, groundLayer);
    systems.entities.setPlayerLevel(this.save.level);
    systems.remotePlayers.init(scene, this.save.id, (saveId) => this.setPlayerTarget(saveId));

    this.playerCtrl = new PlayerController(scene, systems.inputManager, message => {
      const callbacks = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
      callbacks?.onCombatFeedback?.(message);
    });
    this.playerCtrl.create(this.save, this.location, groundLayer);
    const rawMap=scene.cache.tilemap.get(this.location.mapKey)?.data;
    if(rawMap)this.playerCtrl.configureMotion(rawMap,this.save,this.location);
    // Haven coords (~2000+) must not carry into small maps — snap to location spawn.
    {
      const margin = 48;
      const px = this.playerCtrl.x;
      const py = this.playerCtrl.y;
      const inMap =
        Number.isFinite(px) &&
        Number.isFinite(py) &&
        px >= margin &&
        py >= margin &&
        px <= this.mapW - margin &&
        py <= this.mapH - margin;
      if (!inMap) {
        const sx = this.location.spawn.x;
        const sy = this.location.spawn.y;
        this.playerCtrl.setPosition(sx, sy);
        this.save = { ...this.save, worldX: Math.round(sx), worldY: Math.round(sy) };
        scene.registry.set('bootSave', this.save);
        const cb = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
        cb?.onSaveUpdate?.(this.save, this.stats);
      } else if (this.location.id === 'empery_haven') {
        const leaked = havenSnapLeakedIndoorPose(px, py);
        if (leaked) {
          const sx = leaked.x;
          const sy = leaked.y;
          this.playerCtrl.setPosition(sx, sy);
          this.save = { ...this.save, worldX: Math.round(sx), worldY: Math.round(sy) };
          scene.registry.set('bootSave', this.save);
          const cb = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
          cb?.onSaveUpdate?.(this.save, this.stats);
        }
      }
    }
    this.playerCtrl.refreshWeapon(this.save, this.stats);
    this.playerCtrl.refreshMount(this.save, this.stats);
    scene.data.set(PLAYER_XY_KEY, () => {
      if (!this.playerCtrl?.player?.active) return null;
      return { x: this.playerCtrl.x, y: this.playerCtrl.y };
    });
    scene.data.set(PLAYER_INTERACTION_LOS_KEY, (x: number, y: number) => this.playerCtrl.hasLineOfSight(x, y));
    scene.data.set('isPlayerMounted', () => this.playerCtrl.isMounted());
    scene.data.set('getPlayerSave', () => this.save);

    this.onPointerDownGround = (pointer, currentlyOver) => {
      if (!this.isGroundMovePointer(pointer, currentlyOver)) return;
      this.clickHoldActive = true;
      this.clearPlayerTarget();
      if (!this.playerCtrl?.player?.active) return;
      const world = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.playerCtrl.setClickMoveTarget(world.x, world.y);
    };
    this.onPointerMoveGround = (pointer) => {
      if (!this.clickHoldActive) return;
      if (!pointer.isDown || pointer.rightButtonDown()) return;
      if (systems.inputManager.isUiBlocked()) return;
      if (!this.playerCtrl?.player?.active) return;
      const world = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.playerCtrl.setClickMoveTarget(world.x, world.y, { fromHold: true });
    };
    this.onPointerUpGround = () => {
      this.clickHoldActive = false;
    };
    scene.input.on('pointerdown', this.onPointerDownGround);
    scene.input.on('pointermove', this.onPointerMoveGround);
    scene.input.on('pointerup', this.onPointerUpGround);
    scene.input.on('pointerupoutside', this.onPointerUpGround);

    this.bindPositionFlushHooks();

    this.enemyAi = new EnemyAIController(systems.entities, this.playerCtrl);
    this.combat = wireCombatSystem({
      scene,
      input: systems.inputManager,
      playerCtrl: this.playerCtrl,
      entities: systems.entities,
      network: systems.network,
      vfx: systems.vfx,
      remotePlayers: systems.remotePlayers,
      realtime: systems.realtime,
      location: this.location,
      getSave: () => this.save,
      setSave: (s) => {
        this.save = s;
      },
      setStats: (s) => {
        this.stats = s;
      },
      callbacks,
      onEncounterStale: () => this.bootstrapEncounter(),
      enemyAi: this.enemyAi,
    });

    this.realtimeRouter = new RealtimeRouter({
      getSave: () => this.save,
      setSave: (save) => {
        this.save = save;
      },
      getStats: () => this.stats,
      getLocationId: () => this.location.id,
      getCallbacks: () => scene.registry.get('callbacks') as GameRegistryCallbacks | undefined,
      remotePlayers: systems.remotePlayers,
      entities: systems.entities,
      network: systems.network,
      realtime: systems.realtime,
      pvp: systems.pvp,
      vfx: systems.vfx,
      getCombat: () => this.combat,
      getPlayerCtrl: () => this.playerCtrl,
      applyWorldTime: (snap, havenSchedule) => this.applyWorldTime(snap, havenSchedule),
    });

    systems.realtime.connect(this.save.id, this.location.id);

    systems.quests.create(scene, this.location);
    systems.entities.setupLocationContent(this.location, this.save);

    // Props/colliders first so NPC nudge can escape building footprints.
    addLocationDecorations(scene, this.location);
    systems.entities.spawnNpcs(this.location, systems.vfx, id => {
      if (systems.inputManager.isUiBlocked() || this.playerCtrl.fsm.isDead) return;
      this.clickHoldActive = false;
      this.clearPlayerTarget();
      if (this.combat?.isAutoAttackActive()) {
        this.combat.clearAutoAttack();
        const callbacks = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
        callbacks?.onAutoAttackToggle?.(false, 0);
      }
      this.playerCtrl.beginInteractionApproach(id, () => systems.entities.interactionNpc(id, {
        hour: this.dayNightOverlay.currentSnapshot()?.hour,
        absHours: getAbsoluteGameHours(),
        schedule: this.location.id === 'empery_haven' ? getHavenSchedule() : undefined,
      }));
    });
    if (this.location.id === 'empery_haven') {
      const sched = getHavenSchedule();
      if (sched) systems.entities.snapHavenSchedule(sched);
    }
    // Predicted movement already resolves the shared geometry; a second Arcade solver
    // would move only the rendered sprite and disagree with the physical pose.
    if (!this.playerCtrl.predictsMovement) {
      bindPlayerToPropColliders(scene, this.playerCtrl.getBody());
      const body = this.playerCtrl.getBody();
      const n = nudgePointFromPropColliders(scene, body.x, body.y, 16);
      if (n.x !== body.x || n.y !== body.y) this.playerCtrl.setPosition(n.x, n.y);
    }

    if (this.onTravelLocation) {
      systems.portals.setup(
        scene,
        this.playerCtrl.getBody(),
        this.location,
        systems.inputManager,
        this.playerCtrl,
        (locationId) => this.onTravelLocation!(locationId),
      );
    }
    systems.portals.setSpawnLock(scene.time.now);

    systems.minimap.init(scene, this.mapW, this.mapH, this.location);
    this.dayNightOverlay.bind(scene);
    this.dayNightLights.bind(scene, this.location);
    this.attachHavenHarborDebug();
    this.ensureHavenScheduleGuardUi();
    this.groundLoot.bind(scene);
    this.companionSprite.bind(scene);
    this.companionSprite.snapTo(this.playerCtrl.x, this.playerCtrl.y);
    this.companionSprite.setCompanion(this.save.companion);
    this.perf.bind(scene);
    this.soakTimer = this.perf.startSoakLog(60_000, () => this.countActiveEnemies()) ?? undefined;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    void this.bootstrapEncounter();
    void this.syncDayNight();
  }

  private async syncDayNight(): Promise<void> {
    const generation = this.sceneGeneration;
    try {
      const snap = await fetchSurvival(this.save.id);
      if (generation !== this.sceneGeneration) return;
      if (snap.environment.timeOfDay) {
        this.applyWorldTime(snap.environment.timeOfDay);
      }
    } catch {
      /* offline / survival disabled — WS world_time may still arrive */
    }
  }

  applyWorldTime(snapshot: DayNightSnapshot, havenSchedule?: HavenScheduleSnapshot): void {
    this.dayNightOverlay.setProfile(resolveDayNightProfile(this.location));
    if (this.pinnedHour != null) {
      const pinned = this.dayNightOverlay.forceHour(this.pinnedHour);
      if (pinned) applyWorldClock(pinned, havenSchedule);
      return;
    }
    this.dayNightOverlay.setWorldTime(snapshot);
    applyWorldClock(snapshot, havenSchedule);
    // Haven NPCs follow schedule in updateNpcActors — do not hard-snap every clock tick.
  }

  private attachHavenHarborDebug(): void {
    if (this.location.id !== 'empery_haven') return;
    const harbor = window as Window & { __EMPERY_HARBOR__?: Record<string, unknown> };
    harbor.__EMPERY_HARBOR__ = {
      ...harbor.__EMPERY_HARBOR__,
      setHour: (hour: number) => {
        this.pinnedHour = hour;
        const snap = this.dayNightOverlay.forceHour(hour);
        if (snap) applyWorldClock(snap);
        return snap
          ? {
              hour: snap.hour,
              absHours: getAbsoluteGameHours(),
              phase: snap.phaseName,
              darkness: snap.darkness,
            }
          : null;
      },
      advanceHours: (delta: number) => {
        const next = getAbsoluteGameHours() + delta;
        this.pinnedHour = next;
        const snap = this.dayNightOverlay.forceHour(next);
        if (snap) applyWorldClock(snap);
        return snap
          ? { hour: snap.hour, absHours: getAbsoluteGameHours(), phase: snap.phaseName }
          : null;
      },
      setZoom: (zoom: number) => {
        const cam = this.scene.cameras.main;
        const z = Math.max(0.55, Math.min(4, zoom));
        cam.setZoom(z);
        cam.setDeadzone(z > 1.5 ? 6 : 36, z > 1.5 ? 6 : 36);
        return cam.zoom;
      },
      player: () => ({
        x: Math.round(this.playerCtrl.x),
        y: Math.round(this.playerCtrl.y),
      }),
      setPos: (x: number, y: number) => {
        this.playerCtrl.setPosition(x, y);
        this.scene.cameras.main?.centerOn(x, y);
        return { x: Math.round(this.playerCtrl.x), y: Math.round(this.playerCtrl.y) };
      },
      voyage: (hullId: string) => {
        const absHours = getAbsoluteGameHours();
        return {
          absHours,
          ...havenShipTimetable(hullId),
          ...resolveHavenShipVoyage(hullId, absHours),
        };
      },
      pinVoyage: (hullId: string, state: HavenShipVoyageState) => {
        const tt = havenShipTimetable(hullId);
        const transit = Math.min(0.35, tt.dockHours * 0.25, tt.awayHours * 0.12);
        let abs = tt.offsetHours;
        if (state === 'in_port') abs = tt.offsetHours + Math.max(0.05, (tt.dockHours - transit) * 0.4);
        else if (state === 'departing') abs = tt.offsetHours + tt.dockHours - transit * 0.45;
        else if (state === 'at_sea') abs = tt.offsetHours + tt.dockHours + tt.awayHours * 0.45;
        else abs = tt.offsetHours + tt.periodHours - transit * 0.45;
        this.pinnedHour = abs;
        const snap = this.dayNightOverlay.forceHour(abs);
        if (snap) applyWorldClock(snap);
        return {
          hullId,
          state,
          absHours: getAbsoluteGameHours(),
          voyage: resolveHavenShipVoyage(hullId, getAbsoluteGameHours()),
        };
      },
    };
  }

  private readonly performance=new ClientPerformance();
  private readonly movementConnection = new MovementConnectionStatus();
  update(): void {
    if(this.systems)this.performance.frame(this.scene.time.now,this.scene.game.loop.delta,this.systems.realtime);
    const { scene, systems } = this;
    if (!scene.sys.isActive()) return;
    if (!this.playerCtrl?.player?.active) return;
    if (!systems.entities.isReady()) return;

    systems.inputManager.beginFrame();

    if (systems.inputManager.consumeTravel()) {
      systems.portals.tryConfirm();
    }

    const talkRequested = systems.inputManager.consumeTalk();
    if (talkRequested && !this.playerCtrl.isDead) {
        const hour = this.dayNightOverlay.currentSnapshot()?.hour;
        const npcId = systems.entities.findTalkNpc(this.playerCtrl.x, this.playerCtrl.y, 80, {
          hour,
          absHours: getAbsoluteGameHours(),
          lineOfSight: (x, y) => this.playerCtrl.hasLineOfSight(x, y),
          schedule: this.location.id === 'empery_haven' ? getHavenSchedule() : undefined,
        });
        if (npcId) {
          const callbacks = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
          callbacks?.onTalkNpc?.(npcId);
        } else {
          const findCitizen = scene.registry.get('findNearbyTalkCitizen') as
            | ((px: number, py: number, range?: number) => { npcId: string; label: string; slotIndex: number } | null)
            | undefined;
          const cit = findCitizen?.(this.playerCtrl.x, this.playerCtrl.y, 72);
          if (cit) {
            const callbacks = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
            callbacks?.onTalkNpc?.(cit.npcId);
          } else {
            const loot = this.groundLoot.findNearest(this.playerCtrl.x, this.playerCtrl.y, undefined, (x, y) => this.playerCtrl.hasLineOfSight(x, y));
            if (loot) {
              void this.tryPickupLoot(loot.id);
            } else {
              const gull = this.findNearbySeagull(this.playerCtrl.x, this.playerCtrl.y);
              if (gull) {
                void this.tryOfferBread(gull.id);
              } else {
                const station = systems.entities.findUseStation(this.playerCtrl.x, this.playerCtrl.y, undefined, (x, y) => this.playerCtrl.hasLineOfSight(x, y));
                if (station) {
                  const callbacks = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
                  callbacks?.onUseStation?.(station.kinds);
                } else {
                  const kiosk = systems.entities.findCityMapKiosk(
                    this.playerCtrl.x,
                    this.playerCtrl.y,
                    undefined, (x, y) => this.playerCtrl.hasLineOfSight(x, y),
                  );
                  if (kiosk) {
                    const callbacks = scene.registry.get('callbacks') as
                      | GameRegistryCallbacks
                      | undefined;
                    callbacks?.onTalkNpc?.('town_notice_board');
                  }
                }
              }
            }
          }
        }
    }

    if (systems.inputManager.consumeAutoAttackToggle()) {
      const on = this.combat.toggleAutoAttack();
      const callbacks = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
      callbacks?.onAutoAttackToggle?.(on, this.combat.getAutoAttackRemainingMs());
    }

    this.movementConnection.update(systems.realtime.movementState(), scene.time.now);
    this.playerCtrl.setMovementAllowance(systems.realtime.movementCapacity());
    this.playerCtrl.update(this.stats);
    const reachedNpc = this.playerCtrl.takeReachedInteraction();
    if (reachedNpc && !systems.inputManager.isUiBlocked() && !this.playerCtrl.fsm.isDead) {
      const callbacks = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
      callbacks?.onTalkNpc?.(reachedNpc);
    }
    syncRealtimePlayerInput({
      now: scene.time.now,
      playerCtrl: this.playerCtrl,
      realtime: systems.realtime,
      state: this.realtimeInput,
    });
    systems.remotePlayers.update(scene.game.loop.delta);

    systems.portals.update();
    // Combat drains one-shot intents even while UI blocks dispatch.
    this.combat.update(this.save, this.stats, this.location);
    if (!systems.inputManager.isUiBlocked()) {
      this.enemyAi.update();
    } else {
      this.playerCtrl.clearClickMove();
      this.playerCtrl.setVelocity(0, 0);
    }

    const callbacks = scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
    syncStaminaHud({
      now: scene.time.now,
      playerCtrl: this.playerCtrl,
      callbacks,
      state: this.staminaHud,
    });

    this.companionSprite.update(
      this.playerCtrl.x,
      this.playerCtrl.y,
      scene.game.loop.delta,
    );
    this.dayNightOverlay.update();
    const snap = this.dayNightOverlay.currentSnapshot();
    const havenSched = this.location.id === 'empery_haven' ? getHavenSchedule() : null;
    this.updateHavenScheduleGuard(havenSched);
    scene.registry.set('havenSchedule', havenSched);
    scene.registry.set('dayNightSnapshot', snap);
    if (snap) {
      const movingLights = this.movingLightBuffer;
      movingLights.length = 0;
      const gfx = getGraphicsProfile();
      if (havenSched && snap.darkness >= 0.18 && gfx.nightLights) {
        const getGuards = this.location.id === 'empery_haven'
          ? scene.data.get('getNightGuardLights') as (() => ReadonlyArray<{ x: number; y: number }>) | undefined
          : undefined;
        movingLights.push(...selectNightLanterns(
          havenSched.npcs,
          id => systems.entities.visibleNpcPosition(id),
          getGuards?.() ?? [],
          scene.cameras.main.worldView,
          gfx.movingLights ? 14 : 4,
        ));
      }
      this.dayNightLights.update(snap, scene.game.loop.delta, movingLights);

      if (this.location.id === 'empery_haven') {
        const isNight = snap.hour >= 21 || snap.hour < 7;
        const currentPhase = isNight ? 'night' : 'day';
        if (this.lastAnnouncedPhase && this.lastAnnouncedPhase !== currentPhase) {
          if (currentPhase === 'night') {
            appendChatSystem(
              '🔔 Бьёт вечерний колокол Собора: лавки закрыты. На форуме зажигают ночной ряд, у Марты — очаг, у Серы — дежурство, у Кассия — всенощная.',
            );
          } else {
            appendChatSystem(
              '☀️ Занимается рассвет над Гаванью: жители выходят на улицы и открывают лавки.',
            );
          }
        }
        this.lastAnnouncedPhase = currentPhase;
      }
    }
    const clockNow = scene.time.now;
    if (clockNow - this.dayNightClockAt >= 1000) {
      this.dayNightClockAt = clockNow;
      const clock = this.dayNightOverlay.currentClock();
      const el = document.getElementById('hud-time');
      if (el) el.textContent = clock ?? '';
    }
    this.groundLoot.updateHint(this.playerCtrl.x, this.playerCtrl.y, (x, y) => this.playerCtrl.hasLineOfSight(x, y));
    this.updateSeagullHint();

    // NPC schedule follow every frame (throttled update lagged ribbon → 420px snaps).
    // Shadows / proximity labels stay cheap under UI.
    const uiBlocked = systems.inputManager.isUiBlocked();
    systems.entities.updateNpcs(scene.game.loop.delta, {
      schedule: havenSched,
      absHours: getAbsoluteGameHours(),
    });
    const frameMask = uiBlocked ? 15 : 3;
    if ((scene.game.loop.frame & frameMask) === 0) {
      const hour = snap?.hour;
      systems.entities.syncNpcShadows();
      systems.entities.syncNpcProximityUi(this.playerCtrl.x, this.playerCtrl.y, 96, {
        hour,
        absHours: getAbsoluteGameHours(),
        schedule: havenSched,
        lineOfSight: (x, y) => this.playerCtrl.hasLineOfSight(x, y),
      });
    }
    systems.entities.followNearNpcUi(scene.time.now);
    if (!uiBlocked || (scene.game.loop.frame & 7) === 0) {
      const partyIds = scene.registry.get('partySaveIds') as ReadonlySet<string> | undefined;
      const assistId = scene.registry.get('partyAssistSaveId') as string | null | undefined;
      systems.minimap.update(
        this.playerCtrl.x,
        this.playerCtrl.y,
        systems.entities,
        systems.remotePlayers,
        partyIds,
        assistId ?? null,
      );
    }
    if (!uiBlocked) {
      this.perf.tickSample(() => this.countActiveEnemies());
    }
  }

  shutdown(): void {
    this.movementConnection?.destroy();
    this.sceneGeneration += 1;
    const { scene, systems } = this;
    this.unbindPositionFlushHooks();
    // Travel already wrote arrival coords + new location into registry/disk.
    // Flushing apartment (or old map) pose here would overwrite them and
    // drop the player near market coords (~640,780) on Haven.
    const bootSave = scene.registry.get('bootSave') as PlayerSave | undefined;
    const travelPending = Boolean(bootSave && bootSave.location !== this.location.id);
    if (!travelPending) {
      this.flushWorldPosition();
    }
    try {
      scene.registry.remove('havenSchedule');
      scene.registry.remove('dayNightSnapshot');
    } catch {
      /* ignore */
    }
    try {
      this.soakTimer?.remove(false);
    } catch {
      /* ignore */
    }
    this.soakTimer = undefined;
    try {
      if (this.onPointerDownGround) {
        scene.input.off('pointerdown', this.onPointerDownGround);
        this.onPointerDownGround = undefined;
      }
      if (this.onPointerMoveGround) {
        scene.input.off('pointermove', this.onPointerMoveGround);
        this.onPointerMoveGround = undefined;
      }
      if (this.onPointerUpGround) {
        scene.input.off('pointerup', this.onPointerUpGround);
        scene.input.off('pointerupoutside', this.onPointerUpGround);
        this.onPointerUpGround = undefined;
      }
      this.clickHoldActive = false;
    } catch {
      /* ignore */
    }
    try {
      this.perf.unbind();
    } catch {
      /* ignore */
    }
    try {
      clearPropColliders(scene);
    } catch {
      /* ignore */
    }
    try {
      systems.portals.shutdown();
    } catch {
      /* ignore */
    }
    try {
      systems.minimap.shutdown();
    } catch {
      /* ignore */
    }
    try {
      this.groundLoot.shutdown();
      this.companionSprite.shutdown();
      this.dayNightOverlay.shutdown();
      this.dayNightLights.shutdown();
      this.destroyHavenScheduleGuardUi();
      this.seagullHint?.destroy();
      this.seagullHint = undefined;
    } catch {
      /* ignore */
    }
    try {
      this.combat?.shutdown();
    } catch {
      /* ignore */
    }
    try {
      systems.network.abort();
    } catch {
      /* ignore */
    }
    try {
      systems.realtime.disconnect();
    } catch {
      /* ignore */
    }
    try {
      systems.inputManager.shutdown();
    } catch {
      /* ignore */
    }
    try {
      systems.vfx.shutdown();
    } catch {
      /* ignore */
    }
    try {
      systems.entities.shutdown();
    } catch {
      /* ignore */
    }
    try {
      systems.remotePlayers.shutdown();
    } catch {
      /* ignore */
    }
  }

  private async bootstrapEncounter(opts?: { notifyOnError?: boolean }): Promise<void> {
    const { systems } = this;
    const ok = await runEncounterBootstrap(
      {
        location: this.location,
        save: this.save,
        sceneGeneration: this.sceneGeneration,
        network: systems.network,
        entities: systems.entities,
        quests: systems.quests,
      },
      () => this.sceneGeneration,
    );
    if (!ok && opts?.notifyOnError) {
      const callbacks = this.scene?.registry.get('callbacks') as GameRegistryCallbacks | undefined;
      callbacks?.onCombatFeedback?.('Не удалось восстановить бой');
    }
  }

  private isGroundMovePointer(
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[],
  ): boolean {
    if (pointer.rightButtonDown() || pointer.button === 2) return false;
    if (currentlyOver.length > 0) return false;
    if (this.systems.inputManager.isUiBlocked()) return false;
    // Не ставить точку хода на интерактивные объекты (remote select и т.п.).
    for (const obj of currentlyOver) {
      if (obj.input && obj.input.enabled) return false;
    }
    const evt = pointer.event as PointerEvent | undefined;
    const target = evt?.target;
    const canvas = this.scene.game.canvas;
    if (target && target !== canvas && target instanceof Node && !canvas.contains(target)) {
      return false;
    }
    return true;
  }

  private countActiveEnemies(): number {
    let count = 0;
    this.systems.entities.forEachActive(() => {
      count += 1;
    });
    return count;
  }

  private ensureHavenScheduleGuardUi(): void {
    if (this.location.id !== 'empery_haven') return;
    if (this.havenScheduleWaitingLabel?.active) return;
    const scene = this.scene;
    this.havenScheduleWaitingLabel = scene.add
      .text(12, 12, 'Ожидание server schedule...', {
        color: '#ffe5a0',
        fontSize: '12px',
        fontStyle: 'bold',
        backgroundColor: '#2a1a12d8',
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(20000)
      .setVisible(false);
    scene.scale.on('resize', this.layoutHavenScheduleGuardUi, this);
    this.layoutHavenScheduleGuardUi();
  }

  private layoutHavenScheduleGuardUi(): void {
    const label = this.havenScheduleWaitingLabel;
    if (!label?.active) return;
    label.setPosition(12, 12);
  }

  private destroyHavenScheduleGuardUi(): void {
    const scene = this.scene;
    scene.scale.off('resize', this.layoutHavenScheduleGuardUi, this);
    this.havenScheduleWaitingLabel?.destroy();
    this.havenScheduleWaitingLabel = undefined;
    this.havenScheduleMissingSinceMs = null;
    this.havenScheduleWarningShown = false;
  }

  private updateHavenScheduleGuard(schedule: HavenScheduleSnapshot | null): void {
    if (this.location.id !== 'empery_haven') return;
    const now = this.scene.time.now;
    const label = this.havenScheduleWaitingLabel;
    if (schedule) {
      this.havenScheduleMissingSinceMs = null;
      this.havenScheduleWarningShown = false;
      if (label?.visible) label.setVisible(false);
      return;
    }
    if (this.havenScheduleMissingSinceMs == null) {
      this.havenScheduleMissingSinceMs = now;
    }
    const missingFor = now - this.havenScheduleMissingSinceMs;
    if (label && missingFor >= 1500) label.setVisible(true);
    if (!this.havenScheduleWarningShown && missingFor >= 5000) {
      this.havenScheduleWarningShown = true;
      appendChatSystem('Серверное расписание Haven еще не пришло. Интеракции NPC временно ограничены.');
      const callbacks = this.scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
      callbacks?.onCombatFeedback?.('Ожидание server schedule Haven...');
    }
  }

  setActiveSkillIds(ids: (string | null)[]): void {
    this.combat?.setActiveSkillIds(ids);
  }

  setSkillDefinitions(skills: SkillDefinition[]): void {
    this.combat?.setSkillDefinitions(skills);
  }

  clearAllyHudBuffs(): void {
    this.combat?.clearAllyHudBuffs();
  }

  toggleAutoAttack(): boolean {
    if (!this.combat) return false;
    return this.combat.toggleAutoAttack();
  }

  isAutoAttackActive(): boolean {
    return this.combat?.isAutoAttackActive() ?? false;
  }

  getAutoAttackRemainingMs(): number {
    return this.combat?.getAutoAttackRemainingMs() ?? 0;
  }

  respawnPlayer(save: PlayerSave, stats: PlayerStats): void {
    this.save = save;
    this.stats = stats;
    this.playerCtrl.respawn(save, this.location, this.stats);
  }

  private bindPositionFlushHooks(): void {
    this.unbindPositionFlushHooks();
    this.boundPageHide = () => this.flushWorldPosition();
    this.boundVisibility = () => {
      if (document.visibilityState === 'hidden') this.flushWorldPosition();
    };
    window.addEventListener('pagehide', this.boundPageHide);
    window.addEventListener('beforeunload', this.boundPageHide);
    document.addEventListener('visibilitychange', this.boundVisibility);
  }

  private unbindPositionFlushHooks(): void {
    if (this.boundPageHide) {
      window.removeEventListener('pagehide', this.boundPageHide);
      window.removeEventListener('beforeunload', this.boundPageHide);
      this.boundPageHide = undefined;
    }
    if (this.boundVisibility) {
      document.removeEventListener('visibilitychange', this.boundVisibility);
      this.boundVisibility = undefined;
    }
  }

  /** WS persist + HTTP keepalive — переживает закрытие вкладки. */
  private flushWorldPosition(): void {
    if (!this.playerCtrl?.player?.active) return;
    const pos = flushRealtimePlayerPosition({
      playerCtrl: this.playerCtrl,
      realtime: this.systems.realtime,
      state: this.realtimeInput,
    });
    if (!pos) return;
    flushSavePosition(this.save.id, pos.x, pos.y, this.location.id);
  }

  handleBootstrap(bootstrap: MultiplayerBootstrap): void {
    if (bootstrap.worldTime) {
      this.applyWorldTime(bootstrap.worldTime, bootstrap.havenSchedule);
    }
    this.realtimeRouter?.handleBootstrap(bootstrap);
    this.groundLoot.syncFromSnapshot(bootstrap.snapshot.groundLoot);
  }

  applyGroundLootSpawned(pile: import('@empery/shared').GroundLootPile): void {
    this.groundLoot.upsert(pile);
  }

  applyGroundLootRemoved(payload: import('@empery/shared').GroundLootRemovedPayload): void {
    if (this.companionSprite.getFetchingLootId() === payload.id) {
      this.companionSprite.abortFetchToReturn(this.playerCtrl.x, this.playerCtrl.y);
    }
    this.groundLoot.remove(payload.id);
  }

  applyCompanionFetchStarted(payload: import('@empery/shared').CompanionFetchStartedPayload): void {
    if (payload.saveId !== this.save.id || !this.save.companion) return;
    this.groundLoot.markCompanionFetching(payload.lootId);
    this.companionSprite.fetchLoot(
      payload.lootId,
      payload.lootX,
      payload.lootY,
      payload.arriveAt,
      payload.fromX,
      payload.fromY,
    );
  }

  applyGroundLootSnapshot(piles: import('@empery/shared').GroundLootPile[] | undefined): void {
    this.groundLoot.syncFromSnapshot(piles);
  }

  private findNearbySeagull(
    x: number,
    y: number,
  ): { id: string; x: number; y: number } | null {
    const list = this.location.seagulls ?? [];
    let best: { id: string; x: number; y: number } | null = null;
    let bestD = COMPANION_SEAGULL_OFFER_RADIUS;
    for (const g of list) {
      const d = Math.hypot(g.x - x, g.y - y);
      if (d <= bestD && this.playerCtrl.hasLineOfSight(g.x, g.y)) {
        best = g;
        bestD = d;
      }
    }
    return best;
  }

  private hasBreadLoaf(): boolean {
    return (this.save.inventory ?? []).includes('bread_loaf');
  }

  private updateSeagullHint(): void {
    const scene = this.scene;
    if (!scene) return;
    if (this.groundLoot.findNearest(this.playerCtrl.x, this.playerCtrl.y, undefined, (x, y) => this.playerCtrl.hasLineOfSight(x, y))) {
      this.seagullHint?.setVisible(false);
      return;
    }
    if (this.save.companion || !this.hasBreadLoaf()) {
      this.seagullHint?.setVisible(false);
      return;
    }
    const gull = this.findNearbySeagull(this.playerCtrl.x, this.playerCtrl.y);
    if (!gull) {
      this.seagullHint?.setVisible(false);
      return;
    }
    if (!this.seagullHint) {
      this.seagullHint = scene.add
        .text(0, 0, 'Чайка [E]', {
          fontFamily: 'Georgia, serif',
          fontSize: '12px',
          color: '#e8f4ff',
          stroke: '#1a1208',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(Depth.EntityHud);
    }
    this.seagullHint.setVisible(true);
    this.seagullHint.setPosition(gull.x, gull.y - 48);
  }

  private async tryPickupLoot(lootId: string): Promise<void> {
    if (this.pickupBusy) return;
    this.pickupBusy = true;
    const generation = this.sceneGeneration;
    const callbacks = this.scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
    try {
      const result = await pickupLoot(this.save.id, lootId);
      if (generation !== this.sceneGeneration) return;
      this.updateSave(result.save, result.stats);
      callbacks?.onSaveUpdate?.(result.save, result.stats);
      if (result.summary) callbacks?.onCombatFeedback?.(`Подобрано: ${result.summary}`);
      this.groundLoot.remove(lootId);
    } catch (err) {
      if (generation !== this.sceneGeneration) return;
      callbacks?.onCombatFeedback?.(err instanceof Error ? err.message : 'Не удалось подобрать');
    } finally {
      if (generation === this.sceneGeneration) this.pickupBusy = false;
    }
  }

  private async tryOfferBread(seagullId: string): Promise<void> {
    const generation = this.sceneGeneration;
    const callbacks = this.scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
    if (!this.hasBreadLoaf()) {
      callbacks?.onCombatFeedback?.('Нужен хлеб');
      return;
    }
    try {
      const result = await offerBreadToSeagull(this.save.id, {
        seagullId,
        x: this.playerCtrl.x,
        y: this.playerCtrl.y,
      });
      if (generation !== this.sceneGeneration) return;
      this.updateSave(result.save, result.stats);
      callbacks?.onSaveUpdate?.(result.save, result.stats);
      callbacks?.onCombatFeedback?.(result.message);
      if (result.tamed) this.companionSprite.setCompanion(result.save.companion);
    } catch (err) {
      if (generation !== this.sceneGeneration) return;
      callbacks?.onCombatFeedback?.(err instanceof Error ? err.message : 'Не вышло');
    }
  }

  nearestDeadPlayer(range: number): { saveId: string; name: string; dist: number } | null {
    const hit = this.systems.remotePlayers.nearestDeadInRange(
      this.playerCtrl.x,
      this.playerCtrl.y,
      range,
      (x, y) => this.playerCtrl.hasLineOfSight(x, y),
    );
    if (!hit) return null;
    return { saveId: hit.presence.saveId, name: hit.presence.name, dist: hit.dist };
  }

  updateSave(save: PlayerSave, stats: PlayerStats, opts?: { combatTick?: boolean }): void {
    const prev = this.save;
    this.save = save;
    this.stats = stats;
    const { systems } = this;
    this.companionSprite.setCompanion(save.companion);
    systems.entities.setPlayerLevel(save.level);

    if (opts?.combatTick) {
      systems.quests.refreshFromSave(this.location, save);
      return;
    }

    this.playerCtrl.refreshCloak(save);
    this.playerCtrl.refreshShield(save);
    this.playerCtrl.refreshWeapon(save, stats);
    this.playerCtrl.refreshMount(save, stats);
    systems.entities.onQuestActivated(this.location, prev, save, (t) => systems.quests.show(t));
    systems.quests.refreshFromSave(this.location, save);

    if (questFlagsChanged(prev.questFlags, save.questFlags)) {
      const netGen = systems.network.getGeneration();
      void systems.network.syncQuests().then((entities) => {
        if (netGen !== systems.network.getGeneration()) return;
        if (entities.length) systems.entities.spawnFromEncounter(entities);
      });
    }

    if (prev.location !== save.location) {
      systems.realtime.setLocation(save.location);
      systems.realtime.send({ type: 'join_location', locationId: save.location });
    }
  }

  getLocationId(): string {
    return this.location?.id ?? '';
  }

  sendChat(
    channel: 'location' | 'global' | 'private' | 'party',
    text: string,
    toName?: string,
  ): void {
    this.realtimeRouter?.sendChat(channel, text, toName);
  }

  sendPartyInvite(toName: string): void {
    this.realtimeRouter?.sendPartyInvite(toName);
  }

  sendPartyAccept(partyId: string): void {
    this.realtimeRouter?.sendPartyAccept(partyId);
  }

  sendPartyDecline(partyId: string): void {
    this.realtimeRouter?.sendPartyDecline(partyId);
  }

  sendPartyLeave(): void {
    this.realtimeRouter?.sendPartyLeave();
  }

  sendPartyKick(saveId: string): void {
    this.realtimeRouter?.sendPartyKick(saveId);
  }

  sendPartyDisband(): void {
    this.realtimeRouter?.sendPartyDisband();
  }

  sendPartyPromote(saveId: string): void {
    this.realtimeRouter?.sendPartyPromote(saveId);
  }

  sendPartyAssist(targetSaveId: string | null): void {
    this.realtimeRouter?.sendPartyAssist(targetSaveId);
  }

  setPlayerTarget(saveId: string | null, nameHint?: string): void {
    if (!saveId || saveId === this.save.id) {
      this.clearPlayerTarget();
      return;
    }
    this.systems.remotePlayers.setSelected(saveId);
    const presence = this.systems.remotePlayers.getPresence(saveId);
    const name = presence?.name ?? nameHint ?? 'Игрок';
    const callbacks = this.scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
    callbacks?.onPlayerTarget?.({ saveId, name });
  }

  clearPlayerTarget(): void {
    this.systems.remotePlayers.setSelected(null);
    const callbacks = this.scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
    callbacks?.onPlayerTarget?.(null);
  }

  getPlayerTargetSaveId(): string | null {
    return this.systems.remotePlayers.getSelected();
  }

  getPlayerWorldPos(): { x: number; y: number } | null {
    if (!this.playerCtrl?.player?.active) return null;
    return { x: this.playerCtrl.x, y: this.playerCtrl.y };
  }

  peekAtPlayer(saveId: string): boolean {
    const sprite = this.systems.remotePlayers.getSprite(saveId);
    if (!sprite || !this.playerCtrl?.player) return false;
    const cam = this.scene.cameras.main;
    cam.stopFollow();
    cam.pan(sprite.x, sprite.y, 380, 'Sine.easeInOut');
    this.scene.time.delayedCall(1100, () => {
      if (!this.playerCtrl?.player?.active) return;
      cam.pan(this.playerCtrl.x, this.playerCtrl.y, 420, 'Sine.easeInOut');
      this.scene.time.delayedCall(430, () => {
        if (!this.playerCtrl?.player?.active) return;
        cam.startFollow(this.playerCtrl.player, true, 0.12, 0.12);
      });
    });
    return true;
  }
}
