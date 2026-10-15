import Phaser from 'phaser';
import { mobDifficulty } from '@empery/shared/level-diff';
import {
  resolveNpcSleepHome,
  havenScheduleEntryById,
  havenShipSkipperPresent,
  isHavenShipSkipperNpc,
  type HavenScheduleSnapshot,
} from '@empery/shared';
import type { MultiplayerEnemyPresence, PlayerSave } from '../../api.js';
import { EnemyEntity } from '../entities/EnemyEntity.js';
import type {
  EncounterEntitySpawn,
  LocationConfig,
} from '../scenes/location-types.js';
import { resolveEnemySprite, resolveNpcSprite, setupSpriteDisplay } from '../../sprites/sprite-loader.js';
import { attachEntityShadow, entityDepth, syncEntityShadows } from '../../sprites/visual-polish.js';
import { nudgePointFromPropColliders } from '../../sprites/prop-colliders.js';
import { atmosphereFor } from '../../sprites/vfx.js';
import type { VfxSystem } from './VfxSystem.js';
import {
  stationPanelTitle,
  type SurvivalStationKind,
} from '../../station-ui.js';
import { npcIsProp, npcWorldDef } from '../../sprites/npc-catalog.js';
import {
  clearNpcStreetCache,
  createNpcActor,
  destroyNpcActor,
  npcActorInteractable,
  snapNpcActorsToSchedule,
  updateNpcActors,
  type NpcActorState,
} from './NpcRuntime.js';
import type { GroundLayer } from './ground-layer.js';
import { npcIdleAnimKey } from '../../sprites/sprite-factory.js';
import { npcPromptLayout } from '../utils/npc-prompt-ui.js';
import { applyLight2DPipeline } from '../../sprites/light2d-pipeline.js';
import { npcAvailableForInteraction } from './npc-availability.js';
import { HAVEN_CITY_PROPS } from '../../sprites/haven-city-data.js';
import {
  cityMapKioskPromptAllowed,
  collectCityMapKiosks,
  type CityMapKiosk,
} from './city-map-kiosks.js';

function hasFlag(save: PlayerSave, flag: string): boolean {
  return Boolean(save.questFlags[flag]);
}

const STATION_KINDS = new Set<string>(['campfire', 'hearth', 'water', 'pot']);

export interface StationInteractPoint {
  kinds: SurvivalStationKind[];
  x: number;
  y: number;
  label: string;
}

function mergeStations(
  raw: NonNullable<LocationConfig['stations']>,
): StationInteractPoint[] {
  const clusters: StationInteractPoint[] = [];
  for (const s of raw) {
    if (!STATION_KINDS.has(s.kind)) continue;
    const kind = s.kind as SurvivalStationKind;
    const hit = clusters.find((c) => Math.hypot(c.x - s.x, c.y - s.y) <= 48);
    if (hit) {
      if (!hit.kinds.includes(kind)) hit.kinds.push(kind);
      hit.label = `${stationPanelTitle(hit.kinds)} [E]`;
      continue;
    }
    const kinds = [kind];
    clusters.push({
      kinds,
      x: s.x,
      y: s.y,
      label: `${stationPanelTitle(kinds)} [E]`,
    });
  }
  return clusters;
}

export class EntityManager {
  private scene: Phaser.Scene | null = null;
  private group: Phaser.Physics.Arcade.Group | null = null;
  private byId = new Map<string, EnemyEntity>();
  /** Все когда-либо выданные из пула (для teardown HUD вне byId). */
  private spawned = new Set<EnemyEntity>();
  private playerLevel = 1;
  npcSpriteRefs: Phaser.GameObjects.Sprite[] = [];
  private npcMeta: Array<{ id: string; sprite: Phaser.GameObjects.Sprite; label: string }> = [];
  private npcDecor: Phaser.GameObjects.GameObject[] = [];
  private npcLabels: Phaser.GameObjects.Text[] = [];
  private npcMarkers: Phaser.GameObjects.Text[] = [];
  private stationPoints: StationInteractPoint[] = [];
  private stationAnchors: Array<{ x: number; y: number }> = [];
  private stationLabels: Phaser.GameObjects.Text[] = [];
  private stationMarkers: Phaser.GameObjects.Text[] = [];
  private cityMapPoints: CityMapKiosk[] = [];
  private cityMapLabels: Phaser.GameObjects.Text[] = [];
  private cityMapMarkers: Phaser.GameObjects.Text[] = [];
  private npcActors: NpcActorState[] = [];
  private npcActorById = new Map<string, NpcActorState>();
  private nearNpcUi: number[] = [];
  private nearStationUi: number[] = [];
  private nearCityMapUi: number[] = [];
  private locationId = '';
  private questSpawned = new Set<string>();
  private nearbyCache = { at: 0, count: 0 };
  private rangeBuffer: EnemyEntity[] = [];

  isReady(): boolean {
    return Boolean(this.scene && this.group?.children);
  }

  init(scene: Phaser.Scene, _groundLayer: GroundLayer | null): void {
    this.scene = scene;
    // adena_fields farm maxAlive=60 + quest/encounter buffer
    this.group = scene.physics.add.group({
      classType: EnemyEntity,
      maxSize: 72,
      runChildUpdate: false,
    });
    // Server owns enemy positions; tile collision would fight interpolation.
    this.byId.clear();
    this.spawned.clear();
    this.questSpawned.clear();
    this.npcSpriteRefs = [];
    this.npcMeta = [];
    this.nearbyCache = { at: 0, count: 0 };
  }

  getGroup(): Phaser.Physics.Arcade.Group {
    if (!this.group) throw new Error('EntityManager not initialized');
    return this.group;
  }

  setPlayerLevel(level: number): void {
    this.playerLevel = level;
  }

  getByEntityId(id: string): EnemyEntity | undefined {
    return this.byId.get(id);
  }

  forEachActive(fn: (e: EnemyEntity) => void): void {
    const children = this.group?.getChildren();
    if (!children) return;
    for (const child of children) {
      const e = child as EnemyEntity;
      if (e.active && !e.isDying) fn(e);
    }
  }

  /** Reused buffer — valid until next collectInRange / findNearestInRange call. */
  collectInRange(x: number, y: number, range: number, visible?: (x: number, y: number) => boolean): readonly EnemyEntity[] {
    this.rangeBuffer.length = 0;
    const rangeSq = range * range;
    this.forEachActive((e) => {
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= rangeSq && (!visible || visible(e.x, e.y))) this.rangeBuffer.push(e);
    });
    return this.rangeBuffer;
  }

  findNearestInRange(
    x: number,
    y: number,
    range: number,
    visible?: (x: number, y: number) => boolean,
  ): { entity: EnemyEntity; distSq: number } | null {
    const rangeSq = range * range;
    let nearest: { entity: EnemyEntity; distSq: number } | null = null;
    this.forEachActive((e) => {
      const dx = e.x - x;
      const dy = e.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq || (visible && !visible(e.x, e.y))) return;
      if (!nearest || distSq < nearest.distSq) nearest = { entity: e, distSq };
    });
    return nearest;
  }

  /** Быстрая проверка «есть ли хоть один враг в радиусе» без аллокации массива. */
  hasEnemyInRange(x: number, y: number, range: number, visible?: (x: number, y: number) => boolean): boolean {
    const rangeSq = range * range;
    const children = this.group?.getChildren();
    if (!children) return false;
    for (const child of children) {
      const e = child as EnemyEntity;
      if (!e.active || e.isDying) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= rangeSq && (!visible || visible(e.x, e.y))) return true;
    }
    return false;
  }

  countNearby(x: number, y: number, radius = 240): number {
    if (!this.scene || !this.isReady()) return 0;
    const now = this.scene.time.now;
    if (now - this.nearbyCache.at < 200) return this.nearbyCache.count;
    const radiusSq = radius * radius;
    let count = 0;
    this.forEachActive((e) => {
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= radiusSq) count += 1;
    });
    this.nearbyCache = { at: now, count };
    return count;
  }

  spawnFromEncounter(spawns: EncounterEntitySpawn[]): void {
    for (const spawn of spawns) {
      this.spawnOne(spawn);
    }
  }

  /** Apply server enemy snapshot: upsert pose/HP, return ids that went missing (deaths). */
  applyEnemySnapshot(enemies: MultiplayerEnemyPresence[]): string[] {
    const seen = new Set<string>();
    for (const dto of enemies) {
      if (!dto.alive) continue;
      seen.add(dto.entityId);
      const existing = this.byId.get(dto.entityId);
      if (existing && existing.active && !existing.isDying) {
        existing.applyServerState({
          x: dto.x,
          y: dto.y,
          hp: dto.hp,
          moving: dto.moving,
          facing: dto.facing,
          speed: dto.speed,
          control: dto.control,
        });
        continue;
      }
      this.spawnOne({
        entityId: dto.entityId,
        type: dto.type,
        level: dto.level,
        hp: dto.hp,
        maxHp: dto.maxHp,
        speed: dto.speed,
        x: dto.x,
        y: dto.y,
        quest: dto.quest,
        control: dto.control,
      });
    }

    const missing: string[] = [];
    this.forEachActive((e) => {
      if (!seen.has(e.entityId)) missing.push(e.entityId);
    });
    return missing;
  }

  private spawnOne(spawn: EncounterEntitySpawn): EnemyEntity | null {
    if (!this.group) return null;
    const existing = this.byId.get(spawn.entityId);
    if (existing && existing.active && !existing.isDying) {
      existing.applyServerState({
        x: spawn.x,
        y: spawn.y,
        hp: spawn.hp,
        moving: false,
        facing: 'right',
        speed: spawn.speed,
        control: spawn.control,
      });
      return existing;
    }
    if (!this.scene) return null;
    const { textureKey, frame } = resolveEnemySprite(this.scene, spawn.type);
    const enemy = this.group.get(spawn.x, spawn.y, textureKey, frame) as EnemyEntity | null;
    if (!enemy) {
      console.warn('[EntityManager] enemy pool exhausted, drop spawn', spawn.entityId, spawn.type);
      return null;
    }
    const diff = mobDifficulty(this.playerLevel, spawn.level);
    enemy.activateFromSpawn(spawn, diff);
    this.byId.set(spawn.entityId, enemy);
    this.spawned.add(enemy);
    return enemy;
  }

  recycleEnemy(enemy: EnemyEntity): void {
    if (enemy.entityId) this.byId.delete(enemy.entityId);
    enemy.recycle();
  }

  /** Soft clear while scene is still alive (encounter restart). */
  recycleAll(): void {
    const children = this.group?.getChildren();
    if (children) {
      for (const child of children) {
        const e = child as EnemyEntity;
        if (e.entityId) this.byId.delete(e.entityId);
        e.destroyHud();
        e.recycle();
      }
    }
    this.byId.clear();
  }

  /**
   * Scene teardown: do NOT iterate the physics group — Phaser may have already
   * destroyed `group.children` (causes "Cannot read properties of undefined (reading 'each')").
   */
  shutdown(): void {
    for (const enemy of this.spawned) {
      try {
        enemy.clearBleed();
        enemy.destroyHud();
      } catch {
        /* scene may already be tearing down */
      }
    }
    this.clearNpcDecor();
    this.byId.clear();
    this.spawned.clear();
    this.npcMeta = [];
    this.npcSpriteRefs = [];
    this.npcLabels = [];
    this.npcMarkers = [];
    this.questSpawned.clear();
    clearNpcStreetCache(this.scene??undefined);
    this.group = null;
    this.scene = null;
  }

  private clearNpcDecor(): void {
    if (!this.scene) {
      this.npcDecor = [];
      this.npcLabels = [];
      this.npcMarkers = [];
      this.stationLabels = [];
      this.stationMarkers = [];
      this.stationPoints = [];
      this.stationAnchors = [];
      this.cityMapPoints = [];
      this.cityMapLabels = [];
      this.cityMapMarkers = [];
      this.nearCityMapUi = [];
      for (const actor of this.npcActors) {
        destroyNpcActor(actor);
      }
      this.npcActors = [];
      this.npcActorById.clear();
      return;
    }
    for (const obj of this.npcDecor) {
      this.scene.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.npcDecor = [];
    this.npcLabels = [];
    this.npcMarkers = [];
    this.stationLabels = [];
    this.stationMarkers = [];
    this.stationPoints = [];
    this.stationAnchors = [];
    this.cityMapPoints = [];
    this.cityMapLabels = [];
    this.cityMapMarkers = [];
    for (const actor of this.npcActors) {
      destroyNpcActor(actor);
    }
    this.npcActors = [];
    this.npcActorById.clear();
    this.nearNpcUi = [];
    this.nearStationUi = [];
    this.nearCityMapUi = [];
  }

  spawnNpcs(location: LocationConfig, vfx: VfxSystem, onSelect?: (id: string) => void): void {
    if (!this.scene) return;
    this.locationId = location.id;
    this.clearNpcDecor();
    const atm = atmosphereFor(location.id);
    this.npcMeta = [];
    this.npcSpriteRefs = [];
    this.npcLabels = [];
    this.npcMarkers = [];
    for (const npc of location.npcs ?? []) {
      let nx = npc.x;
      let ny = npc.y;
      if (npc.id === 'apartment_bed') {
        const save = this.scene.registry.get('bootSave') as { housing?: { tier?: number } } | undefined;
        const tier = Math.max(1, Math.min(3, Math.floor(save?.housing?.tier ?? 1)));
        if (tier >= 2) {
          nx = 400;
          // South of bed mass so the player can stand in the apron and still hit [E].
          ny = 960;
        } else {
          nx = 480;
          ny = 540;
        }
      } else if (npc.id === 'apartment_fridge') {
        nx = 900;
        ny = 560;
      } else if (npc.id === 'apartment_chest') {
        nx = 360;
        ny = 720;
      } else if (npc.id === 'apartment_rack') {
        nx = 920;
        ny = 720;
      }
      const furniture = npc.world?.role === 'prop' || npcIsProp(npc.id);
      // Furniture hit targets sit on/near the prop — do not nudge them out of their own AABB.
      const pos = furniture || npcWorldDef(npc.id)?.seated
        ? { x: nx, y: ny }
        : nudgePointFromPropColliders(this.scene, nx, ny, 16);
      const depth = entityDepth(pos.y + (npcWorldDef(npc.id)?.seated ? 40 : 0));
      const { textureKey, frame } = resolveNpcSprite(this.scene, npc.id);
      const spr = this.scene.add.sprite(pos.x, pos.y, textureKey, frame).setDepth(depth);
      setupSpriteDisplay(spr);
      applyLight2DPipeline(spr);
      if (furniture) {
        // Visual = world props; keep invisible hit target for E-interact.
        spr.setAlpha(0);
        spr.setVisible(false);
      } else {
        if (onSelect) spr.setInteractive({ useHandCursor: true }).on('pointerdown', (pointer: Phaser.Input.Pointer) => { if (pointer.button !== 2) onSelect(npc.id); });
        if (!npcWorldDef(npc.id)?.seated) attachEntityShadow(this.scene, spr, 24, 10, 0.26);
        const def = npcWorldDef(npc.id);
        const sleep = resolveNpcSleepHome(npc.id, pos.x, pos.y);
        const actor = createNpcActor(npc.id, spr, pos.x, pos.y, {
          wanderRadius: npc.world?.wanderRadius ?? def?.wanderRadius,
          wanderSpeed: npc.world?.wanderSpeed ?? def?.wanderSpeed,
          sleepHomeX: sleep.x,
          sleepHomeY: sleep.y,
        });
        this.npcActors.push(actor);
        this.npcActorById.set(npc.id, actor);
        if (spr.scene.anims.exists(npcIdleAnimKey(npc.id))) {
          spr.anims.play(npcIdleAnimKey(npc.id), true);
        }
      }
      this.npcMeta.push({ id: npc.id, sprite: spr, label: npc.label });
      this.npcSpriteRefs.push(spr);
      const labelYOff = furniture ? 52 : 40;
      const label = this.scene.add
        .text(pos.x, pos.y - labelYOff, npc.label, {
          color: furniture ? '#e8d8b8' : '#e8f0ff',
          fontSize: '13px',
          fontStyle: 'bold',
          backgroundColor: '#00000088',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(depth + 1)
        .setVisible(false);
      this.npcDecor.push(label);
      this.npcLabels.push(label);
      const marker = vfx.createNpcMarker(pos.x, pos.y, atm.markerColor);
      marker.setVisible(false);
      this.npcDecor.push(marker);
      this.npcMarkers.push(marker);
    }

    this.stationPoints = mergeStations(location.stations ?? []);
    this.stationAnchors = [];
    this.stationLabels = [];
    this.stationMarkers = [];
    for (const st of this.stationPoints) {
      const pos = nudgePointFromPropColliders(this.scene, st.x, st.y, 16);
      this.stationAnchors.push(pos);
      const depth = entityDepth(pos.y) + 1;
      const label = this.scene.add
        .text(pos.x, pos.y - 48, st.label, {
          color: '#ffe0a8',
          fontSize: '13px',
          fontStyle: 'bold',
          backgroundColor: '#00000088',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(depth)
        .setVisible(false);
      this.npcDecor.push(label);
      this.stationLabels.push(label);
      const marker = vfx.createNpcMarker(pos.x, pos.y, '#e8a050');
      marker.setVisible(false);
      this.npcDecor.push(marker);
      this.stationMarkers.push(marker);
    }

    this.cityMapPoints = collectCityMapKiosks(
      location.id,
      HAVEN_CITY_PROPS,
      location.npcs ?? [],
    ).map((point) => {
      const safe = nudgePointFromPropColliders(this.scene!, point.x, point.y, 16);
      return { ...point, x: safe.x, y: safe.y };
    });
    this.cityMapLabels = [];
    this.cityMapMarkers = [];
    for (const point of this.cityMapPoints) {
      const depth = entityDepth(point.y) + 1;
      const label = this.scene.add
        .text(point.x, point.y - 46, point.label, {
          color: '#8fe4dc',
          fontSize: '12px',
          fontStyle: 'bold',
          backgroundColor: '#061416cc',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5)
        .setDepth(depth)
        .setVisible(false);
      this.npcDecor.push(label);
      this.cityMapLabels.push(label);
      const marker = vfx.createNpcMarker(point.x, point.y, '#78e0dd');
      marker.setVisible(false);
      this.npcDecor.push(marker);
      this.cityMapMarkers.push(marker);
    }
  }

  /** Snap all NPC actors to authoritative Haven schedule (on join / world_time). */
  snapHavenSchedule(schedule: HavenScheduleSnapshot | null | undefined): void {
    if (!this.isReady() || this.locationId !== 'empery_haven') return;
    snapNpcActorsToSchedule(this.npcActors, schedule);
    if (!schedule) return;
    for (const npc of this.npcMeta) {
      const entry = havenScheduleEntryById(schedule, npc.id);
      if (entry && !this.npcActorById.has(npc.id)) npc.sprite.setPosition(entry.x, entry.y);
    }
  }

  /** Show talk prompts only when the player is close (less HUD clutter in a crowded city). */
  syncNpcProximityUi(
    playerX: number,
    playerY: number,
    showRange = 96,
    opts?: { hour?: number; absHours?: number; schedule?: HavenScheduleSnapshot | null; lineOfSight?: (x: number, y: number) => boolean },
  ): void {
    const rangeSq = showRange * showRange;
    this.nearNpcUi = [];
    for (let i = 0; i < this.npcMeta.length; i++) {
      const npc = this.npcMeta[i]!;
      const actor = this.npcActorById.get(npc.id);
      const hour = opts?.hour;
      const schedEntry = opts?.schedule ? havenScheduleEntryById(opts.schedule, npc.id) : undefined;
      const canTalk = npcAvailableForInteraction(
        npc.id,
        this.locationId,
        hour,
        schedEntry,
        !actor || npcActorInteractable(actor),
        opts?.absHours,
      );
      const dx = npc.sprite.x - playerX;
      const dy = npc.sprite.y - playerY;
      const near = canTalk && dx * dx + dy * dy < rangeSq && (npcIsProp(npc.id) || !opts?.lineOfSight || opts.lineOfSight(npc.sprite.x, npc.sprite.y));
      const label = this.npcLabels[i];
      const marker = this.npcMarkers[i];
      if (label) {
        label.setVisible(near);
        if (near && schedEntry) {
          const baseName = npc.label.replace(/\s*\[E\]$/, '');
          if (schedEntry.phase === 'walking_home') {
            label.setText(`${baseName} [Домой] [E]`);
          } else if (schedEntry.phase === 'walking_to_post') {
            label.setText(`${baseName} [На работу] [E]`);
          } else if (label.text !== npc.label) {
            label.setText(npc.label);
          }
        } else if (label.text !== npc.label) {
          label.setText(npc.label);
        }
      }
      if (marker) marker.setVisible(near);
      if (near) this.nearNpcUi.push(i);
    }
    const stationShow = showRange + 24;
    const stationSq = stationShow * stationShow;
    this.nearStationUi = [];
    for (let i = 0; i < this.stationPoints.length; i++) {
      const anchor = this.stationAnchors[i]!;
      const dx = anchor.x - playerX;
      const dy = anchor.y - playerY;
      const near = dx * dx + dy * dy < stationSq && (!opts?.lineOfSight || opts.lineOfSight(anchor.x, anchor.y));
      const label = this.stationLabels[i];
      const marker = this.stationMarkers[i];
      if (label) label.setVisible(near);
      if (marker) marker.setVisible(near);
      if (near) this.nearStationUi.push(i);
    }

    this.nearCityMapUi = [];
    let nearestMapIndex = -1;
    let nearestMapDist = rangeSq;
    if (
      cityMapKioskPromptAllowed(
        this.nearNpcUi.length,
        this.nearStationUi.length,
      )
    ) {
      for (let i = 0; i < this.cityMapPoints.length; i++) {
        const point = this.cityMapPoints[i]!;
        const dx = point.x - playerX;
        const dy = point.y - playerY;
        const dist = dx * dx + dy * dy;
        if (dist < nearestMapDist && (!opts?.lineOfSight || opts.lineOfSight(point.x, point.y))) {
          nearestMapDist = dist;
          nearestMapIndex = i;
        }
      }
    }
    for (let i = 0; i < this.cityMapPoints.length; i++) {
      const near = i === nearestMapIndex;
      this.cityMapLabels[i]?.setVisible(near);
      this.cityMapMarkers[i]?.setVisible(near);
      if (near) this.nearCityMapUi.push(i);
    }
  }

  /** Keep visible talk prompts glued to moving patrol sprites. */
  followNearNpcUi(nowMs: number): void {
    for (const i of this.nearNpcUi) {
      const npc = this.npcMeta[i];
      if (!npc) continue;
      const layout = npcPromptLayout(npc.sprite.x, npc.sprite.y, nowMs, {
        prop: npcIsProp(npc.id),
      });
      const label = this.npcLabels[i];
      const marker = this.npcMarkers[i];
      if (label?.visible) {
        label.setPosition(layout.labelX, layout.labelY);
        label.setDepth(npc.sprite.depth + 1);
      }
      if (marker?.visible) {
        marker.setPosition(layout.markerX, layout.markerY);
        marker.setDepth(npc.sprite.depth + 2);
      }
    }
    for (const i of this.nearStationUi) {
      const anchor = this.stationAnchors[i];
      if (!anchor) continue;
      const layout = npcPromptLayout(anchor.x, anchor.y, nowMs);
      const label = this.stationLabels[i];
      const marker = this.stationMarkers[i];
      if (label?.visible) {
        label.setPosition(anchor.x, anchor.y - 48);
        label.setDepth(entityDepth(anchor.y) + 2);
      }
      if (marker?.visible) {
        marker.setPosition(layout.markerX, layout.markerY);
      }
    }
  }

  visibleNpcPosition(id: string): { x: number; y: number } | null {
    const npc = this.npcMeta.find(entry => entry.id === id);
    if (!npc || !npc.sprite.active || !npc.sprite.visible || npc.sprite.alpha < 0.5 || npcIsProp(id)) return null;
    return { x: npc.sprite.x, y: npc.sprite.y };
  }

  interactionNpc(id: string, opts?: { hour?: number; absHours?: number; schedule?: HavenScheduleSnapshot | null }): { id: string; x: number; y: number } | null {
    const npc = this.npcMeta.find(entry => entry.id === id);
    if (!npc || !npc.sprite.active || npcIsProp(id) || !npc.sprite.visible || npc.sprite.alpha < 0.2) return null;
    const actor = this.npcActorById.get(id);
    const entry = opts?.schedule ? havenScheduleEntryById(opts.schedule, id) : undefined;
    if (!npcAvailableForInteraction(id, this.locationId, opts?.hour, entry, !actor || npcActorInteractable(actor), opts?.absHours)) return null;
    return { id, x: npc.sprite.x, y: npc.sprite.y };
  }

  findTalkNpc(
    playerX: number,
    playerY: number,
    range = 80,
    opts?: { hour?: number; absHours?: number; schedule?: HavenScheduleSnapshot | null; lineOfSight?: (x: number, y: number) => boolean },
  ): string | null {
    const rangeSq = range * range;
    let best: string | null = null;
    let bestD = rangeSq;
    for (let i = 0; i < this.npcMeta.length; i++) {
      const npc = this.npcMeta[i]!;
      const actor = this.npcActorById.get(npc.id);
      const hour = opts?.hour;
      const schedEntry = opts?.schedule ? havenScheduleEntryById(opts.schedule, npc.id) : undefined;
      if (
        !npcAvailableForInteraction(
          npc.id,
          this.locationId,
          hour,
          schedEntry,
          !actor || npcActorInteractable(actor),
          opts?.absHours,
        )
      ) {
        continue;
      }
      // Apartment furniture uses invisible hit sprites (art is world props).
      const furniture = npcIsProp(npc.id);
      if (!furniture && (!npc.sprite.visible || npc.sprite.alpha < 0.2 || (opts?.lineOfSight && !opts.lineOfSight(npc.sprite.x, npc.sprite.y)))) continue;
      const dx = npc.sprite.x - playerX;
      const dy = npc.sprite.y - playerY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = npc.id;
      }
    }
    return best;
  }

  findUseStation(playerX: number, playerY: number, range = 110, visible?: (x: number, y: number) => boolean): StationInteractPoint | null {
    const rangeSq = range * range;
    let best: StationInteractPoint | null = null;
    let bestD = rangeSq;
    for (let i = 0; i < this.stationPoints.length; i++) {
      const anchor = this.stationAnchors[i]!;
      const dx = anchor.x - playerX;
      const dy = anchor.y - playerY;
      const d = dx * dx + dy * dy;
      if (d < bestD && (!visible || visible(anchor.x, anchor.y))) {
        bestD = d;
        best = this.stationPoints[i]!;
      }
    }
    return best;
  }

  findCityMapKiosk(playerX: number, playerY: number, range = 96, visible?: (x: number, y: number) => boolean): CityMapKiosk | null {
    const rangeSq = range * range;
    let best: CityMapKiosk | null = null;
    let bestDist = rangeSq;
    for (const point of this.cityMapPoints) {
      const dx = point.x - playerX;
      const dy = point.y - playerY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist && (!visible || visible(point.x, point.y))) {
        best = point;
        bestDist = dist;
      }
    }
    return best;
  }

  forEachNpc(fn: (npc: { id: string; x: number; y: number }) => void): void {
    for (const npc of this.npcMeta) {
      if (!npc.sprite.active) continue;
      fn({ id: npc.id, x: npc.sprite.x, y: npc.sprite.y });
    }
  }

  private talkingNpcId: string | null = null;

  setTalkingNpc(npcId: string | null): void {
    this.talkingNpcId = npcId;
  }

  getTalkingNpc(): string | null {
    return this.talkingNpcId;
  }

  syncNpcShadows(): void {
    if (!this.isReady()) return;
    syncEntityShadows(this.npcSpriteRefs);
  }

  /** Idle / wander for character NPCs. Call each frame. */
  updateNpcs(dtMs: number, opts?: { schedule?: HavenScheduleSnapshot | null; absHours?: number }): void {
    if (!this.isReady()) return;
    updateNpcActors(this.npcActors, dtMs, {
      schedule: opts?.schedule,
      talkingNpcId: this.talkingNpcId,
    });
    const absHours = opts?.absHours;
    if (absHours == null) return;
    for (const npc of this.npcMeta) {
      if (!isHavenShipSkipperNpc(npc.id)) continue;
      const docked = havenShipSkipperPresent(npc.id, absHours);
      npc.sprite.setVisible(docked);
      const actor = this.npcActorById.get(npc.id);
      if (actor) actor.sprite.setVisible(docked);
    }
  }

  setupLocationContent(_location: LocationConfig, _save: PlayerSave): void {
    this.questSpawned.clear();
  }

  applyQuestVisuals(
    location: LocationConfig,
    save: PlayerSave,
    showBanner: (t: string) => void,
  ): void {
    for (const done of location.questComplete ?? []) {
      if (done.anyFlag.some((f) => hasFlag(save, f))) {
        showBanner(done.banner);
        return;
      }
    }
    for (const group of location.questSpawns ?? []) {
      if (!hasFlag(save, group.activeFlag)) continue;
      if (group.banner && group.killCounterFlag) {
        const kills = Number(save.questFlags[group.killCounterFlag] ?? 0);
        showBanner(group.banner.replace('{kills}', String(kills)));
      }
      return;
    }
  }

  onQuestActivated(
    location: LocationConfig,
    prev: PlayerSave,
    next: PlayerSave,
    showBanner: (t: string) => void,
  ): void {
    for (const group of location.questSpawns ?? []) {
      const was = hasFlag(prev, group.activeFlag);
      const is = hasFlag(next, group.activeFlag);
      if (!was && is) {
        if (group.startBanner) showBanner(group.startBanner);
      }
    }
  }
}
