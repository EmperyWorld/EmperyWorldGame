import { MOUNT_COLLISION_RADIUS, PLAYER_COLLISION_RADIUS, MAX_INPUT_BACKLOG, FOOT_DASH_SPEED as DASH_SPEED, FOOT_DASH_DURATION_MS as DASH_DURATION, FOOT_DASH_COOLDOWN_MS, MOUNT_CHARGE_SPEED_MULT as CHARGE_SPEED_MULT } from '@empery/shared/movement';
import { walkCadence } from '../../sprites/walk-cadence.js';
import { InteractionApproach } from './interaction-approach.js';
import { PlayerNavigation, PLAYER_NAV_ARRIVAL_PX, resolvePlayerDestination } from './player-navigation.js';
import { PlayerMotion } from './player-motion.js';
import { CollisionWorld, type CollisionMap } from '@empery/shared/world-collision';
import { worldProps, propCollisionBoxes } from '@empery/shared/world-props';
import { getHavenSchedule } from '../../world-clock.js';
import Phaser from 'phaser';
import {
  cloakTextureKey,
  cloakFrameName,
  registerCloakOverlay,
  shieldTextureKey,
  shieldFrameName,
  registerShieldOverlay,
  registerWeaponOverlay,
  weaponTextureKey,
  weaponFrameName,
  type WeaponOverlayKind,
} from '../../sprites/sprite-factory.js';
import { registerMountedLook, mountedFrameName, MOUNT_ATLAS_KEY } from '../../sprites/mounted-sprite.js';
import {
  mountedAnimKey,
  mountedLookFromSave,
  looksEqual,
  type MountedLook,
} from '../../sprites/mounted-look.js';
import {
  cloakVariantForItem,
  playerAnimToCloakAnim,
  shieldVariantForItem,
  playerAnimToShieldAnim,
  playerAnimToWeaponAnim,
  weaponOverlayForSave,
} from '../../sprites/player-equipment.js';
import { playerAnimKey, playerSpriteFrame, playerTextureKey, playerWalkAnimKey, playerIdleAnimKey, setupSpriteDisplay, DISPLAY_SIZE } from '../../sprites/sprite-loader.js';
import {
  facingFromDelta,
  facingNeedsFlipX,
  facingRow,
  type Facing8,
} from '../../sprites/facing4.js';
import { attachEntityShadow, entityDepth, syncEntityShadow } from '../../sprites/visual-polish.js';
import { SPRITE_SIZE } from '../../sprites/sprite-factory.js';
import { isInsidePropAabb } from '../../sprites/prop-colliders.js';
import { isTileBlockedAt } from '../../sprites/world-tiles.js';
import type { GroundLayer } from '../systems/ground-layer.js';
import { pullTowardWalkable } from '../systems/world-geodata.js';
import type { MountDefinition, PlayerSave, PlayerStats } from '../../api.js';
import { getMountDef } from '../../mount-catalog.js';
import {
  MOUNT_STAMINA_MAX,
  MOUNT_STAMINA_WALK_CAP,
  PLAYER_STAMINA_MAX,
  PLAYER_STAMINA_WALK_CAP,
  advanceMountStamina,
  advancePlayerStamina,
  clampMountStamina,
  clampPlayerStamina,
  footMoveSpeed,
  mountCanCharge,
  mountCanRun,
  mountedMoveSpeed,
  playerCanDash,
  playerCanRun,
  type MountStaminaHorse,
} from '@empery/shared';
import { PlayerFsm } from '../fsm/PlayerFsm.js';
import { Depth } from '../constants/depth.js';
import type { InputManager } from '../systems/InputManager.js';
import type { LocationConfig } from '../scenes/location-types.js';
import type { GameRegistryCallbacks } from '../systems/RealtimeRouter.js';
import {
  isClickMoveStuck,
  resolveMoveIntent,
  type MoveIntent,
} from './move-intent.js';

const DEFAULT_CHARGE_SPEED = 480;
const DEFAULT_CHARGE_DURATION = 500;
/** Charge must feel faster than current cruise (tired walk or full gallop). */
const HIT_RADIUS = SPRITE_SIZE.hitRadius;
const ATTACK_COOLDOWN_FALLBACK = 450;
/** Окно бонуса уклонения при ударе — не сжимать вместе с Atk.Spd. */
const COUNTER_WINDOW_MS = 280;
/** Цельный спрайт mount+rider чуть ниже якоря физтела. */
const MOUNT_BODY_OFFSET_Y = 2;
const MOUNT_DISPLAY = 1.12;
const DEFAULT_HORSE: MountStaminaHorse = { speedMult: 1.4 };
const STAMINA_SYNC_MS = 10_000;
/** Достигли click-to-move точки. */
const CLICK_MOVE_ARRIVE = 12;
const CLICK_MOVE_ARRIVE_SQ = CLICK_MOVE_ARRIVE * CLICK_MOVE_ARRIVE;
const CLICK_MOVE_PAD = 16;
const CLICK_STUCK_MOVE_PX = 0.001;
const CLICK_STUCK_MS = 450;
const DOUBLE_CLICK_MS = 320;
const DOUBLE_CLICK_DIST_SQ = 36 * 36;

function horseFromDef(def: MountDefinition | undefined): MountStaminaHorse {
  if (!def) return DEFAULT_HORSE;
  return {
    speedMult: def.speedMult > 0 ? def.speedMult : 1.4,
    staminaDrainMult: def.staminaDrainMult,
    staminaRegenMult: def.staminaRegenMult,
    carryComfortKg: def.carryComfortKg,
    carryMaxKg: def.carryMaxKg,
  };
}

export class PlayerController {
  readonly fsm = new PlayerFsm();
  player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cloak: Phaser.GameObjects.Sprite | null = null;
  private cloakVariant: string | null = null;
  private shield: Phaser.GameObjects.Sprite | null = null;
  private shieldVariant: string | null = null;
  private weapon: Phaser.GameObjects.Sprite | null = null;
  private weaponKind: WeaponOverlayKind | null = null;
  private mount: Phaser.GameObjects.Sprite | null = null;
  private mountLook: MountedLook | null = null;
  private race = 'human';
  private gender: 'male' | 'female' = 'male';
  private facing: Facing8 = 'down';
  private dashEndsAt = 0;
  private nextBurstAt = 0;
  private chargeCooldownMs = 2000;
  private alphaRestoreEvent?: Phaser.Time.TimerEvent;
  private chargeHitPending = false;
  private deathTween?: Phaser.Tweens.Tween;
  private deathEpoch = 0;
  private mounted = false;
  private ownedMountId: string | null = null;
  private mountStamina = MOUNT_STAMINA_MAX;
  private playerStamina = PLAYER_STAMINA_MAX;
  private playerStaminaInited = false;
  private footSpeed = 120;
  private carryWeightKg = 72;
  private horse: MountStaminaHorse = DEFAULT_HORSE;
  private lastVitalsTickAt = 0;
  private mountStaminaDirty = false;
  private mountStaminaSyncForce = false;
  private lastMountStaminaSyncAt = 0;
  private playerStaminaDirty = false;
  private playerStaminaSyncForce = false;
  private lastPlayerStaminaSyncAt = 0;
  private mountRuntimeKey = '';
  private chargeSpeed = DEFAULT_CHARGE_SPEED;
  private chargeDurationMs = DEFAULT_CHARGE_DURATION;
  private invulnUntil = 0;
  private attackLockUntil = 0;
  /** Отдельно от anim lock: бонус evasion при касании моба. */
  private counterUntil = 0;
  /** Блокировать WASD на время атаки (melee). Лук — нет. */
  private attackLocksMove = true;
  private lastAttack = 0;
  private frenzyAura?: Phaser.GameObjects.Arc;
  private dualUntil = 0;
  private dualAura?: Phaser.GameObjects.Arc;
  private frenzyUntil = 0;
  /** Click-to-move destination (world); null = keyboard-only. */
  private lastClickAttempt?: { x: number; y: number };
  private navigationPreview?: Phaser.GameObjects.Graphics;
  private navigationPreviewKey = '';
  private navigation: PlayerNavigation | null = null;
  private interactionApproach: InteractionApproach | null = null;
  private reachedInteraction: string | null = null;
  beginInteractionApproach(id: string, resolve: () => { x: number; y: number } | null): void {
    if (this.fsm.isDead || this.input.isUiBlocked()) return;
    this.clearClickMove(); this.interactionApproach = new InteractionApproach(id, resolve);
  }
  takeReachedInteraction(): string | null { const id = this.reachedInteraction; this.reachedInteraction = null; return id; }
  hasLineOfSight(x: number, y: number): boolean { return this.collisionWorld()?.hasLineOfSight(this.getPosition(), { x, y }) ?? true; }

  private clickMove: { x: number; y: number } | null = null;
  /** Destination queued while melee attack locks movement. */
  private queuedClick: { x: number; y: number } | null = null;
  private clickMoveMarker?: Phaser.GameObjects.Arc;
  private clickMovePulse?: Phaser.Tweens.Tween;
  private clickStuckMs = 0;
  private clickStuckLastX = 0;
  private clickStuckLastY = 0;
  private lastGroundClickAt = 0;
  private lastGroundClickX = 0;
  private lastGroundClickY = 0;
  private pendingDashTowardClick = false;
  private pendingClickDashUntil = 0;
  private movementEpoch = 0;
  private motionMap: CollisionMap | null = null;
  private motionWorld: CollisionWorld | null = null;
  private geometryKey = '';
  private motionSave: PlayerSave | null = null;
  private motionLocation: LocationConfig | null = null;
  private predictedMotion: PlayerMotion | null = null;
  private movedLastStep = false;
  private hurtPoseEpoch = 0;
  private movementAllowance = 4;
  setMovementAllowance(steps: number): void { this.movementAllowance = Number.isFinite(steps) ? Math.max(0, Math.min(4, Math.floor(steps))) : 0; }
  private motionFrames:Array<{dx:number;dy:number;prediction:{x:number;y:number}}> = [];
  takeMovementFrames():Array<{dx:number;dy:number;prediction:{x:number;y:number}}> {
    return this.motionFrames.splice(0);
  }
  get predictsMovement(): boolean { return this.predictedMotion != null; }
  configureMotion(map:CollisionMap,save:PlayerSave,location:LocationConfig):void {
    this.motionMap=map;this.motionSave=save;this.motionLocation=location;this.geometryKey='';this.predictedMotion=new PlayerMotion({x:this.player.x,y:this.player.y});this.motionFrames=[];
    const pose = this.collisionWorld()!.nearestWalkable(this.getPosition());
    if (pose.x !== this.x || pose.y !== this.y) this.setPosition(pose.x, pose.y);
  }
  private collisionWorld():CollisionWorld|null {
    if(!this.motionMap||!this.motionSave||!this.motionLocation)return null;
    const save=this.motionSave,open=save.location==='empery_haven'&&!getHavenSchedule()?.restActive;
    const hqAccess = save.location === 'empery_haven' && Boolean(save.questFlags.quest_empery_hq_access);
    const tier = save.location === 'haven_apartment' ? save.housing?.tier ?? 1 : 1;
    const key=`${open}:${hqAccess}:${tier}:${Boolean(save.mount?.mounted)}`;
    if(key!==this.geometryKey){
      this.geometryKey=key;
      const props=worldProps(save.location,{hqAccess,tier,landmarks:this.motionLocation.landmarks,stations:this.motionLocation.stations});
      this.motionWorld=new CollisionWorld(this.motionMap,props.flatMap(([id,x,y,size])=>propCollisionBoxes(id,x,y,size,open)),save.mount?.mounted?MOUNT_COLLISION_RADIUS:PLAYER_COLLISION_RADIUS);
    }
    return this.motionWorld;
  }
  reconcileMotion(x:number,y:number):void {
    const world=this.collisionWorld();
    const target=world?.nearestWalkable({x,y})??{x,y};
    const distance=Math.hypot(target.x-this.x,target.y-this.y);
    const k=distance>80?1:.35;
    const point={x:this.x+(target.x-this.x)*k,y:this.y+(target.y-this.y)*k};
    const correction=world?.blocked(point.x,point.y)?target:point;
    this.predictedMotion?.correct(correction);
    const render=this.predictedMotion?.renderPosition()??correction;
    this.player.setPosition(render.x,render.y);
  }
  private updateNavigationPreview(): void {
    const nav = this.navigation;
    if (!nav) return;
    const key = `${nav.generation}:${nav.status}:${nav.cursor}:${Math.floor(this.scene.time.now / 100)}`;
    if (key === this.navigationPreviewKey) return;
    this.navigationPreviewKey = key;
    this.navigationPreview ??= this.scene.add?.graphics().setDepth(Depth.EntityMark);
    const graphic = this.navigationPreview;
    if (!graphic) return;
    graphic.clear();
    if (nav.status !== 'following') return;
    graphic.lineStyle(2, 0x7bcfff, 0.35);
    graphic.beginPath();
    graphic.moveTo(this.x, this.y);
    for (let i = nav.cursor; i < nav.path.length; i++) {
      const point = nav.path[i]!; graphic.lineTo(point.x, point.y);
    }
    graphic.strokePath();
  }

  private moveIntent: MoveIntent = { kind: 'none', vx: 0, vy: 0 };

  constructor(
    private scene: Phaser.Scene,
    private input: InputManager,
    private onNavigationFeedback?: (message: string) => void,
  ) { this.movementEpoch = input.movementEpoch; }

  /**
   * ЛКМ по земле: идти к точке. WASD снимает цель.
   * Во время melee lock точка ставится в очередь.
   * Двойной клик рядом — рывок/таран к точке.
   */
  setClickMoveTarget(
    worldX: number,
    worldY: number,
    opts?: { fromHold?: boolean; allowQueue?: boolean; fromApproach?: boolean },
  ): void {
    if (this.fsm.isDead || !this.player?.active || this.input.isUiBlocked()) return;
    if (!opts?.fromApproach) { this.interactionApproach = null; this.reachedInteraction = null; }
    const bounds = this.scene.physics.world.bounds;
    const x = Phaser.Math.Clamp(
      worldX,
      bounds.x + CLICK_MOVE_PAD,
      bounds.right - CLICK_MOVE_PAD,
    );
    const y = Phaser.Math.Clamp(
      worldY,
      bounds.y + CLICK_MOVE_PAD,
      bounds.bottom - CLICK_MOVE_PAD,
    );
    if (opts?.fromHold && this.lastClickAttempt && Math.hypot(x-this.lastClickAttempt.x,y-this.lastClickAttempt.y)<8) return;
    this.lastClickAttempt = { x, y };
    const blocked = (px: number, py: number): boolean =>
      isTileBlockedAt(this.scene, px, py) || isInsidePropAabb(this.scene, px, py, HIT_RADIUS);
    const world = this.collisionWorld();
    const pulled = world ? resolvePlayerDestination(world, { x, y }) : pullTowardWalkable(this.player.x, this.player.y, x, y, blocked);
    if (!pulled) { this.clearClickMove(); this.onNavigationFeedback?.('Рядом нет доступной точки'); return; }
    const tx = pulled.x;
    const ty = pulled.y;

    const now = this.scene.time.now;
    const attacking = now < this.attackLockUntil;
    const lockMove = attacking && this.attackLocksMove;
    if (lockMove && (opts?.allowQueue !== false)) {
      this.queuedClick = { x: tx, y: ty };
      this.showClickMarker(tx, ty, 0.45);
      return;
    }

    if (!opts?.fromHold && !opts?.fromApproach) {
      const dt = now - this.lastGroundClickAt;
      const ddx = x - this.lastGroundClickX;
      const ddy = y - this.lastGroundClickY;
      if (dt > 0 && dt <= DOUBLE_CLICK_MS && ddx * ddx + ddy * ddy <= DOUBLE_CLICK_DIST_SQ) {
        this.pendingDashTowardClick = true;
        this.pendingClickDashUntil = now + 350;
      }
      this.lastGroundClickAt = now;
      this.lastGroundClickX = x;
      this.lastGroundClickY = y;
    }

    if (opts?.fromHold && this.clickMove && Math.hypot(tx-this.clickMove.x,ty-this.clickMove.y)<8) return;
    this.queuedClick = null;
    this.clickMove = { x: tx, y: ty };
    this.clickStuckMs = 0;
    this.clickStuckLastX = this.player.x;
    this.clickStuckLastY = this.player.y;
    this.showClickMarker(tx, ty, 0.85);
  }

  clearClickMove(opts?: { fade?: boolean; reason?: 'arrive' | 'cancel' | 'stuck'; preserveApproach?: boolean }): void {
    if (!opts?.preserveApproach) this.interactionApproach = null;
    this.reachedInteraction = null;
    this.navigation?.clear();
    this.navigationPreview?.clear(); this.navigationPreviewKey = '';
    this.clickMove = null;
    this.queuedClick = null;
    this.clickStuckMs = 0;
    this.pendingDashTowardClick = false;
    this.clickMovePulse?.stop();
    this.clickMovePulse = undefined;
    const marker = this.clickMoveMarker;
    if (!marker?.visible) return;
    if (opts?.fade) {
      this.scene.tweens.killTweensOf(marker);
      this.scene.tweens.add({
        targets: marker,
        alpha: 0,
        scale: 0.6,
        duration: opts.reason === 'arrive' ? 160 : 220,
        onComplete: () => marker.setVisible(false),
      });
      return;
    }
    marker.setVisible(false);
  }

  getMoveIntent(): MoveIntent {
    return this.moveIntent;
  }

  create(
    save: PlayerSave,
    location: LocationConfig,
    groundLayer: GroundLayer | null,
  ): void {
    this.fsm.reset();
    this.race = save.race;
    this.gender = save.gender === 'female' ? 'female' : 'male';
    const spawnX =
      typeof save.worldX === 'number' && Number.isFinite(save.worldX) ? save.worldX : location.spawn.x;
    const spawnY =
      typeof save.worldY === 'number' && Number.isFinite(save.worldY) ? save.worldY : location.spawn.y;
    this.player = this.scene.physics.add.sprite(
      spawnX,
      spawnY,
      playerTextureKey(save.race),
      playerSpriteFrame(save.race, 0, this.gender),
    );
    this.player.setCollideWorldBounds(true);
    this.player.setCircle(HIT_RADIUS);
    this.player.setDepth(10);
    setupSpriteDisplay(this.player);
    this.player.play(playerAnimKey(this.race, 'idle', this.gender));
    attachEntityShadow(this.scene, this.player);
    this.refreshCloak(save);
    this.refreshShield(save);
    // stats come on first updateSave / explicit refreshWeapon from scene
    void groundLayer;
    this.scene.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    const dzW = Math.min(220, Math.max(80, this.scene.scale.width * 0.14));
    const dzH = Math.min(140, Math.max(60, this.scene.scale.height * 0.1));
    this.scene.cameras.main.setDeadzone(dzW, dzH);
    if (save.hp <= 0) {
      this.fsm.force('dead');
      this.player.setVelocity(0, 0);
      this.player.setAlpha(0.25);
      this.player.setAngle(-90);
      this.clearMountVisual();
    }
  }

  get isMoving(): boolean {
    return this.fsm.state === 'move';
  }

  get isDashing(): boolean {
    return this.fsm.state === 'dash';
  }

  get isCharging(): boolean {
    return this.fsm.state === 'charge';
  }

  /** Один раз за таран — CombatSystem забирает и шлёт хит. */
  consumeChargeHitRequest(): boolean {
    if (!this.chargeHitPending) return false;
    this.chargeHitPending = false;
    return true;
  }

  get isAttacking(): boolean {
    return this.fsm.state === 'attack' || this.scene.time.now < this.attackLockUntil;
  }

  /** Бонус контратаки / evasion — фиксированное окно, не зависит от Atk.Spd. */
  get isInCounterWindow(): boolean {
    return this.scene.time.now < this.counterUntil;
  }

  get isDead(): boolean {
    return this.fsm.isDead;
  }

  getFacingRight(): boolean {
    return !facingNeedsFlipX(this.facing);
  }

  get x(): number {
    return this.predictedMotion?.x ?? this.player.x;
  }

  get y(): number {
    return this.predictedMotion?.y ?? this.player.y;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  setPosition(x: number, y: number, opts?: { preserveNavigation?: boolean }): void {
    if (!opts?.preserveNavigation) this.clearClickMove();
    this.predictedMotion?.reset({x,y});
    this.movedLastStep = false;
    this.motionFrames = [];
    this.player.setPosition(x, y);
  }

  getBody(): Phaser.Types.Physics.Arcade.SpriteWithDynamicBody {
    return this.player;
  }

  setVelocity(x: number, y: number): void {
    this.player.setVelocity(x, y);
  }

  isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnUntil;
  }

  canAttack(stats: PlayerStats): boolean {
    const now = this.scene.time.now;
    if (this.fsm.isDead || this.input.isUiBlocked()) return false;
    if (now < this.attackLockUntil) return false;
    const delay = this.effectiveAttackDelayMs(stats);
    if (now - this.lastAttack < delay) return false;
    return (
      this.fsm.can('attack') ||
      this.fsm.state === 'idle' ||
      this.fsm.state === 'move' ||
      this.fsm.state === 'hurt'
    );
  }

  /** Учитывает локальный бафф дуалиста, если серверные статы ещё не догнали. */
  effectiveAttackDelayMs(stats: PlayerStats): number {
    let delay = stats.attackDelayMs ?? ATTACK_COOLDOWN_FALLBACK;
    const now = this.scene.time.now;
    // Сервер уже делит delay при активном баффе; локальный ×2 только пока
    // бафф горит, а delay ещё «медленный» (ответ сервера не применили).
    if (now < this.dualUntil && delay > 160) {
      delay = Math.max(80, Math.floor(delay / 2));
    }
    return delay;
  }

  beginAttack(stats: PlayerStats, opts?: { allowMove?: boolean }): void {
    if (this.interactionApproach) this.clearClickMove();
    const now = this.scene.time.now;
    this.lastAttack = now;
    this.attackLocksMove = !opts?.allowMove;
    const cd = this.effectiveAttackDelayMs(stats);
    // Лок анимации не должен быть выше самой задержки атаки (иначе ×2 aspd бесполезен)
    const animLock = Math.max(50, Math.min(Math.floor(cd * 0.5), cd));
    this.attackLockUntil = now + animLock;
    this.counterUntil = now + Math.max(animLock, COUNTER_WINDOW_MS);
    this.fsm.tryEnter('attack');
    if (this.mounted && this.mountLook) {
      const atk = mountedAnimKey(this.mountLook, 'attack', facingRow(this.facing));
      if (this.scene.anims.exists(atk)) this.mount?.play(atk, true);
    } else {
      this.player.play(playerAnimKey(this.race, 'attack', this.gender), true);
    }
  }

  endAttack(): void {
    if (this.fsm.state === 'attack') this.fsm.force('idle');
  }

  update(stats: PlayerStats): void {
    if (!this.player.active || this.fsm.isDead) {
      this.clearClickMove();
      return;
    }

    const now = this.scene.time.now;
    const attacking = now < this.attackLockUntil;
    const lockMove = attacking && this.attackLocksMove;
    const blocked = lockMove || this.input.isUiBlocked() || this.movementAllowance <= 0;
    const epoch = this.input.movementEpoch ?? 0;
    if (epoch !== this.movementEpoch) { this.movementEpoch = epoch; this.clearClickMove(); }
    if (blocked || now > this.pendingClickDashUntil) this.pendingDashTowardClick = false;

    if (!lockMove && this.queuedClick) {
      const q = this.queuedClick;
      this.queuedClick = null;
      this.clickMove = q;
      this.clickStuckMs = 0;
      this.clickStuckLastX = this.player.x;
      this.clickStuckLastY = this.player.y;
      this.showClickMarker(q.x, q.y, 0.85);
    }

    const axis = blocked ? { x: 0, y: 0 } : this.input.getMoveAxis();
    const navigationWorld = this.collisionWorld();
    if (this.interactionApproach && (axis.x || axis.y || this.input.isUiBlocked())) this.clearClickMove();
    if (this.interactionApproach && !blocked && navigationWorld) {
      const result = this.interactionApproach.update(navigationWorld, this.getPosition(), now, this.clickMove != null || this.queuedClick != null, this.navigation?.status === 'planning');
      if (result.kind === 'route') this.setClickMoveTarget(result.point.x, result.point.y, { fromApproach: true });
      else if (result.kind === 'arrived') { this.clearClickMove({ fade: true, reason: 'arrive' }); this.reachedInteraction = result.id; }
      else if (result.kind === 'unavailable' || result.kind === 'unreachable') { this.clearClickMove(); this.onNavigationFeedback?.(result.kind === 'unavailable' ? 'Персонаж сейчас недоступен' : 'Не удалось подойти к персонажу'); }
    }
    let clickWaypoint = this.clickMove;
    if (!blocked && this.clickMove && !axis.x && !axis.y && navigationWorld) {
      this.navigation ??= new PlayerNavigation();
      this.navigation.update(navigationWorld, this.getPosition(), this.clickMove);
      clickWaypoint = this.navigation.waypoint(this.getPosition());
      if (this.navigation.status === 'failed') this.onNavigationFeedback?.(this.navigation.failure === 'search_limit' ? 'Маршрут слишком сложный — выберите точку ближе' : 'Путь недоступен');
      this.updateNavigationPreview();
      if (this.navigation.status === 'failed' || this.navigation.status === 'arrived') this.clearClickMove({ fade: true, reason: this.navigation.status === 'arrived' ? 'arrive' : 'stuck', preserveApproach: this.navigation.status === 'arrived' });
    }
    const resolved = resolveMoveIntent({
      axisX: axis.x,
      axisY: axis.y,
      click: blocked ? null : clickWaypoint,
      playerX: this.x,
      playerY: this.y,
      arriveDistSq: navigationWorld ? PLAYER_NAV_ARRIVAL_PX ** 2 : CLICK_MOVE_ARRIVE_SQ,
    });
    if (resolved.cancelClickByKeyboard || resolved.arrived) {
      this.clearClickMove({ fade: resolved.arrived, reason: resolved.arrived ? 'arrive' : 'cancel', preserveApproach: resolved.arrived });
    }
    this.moveIntent = resolved.intent;
    let vx = resolved.intent.vx;
    let vy = resolved.intent.vy;
    const moving = vx !== 0 || vy !== 0;

    if (moving) {
      this.facing = facingFromDelta(vx, vy) ?? this.facing;
      if (!attacking && this.fsm.state !== 'dash' && this.fsm.state !== 'charge') {
        this.fsm.tryEnter('move');
      }
    } else if (!attacking && this.fsm.state === 'move') {
      this.fsm.tryEnter('idle');
    }

    const wantDash = this.input.consumeDash() || this.pendingDashTowardClick;
    // Dash/charge: keyboard move, click-move, or double-click burst toward target.
    const canDashDir = moving;
    if (this.pendingDashTowardClick && (this.isDashing || this.isCharging)) {
      this.pendingDashTowardClick = false;
    } else if (wantDash && canDashDir && !blocked && now >= this.nextBurstAt && !this.isDashing && !this.isCharging && !attacking) {
      if (this.mounted && mountCanCharge(this.mountStamina) && this.fsm.tryEnter('charge')) {
        this.dashEndsAt = now + this.chargeDurationMs;
        this.nextBurstAt = now + this.chargeCooldownMs;
        this.chargeHitPending = true;
        this.applyChargeStaminaPulse();
        this.player.setAlpha(0.85);
        this.scheduleAlphaRestore(this.chargeDurationMs);
      } else if (this.mounted && !mountCanCharge(this.mountStamina)) {
        const cb = this.scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
        cb?.onCombatFeedback?.('Конь выдохся — нет сил на рывок');
      } else if (!this.mounted && playerCanDash(this.playerStamina) && this.fsm.tryEnter('dash')) {
        this.dashEndsAt = now + DASH_DURATION;
        this.nextBurstAt = now + FOOT_DASH_COOLDOWN_MS;
        this.invulnUntil = now + DASH_DURATION;
        this.applyDashStaminaPulse();
        this.player.setAlpha(0.65);
        this.scheduleAlphaRestore(DASH_DURATION);
      } else if (!this.mounted && !playerCanDash(this.playerStamina)) {
        const cb = this.scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
        cb?.onCombatFeedback?.('Нет выносливости для рывка');
      }
      this.pendingDashTowardClick = false;
    }

    const dashing =
      (this.fsm.state === 'dash' || this.fsm.state === 'charge') && now < this.dashEndsAt;
    if (
      (this.fsm.state === 'dash' || this.fsm.state === 'charge') &&
      now >= this.dashEndsAt
    ) {
      this.fsm.tryEnter(moving || this.clickMove != null ? 'move' : 'idle');
    }

    const cruise = this.currentMoveSpeed(stats);
    const speed =
      this.fsm.state === 'charge' && now < this.dashEndsAt
        ? Math.max(this.chargeSpeed, cruise * CHARGE_SPEED_MULT)
        : this.fsm.state === 'dash' && now < this.dashEndsAt
          ? DASH_SPEED
          : cruise;

    const collision=this.collisionWorld();
    if(collision) {
      this.predictedMotion ??= new PlayerMotion({x:this.player.x,y:this.player.y});
      const before=this.predictedMotion.position();
      const frames=this.predictedMotion.advance(collision,this.scene.game.loop.delta,vx,vy,speed,
        !blocked&&this.moveIntent.kind==='click'?(this.navigation ? (from => this.navigation!.waypoint(from)) : this.clickMove):null, this.movementAllowance ?? 4);
      if (!this.movementAllowance) this.movedLastStep = false;
      if(frames.length)this.movedLastStep=Math.hypot(this.predictedMotion.x-before.x,this.predictedMotion.y-before.y)>0.001;
      this.motionFrames.push(...frames);
      if(this.motionFrames.length>MAX_INPUT_BACKLOG)this.motionFrames.splice(0,this.motionFrames.length-MAX_INPUT_BACKLOG);
      let render=this.predictedMotion.renderPosition();
      if(collision.blocked(render.x,render.y))render=this.predictedMotion.position();
      this.player.setPosition(render.x,render.y);
      this.player.setVelocity(0,0);
    } else { this.player.setVelocity(vx * speed, vy * speed); this.movedLastStep=moving||dashing; }
    this.tickVitals(now, (moving || dashing)&&this.movedLastStep, dashing?1:Math.min(1,Math.hypot(vx,vy)));
    this.player.setFlipX(facingNeedsFlipX(this.facing));

    if (!blocked && this.clickMove && this.moveIntent.kind === 'click') {
      const moved = Math.hypot(
        this.player.x - this.clickStuckLastX,
        this.player.y - this.clickStuckLastY,
      );
      this.clickStuckLastX = this.player.x;
      this.clickStuckLastY = this.player.y;
      if (isClickMoveStuck({ active: true, movedDist: moved, stuckThreshold: CLICK_STUCK_MOVE_PX })) {
        this.clickStuckMs += Math.max(0,this.scene.game.loop.delta);
        if (this.clickStuckMs >= CLICK_STUCK_MS) {
          this.clearClickMove({ fade: true, reason: 'stuck' });
          const cb = this.scene.registry.get('callbacks') as GameRegistryCallbacks | undefined;
          cb?.onCombatFeedback?.('Путь заблокирован');
        }
      } else {
        this.clickStuckMs = 0;
      }
    }

    if (this.mounted) {
      // Визуал — только цельный mount+rider; тело/оверлеи скрыты
      this.player.anims.stop();
      this.player.setVisible(false);
    } else if (moving && this.movedLastStep && !attacking) {
      this.player.setVisible(true);
      const walk = playerWalkAnimKey(this.race, this.facing, this.gender);
      const fallback = playerAnimKey(this.race, 'walk', this.gender);
      const key = this.scene.anims.exists(walk) ? walk : fallback;
      if (this.player.anims.currentAnim?.key !== key) this.player.play(key, true);
    } else if (!attacking && this.fsm.state !== 'hurt') {
      this.player.setVisible(true);
      const idle = playerIdleAnimKey(this.race, this.facing, this.gender);
      if (this.player.anims.currentAnim?.key !== idle) this.player.play(idle, true);
    }

    this.syncCloak();
    this.syncShield();
    this.syncWeapon();
    this.syncMount();
    const walkingPose = (moving || dashing) && this.movedLastStep && !attacking && this.fsm.state !== 'hurt';
    const cadence = walkingPose ? walkCadence(speed * Math.min(1,Math.hypot(vx,vy)),this.mounted?180:120) : 1;
    for (const sprite of [this.player,this.cloak,this.shield,this.weapon,this.mount]) {
      if (sprite?.anims) sprite.anims.timeScale = cadence;
    }
    if ((this.scene.game.loop.frame & 1) === 0) syncEntityShadow(this.player);
    this.updateFrenzyAura();

    const depth = entityDepth(this.player.y);
    this.player.setDepth(depth);
    if (this.mounted) {
      this.mount?.setDepth(depth);
    } else {
      this.mount?.setDepth(depth - 0.002);
      const cloakFront =
        this.facing === 'up' || this.facing === 'up-left' || this.facing === 'up-right';
      if (this.cloak?.visible) {
        this.cloak.setDepth(depth + (cloakFront ? 0.0003 : -0.001));
      }
      const weaponBehind = this.facing === 'up' || this.facing === 'up-left' || this.facing === 'up-right';
      this.weapon?.setDepth(depth + (weaponBehind ? -0.0005 : 0.0005));
      this.shield?.setDepth(depth + (weaponBehind ? -0.0003 : 0.001));
    }
    if (this.frenzyAura) this.frenzyAura.setDepth(depth - 0.002);
    if (this.dualAura) this.dualAura.setDepth(depth - 0.002);
  }

  refreshMount(save: PlayerSave, stats?: PlayerStats): void {
    this.motionSave=save;
    this.race = save.race;
    this.gender = save.gender === 'female' ? 'female' : 'male';
    this.syncMountRuntime(save, stats);
    if (save.hp <= 0 || this.fsm.isDead) {
      this.clearMountVisual();
      return;
    }
    const mounted = Boolean(save.mount?.ownedId && save.mount?.mounted);
    if (mounted !== this.mounted && (this.isDashing || this.isCharging)) {
      this.fsm.force('idle'); this.dashEndsAt = 0; this.chargeHitPending = false;
      this.pendingDashTowardClick = false; this.player.setAlpha(1);
    }
    if (mounted !== this.mounted) {
      // A mount HTTP response is a past checkpoint, not a movement correction.
      // Preserve the current predicted pose unless the larger body no longer fits.
      const world = this.collisionWorld();
      if (world?.blocked(this.x, this.y) && Number.isFinite(save.worldX) && Number.isFinite(save.worldY) && !world.blocked(save.worldX!, save.worldY!)) {
        this.setPosition(save.worldX!, save.worldY!, { preserveNavigation: true });
      }
    }
    this.mounted = mounted;
    this.chargeSpeed = DEFAULT_CHARGE_SPEED;
    this.chargeDurationMs = DEFAULT_CHARGE_DURATION;
    this.chargeCooldownMs = 2000;
    const def = getMountDef(this.ownedMountId);
    if (def) {
      this.chargeSpeed = def.chargeSpeed || DEFAULT_CHARGE_SPEED;
      this.chargeDurationMs = def.chargeDurationMs || DEFAULT_CHARGE_DURATION;
      this.chargeCooldownMs = def.chargeCooldownMs || 2000;
    }
    if (mounted && stats?.mountChargeRemainingMs) this.nextBurstAt = Math.max(this.nextBurstAt,this.scene.time.now+stats.mountChargeRemainingMs);
    if (!this.mounted) {
      this.clearMountVisual();
      return;
    }
    const look = mountedLookFromSave(save, stats);
    const needRebuild = !this.mountLook || !looksEqual(this.mountLook, look);
    this.mountLook = look;
    registerMountedLook(this.scene, look);
    const row = facingRow(this.facing);
    const frame = mountedFrameName(look, row, 0);
    if (!this.mount) {
      this.mount = this.scene.add.sprite(
        this.player.x,
        this.player.y + MOUNT_BODY_OFFSET_Y,
        MOUNT_ATLAS_KEY,
        frame,
      );
      this.mount.setOrigin(0.5, 0.55);
      setupSpriteDisplay(this.mount);
      this.mount.setDisplaySize(DISPLAY_SIZE * MOUNT_DISPLAY, DISPLAY_SIZE * MOUNT_DISPLAY);
    } else if (needRebuild || this.mount.texture.key !== MOUNT_ATLAS_KEY) {
      this.mount.setTexture(MOUNT_ATLAS_KEY, frame);
    }
    this.mount.setVisible(true);
    this.player.setVisible(false);
    this.player.anims.stop();
    this.cloak?.setVisible(false);
    this.weapon?.setVisible(false);
    this.shield?.setVisible(false);
    this.syncMount(true);
  }

  isMounted(): boolean {
    return this.mounted;
  }

  getMountStaminaHud(): {
    owned: boolean;
    mounted: boolean;
    stamina: number;
    max: number;
    canRun: boolean;
    carryWeightKg: number;
  } | null {
    if (!this.ownedMountId) return null;
    return {
      owned: true,
      mounted: this.mounted,
      stamina: this.mountStamina,
      max: MOUNT_STAMINA_MAX,
      canRun: mountCanRun(this.mountStamina),
      carryWeightKg: this.carryWeightKg,
    };
  }

  getPlayerStaminaHud(): {
    stamina: number;
    max: number;
    canRun: boolean;
    carryWeightKg: number;
  } {
    return {
      stamina: this.playerStamina,
      max: PLAYER_STAMINA_MAX,
      canRun: playerCanRun(this.playerStamina),
      carryWeightKg: this.carryWeightKg,
    };
  }

  /** Сервер списал выносливость за удар — подтянуть локальный бар. */
  adoptCombatStamina(stamina: number): void {
    this.playerStamina = clampPlayerStamina(stamina);
    this.playerStaminaDirty = false;
  }

  takeMountStaminaSync(now = this.scene.time.now): number | null {
    if (!this.ownedMountId || !this.mountStaminaDirty) return null;
    if (!this.mountStaminaSyncForce && now - this.lastMountStaminaSyncAt < STAMINA_SYNC_MS) {
      return null;
    }
    this.lastMountStaminaSyncAt = now;
    this.mountStaminaDirty = false;
    this.mountStaminaSyncForce = false;
    return Math.round(this.mountStamina);
  }

  takePlayerStaminaSync(now = this.scene.time.now): number | null {
    if (!this.playerStaminaDirty) return null;
    if (!this.playerStaminaSyncForce && now - this.lastPlayerStaminaSyncAt < STAMINA_SYNC_MS) {
      return null;
    }
    this.lastPlayerStaminaSyncAt = now;
    this.playerStaminaDirty = false;
    this.playerStaminaSyncForce = false;
    return Math.round(this.playerStamina);
  }

  adoptAuthoritativeVitals(save: PlayerSave, stats: PlayerStats): void {
    this.playerStamina = clampPlayerStamina(save.stamina ?? stats.stamina ?? PLAYER_STAMINA_MAX);
    this.mountStamina = clampMountStamina(save.mount?.stamina ?? stats.mountStamina ?? MOUNT_STAMINA_MAX);
    this.lastVitalsTickAt = this.scene.time.now;
  }

  private syncMountRuntime(save: PlayerSave, stats?: PlayerStats): void {
    const owned = save.mount?.ownedId ?? null;
    // Save is source of truth — stats.mounted:false must not wipe a mounted save via `??`.
    const mountedFlag = Boolean(owned && save.mount?.mounted);
    const key = `${owned ?? ''}:${mountedFlag ? 1 : 0}`;
    const adoptMountStamina = key !== this.mountRuntimeKey || this.lastVitalsTickAt === 0;
    this.mountRuntimeKey = key;
    this.ownedMountId = owned;
    this.race = save.race;
    this.horse = horseFromDef(getMountDef(this.ownedMountId));
    if (typeof stats?.footSpeed === 'number' && stats.footSpeed > 0) {
      this.footSpeed = stats.footSpeed;
    } else if (!mountedFlag && typeof stats?.speed === 'number' && stats.speed > 0) {
      // On foot only: never adopt pre-scaled mounted stats.speed as foot base.
      this.footSpeed = stats.speed;
    }
    if (typeof stats?.carryWeightKg === 'number') {
      this.carryWeightKg = stats.carryWeightKg;
    }
    if (adoptMountStamina) {
      if (typeof stats?.mountStamina === 'number') {
        this.mountStamina = clampMountStamina(stats.mountStamina);
      } else if (typeof save.mount?.stamina === 'number') {
        this.mountStamina = clampMountStamina(save.mount.stamina);
      } else if (!this.ownedMountId) {
        this.mountStamina = MOUNT_STAMINA_MAX;
      }
      this.mountStaminaDirty = false;
      this.lastVitalsTickAt = this.scene.time.now;
    }
    if (!this.playerStaminaInited) {
      if (typeof stats?.stamina === 'number') {
        this.playerStamina = clampPlayerStamina(stats.stamina);
      } else if (typeof save.stamina === 'number') {
        this.playerStamina = clampPlayerStamina(save.stamina);
      } else {
        this.playerStamina = PLAYER_STAMINA_MAX;
      }
      this.playerStaminaInited = true;
      this.playerStaminaDirty = false;
    }
  }

  private currentMoveSpeed(stats: PlayerStats): number {
    const factor=stats.movementSpeedMult??1;
    // Prefer cached foot base — never use stats.speed while mounted (already stamina-scaled).
    const base =
      this.footSpeed > 0
        ? this.footSpeed
        : typeof stats.footSpeed === 'number' && stats.footSpeed > 0
          ? stats.footSpeed
          : stats.speed;
    if (this.mounted) {
      return Math.max(
        1,
        Math.floor(Math.floor(mountedMoveSpeed(base, this.mountStamina, this.horse, this.carryWeightKg))*factor),
      );
    }
    return Math.max(
      1,
      Math.floor(Math.floor(footMoveSpeed(base, this.playerStamina, this.carryWeightKg, this.race))*factor),
    );
  }

  private tickVitals(now: number, moving: boolean, intensity = 1): void {
    const prev = this.lastVitalsTickAt || now;
    const dtSec = Math.max(0, Math.min(0.25, (now - prev) / 1000));
    this.lastVitalsTickAt = now;
    if (dtSec <= 0) return;

    if (this.ownedMountId) {
      const canRun = this.mountStamina > MOUNT_STAMINA_WALK_CAP;
      const running = this.mounted && moving && canRun && intensity > 0.55;
      const nextMount = advanceMountStamina({
        stamina: this.mountStamina,
        dtSec,
        mounted: this.mounted,
        moving: this.mounted && moving,
        running,
        horse: this.horse,
        carryWeightKg: this.carryWeightKg,
      });
      if (Math.floor(nextMount) !== Math.floor(this.mountStamina)) {
        this.mountStaminaDirty = true;
      }
      this.mountStamina = nextMount;
    }

    const canRun = this.playerStamina > PLAYER_STAMINA_WALK_CAP;
    const running = !this.mounted && moving && canRun && intensity > 0.58;
    const nextPlayer = advancePlayerStamina({
      stamina: this.playerStamina,
      dtSec,
      onFoot: !this.mounted,
      moving: !this.mounted && moving,
      running,
      carryWeightKg: this.carryWeightKg,
      race: this.race,
    });
    if (Math.floor(nextPlayer) !== Math.floor(this.playerStamina)) {
      this.playerStaminaDirty = true;
    }
    this.playerStamina = nextPlayer;
  }

  private applyChargeStaminaPulse(): void {
    if (!this.ownedMountId) return;
    this.mountStamina = advanceMountStamina({
      stamina: this.mountStamina,
      dtSec: 0,
      mounted: true,
      moving: true,
      running: true,
      horse: this.horse,
      carryWeightKg: this.carryWeightKg,
      chargePulse: true,
    });
    this.mountStaminaDirty = true;
    this.mountStaminaSyncForce = true;
  }

  private ensureClickMoveMarker(): void {
    if (this.clickMoveMarker?.active) return;
    this.clickMoveMarker = this.scene.add
      .circle(0, 0, 10, 0x7ec8ff, 0.35)
      .setStrokeStyle(2, 0xb8e0ff, 0.9)
      .setDepth(Depth.EntityMark)
      .setVisible(false);
  }

  private showClickMarker(x: number, y: number, alpha: number): void {
    this.ensureClickMoveMarker();
    const marker = this.clickMoveMarker!;
    this.scene.tweens.killTweensOf(marker);
    this.clickMovePulse?.stop();
    marker.setPosition(x, y).setVisible(true).setAlpha(alpha).setScale(1);
    this.clickMovePulse = this.scene.tweens.add({
      targets: marker,
      scale: 1.35,
      alpha: Math.max(0.25, alpha * 0.4),
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private applyDashStaminaPulse(): void {
    this.playerStamina = advancePlayerStamina({
      stamina: this.playerStamina,
      dtSec: 0,
      onFoot: true,
      moving: true,
      running: true,
      carryWeightKg: this.carryWeightKg,
      race: this.race,
      dashPulse: true,
    });
    this.playerStaminaDirty = true;
    this.playerStaminaSyncForce = true;
  }

  private scheduleAlphaRestore(ms: number): void {
    this.cancelAlphaRestore();
    this.alphaRestoreEvent = this.scene.time.delayedCall(ms, () => {
      this.alphaRestoreEvent = undefined;
      if (this.player?.active) this.player.setAlpha(1);
    });
  }

  private cancelAlphaRestore(): void {
    try {
      this.alphaRestoreEvent?.remove(false);
    } catch {
      /* ignore */
    }
    this.alphaRestoreEvent = undefined;
  }

  private restoreDismountVisual(): void {
    this.player.setVisible(true);
    this.player.setCrop();
    setupSpriteDisplay(this.player);
    const row = facingRow(this.facing);
    if (this.cloakVariant && this.cloak) {
      this.cloak.setTexture(
        cloakTextureKey(this.cloakVariant, row),
        cloakFrameName(this.cloakVariant, row, 0),
      );
      this.cloak.setCrop();
      this.cloak.setOrigin(0.5, 0.55);
      if (this.cloak.frame) {
        this.cloak.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE);
      }
      this.cloak.setVisible(true);
    }
    if (this.weaponKind && this.weapon) {
      this.weapon.setTexture(
        weaponTextureKey(this.weaponKind, row),
        weaponFrameName(this.weaponKind, row, 0),
      );
      this.weapon.setVisible(true);
    }
    if (this.shieldVariant && this.shield) {
      this.shield.setTexture(
        shieldTextureKey(this.shieldVariant),
        shieldFrameName(this.shieldVariant, 0),
      );
      this.shield.setVisible(true);
    }
  }

  refreshCloak(save: PlayerSave): void {
    const variant = cloakVariantForItem(save.equipment.cloak);
    if (!variant) {
      this.cloak?.setVisible(false);
      this.cloakVariant = null;
      return;
    }
    registerCloakOverlay(this.scene, variant);
    const row = facingRow(this.facing);
    const frame = cloakFrameName(variant, row, 0);
    const tex = cloakTextureKey(variant, row);
    if (!this.cloak || this.cloakVariant !== variant) {
      this.cloak?.destroy();
      this.cloak = this.scene.add.sprite(this.player.x, this.player.y, tex, frame);
      this.cloak.setOrigin(0.5, 0.55);
      setupSpriteDisplay(this.cloak);
      this.cloakVariant = variant;
    } else {
      this.cloak.setTexture(tex, frame);
    }
    this.cloak.setVisible(!this.mounted);
    this.syncCloak(true);
  }

  refreshShield(save: PlayerSave): void {
    const variant = shieldVariantForItem(save.equipment.shield);
    if (!variant || !save.equipment.shield) {
      this.shield?.setVisible(false);
      this.shieldVariant = null;
      return;
    }
    registerShieldOverlay(this.scene, variant);
    const tex = shieldTextureKey(variant);
    const frame = shieldFrameName(variant, 0);
    if (!this.shield || this.shieldVariant !== variant) {
      this.shield?.destroy();
      this.shield = this.scene.add.sprite(this.player.x, this.player.y, tex, frame);
      this.shield.setOrigin(0.5, 0.55);
      setupSpriteDisplay(this.shield);
      this.shield.setDepth(11);
      this.shieldVariant = variant;
    } else {
      this.shield.setTexture(tex, frame);
    }
    // Atlas may have been repacked — keep cloak on a live texture.
    if (this.cloak && this.cloakVariant) {
      const row = facingRow(this.facing);
      this.cloak.setTexture(
        cloakTextureKey(this.cloakVariant, row),
        cloakFrameName(this.cloakVariant, row, 0),
      );
    }
    this.shield.setVisible(!this.mounted);
    this.syncShield(true);
  }

  refreshWeapon(save: PlayerSave, stats: PlayerStats): void {
    const kind = weaponOverlayForSave(
      Boolean(save.equipment.weapon),
      stats.rangedWeapon,
      stats.rangedKind,
    );
    if (!kind) {
      this.weapon?.setVisible(false);
      this.weaponKind = null;
      return;
    }
    registerWeaponOverlay(this.scene, kind);
    const row = facingRow(this.facing);
    const tex = weaponTextureKey(kind, row);
    const frame = weaponFrameName(kind, row, 0);
    if (!this.weapon || this.weaponKind !== kind) {
      this.weapon?.destroy();
      this.weapon = this.scene.add.sprite(this.player.x, this.player.y, tex, frame);
      this.weapon.setOrigin(0.5, 0.55);
      setupSpriteDisplay(this.weapon);
      this.weaponKind = kind;
    } else {
      this.weapon.setTexture(tex, frame);
    }
    if (this.cloak && this.cloakVariant) {
      this.cloak.setTexture(
        cloakTextureKey(this.cloakVariant, row),
        cloakFrameName(this.cloakVariant, row, 0),
      );
    }
    if (this.shield && this.shieldVariant) {
      this.shield.setTexture(
        shieldTextureKey(this.shieldVariant),
        shieldFrameName(this.shieldVariant, 0),
      );
    }
    this.weapon.setVisible(!this.mounted);
    this.syncWeapon(true);
  }

  private syncCloak(force = false): void {
    if (!this.cloakVariant || !this.cloak) return;
    if (this.mounted) {
      this.cloak.setVisible(false);
      return;
    }
    this.cloak.setVisible(true);
    const row = facingRow(this.facing);
    this.cloak.setPosition(this.player.x, this.player.y);
    if (force || this.cloak.displayWidth !== DISPLAY_SIZE) {
      this.cloak.setCrop();
      this.cloak.setOrigin(0.5, 0.55);
      if (this.cloak.frame) {
        this.cloak.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE);
      }
    }
    this.cloak.setFlipX(this.player.flipX);
    this.cloak.setAlpha(this.player.alpha);
    const cloakAnim = playerAnimToCloakAnim(
      this.player.anims.currentAnim?.key ?? playerAnimKey(this.race, 'idle', this.gender),
      this.cloakVariant,
      row,
    );
    if (force || this.cloak.anims.currentAnim?.key !== cloakAnim) {
      if (this.scene.anims.exists(cloakAnim)) this.cloak.play(cloakAnim, true);
    }
  }

  private syncShield(force = false): void {
    if (!this.shieldVariant || !this.shield) return;
    if (this.mounted) {
      this.shield.setVisible(false);
      return;
    }
    this.shield.setVisible(true);
    this.shield.setPosition(this.player.x, this.player.y);
    this.shield.setFlipX(this.player.flipX);
    this.shield.setAlpha(this.player.alpha);
    const playerAnim = this.player.anims.currentAnim?.key ?? playerAnimKey(this.race, 'idle', this.gender);
    const shieldAnim = playerAnimToShieldAnim(playerAnim, this.shieldVariant);
    if (force || this.shield.anims.currentAnim?.key !== shieldAnim) {
      if (this.scene.anims.exists(shieldAnim)) this.shield.play(shieldAnim, true);
    }
  }

  private syncWeapon(force = false): void {
    if (!this.weaponKind || !this.weapon) return;
    if (this.mounted) {
      this.weapon.setVisible(false);
      return;
    }
    this.weapon.setVisible(true);
    this.weapon.setPosition(this.player.x, this.player.y);
    this.weapon.setFlipX(this.player.flipX);
    this.weapon.setAlpha(this.player.alpha);
    const playerAnim = this.player.anims.currentAnim?.key ?? playerAnimKey(this.race, 'idle', this.gender);
    const weaponAnim = playerAnimToWeaponAnim(playerAnim, this.weaponKind, facingRow(this.facing));
    if (force || this.weapon.anims.currentAnim?.key !== weaponAnim) {
      if (this.scene.anims.exists(weaponAnim)) this.weapon.play(weaponAnim, true);
    }
  }

  private syncMount(force = false): void {
    if (!this.mount?.visible || !this.mountLook) return;
    const row = facingRow(this.facing);
    if (this.mount.texture.key !== MOUNT_ATLAS_KEY) {
      this.mount.setTexture(MOUNT_ATLAS_KEY, mountedFrameName(this.mountLook, row, 0));
    }
    this.mount.setPosition(this.player.x, this.player.y + MOUNT_BODY_OFFSET_Y);
    this.mount.setFlipX(this.player.flipX);
    this.mount.setAlpha(this.player.alpha);
    if (force || this.mount.displayWidth !== DISPLAY_SIZE * MOUNT_DISPLAY) {
      this.mount.setDisplaySize(DISPLAY_SIZE * MOUNT_DISPLAY, DISPLAY_SIZE * MOUNT_DISPLAY);
      this.mount.setOrigin(0.5, 0.55);
    }

    // Horse coloration is baked into its palette; preserve rider and equipment colors.
    this.mount.clearTint();

    const attacking = this.scene.time.now < this.attackLockUntil;
    if (attacking) {
      const atk = mountedAnimKey(this.mountLook, 'attack', row);
      if (force || this.mount.anims.currentAnim?.key !== atk) {
        if (this.scene.anims.exists(atk)) this.mount.play(atk, true);
      }
      return;
    }

    const moving = this.movedLastStep && (this.fsm.state === 'move' || this.fsm.state === 'charge' || this.fsm.state === 'dash');
    const anim = mountedAnimKey(this.mountLook, moving ? 'walk' : 'idle', row);
    if (force || this.mount.anims.currentAnim?.key !== anim) {
      if (this.scene.anims.exists(anim)) this.mount.play(anim, true);
    }
  }

  applyMadDualist(result: {
    madDualistProc?: boolean;
    madDualistActive?: boolean;
    madDualistRemainingMs?: number;
  }, onFeedback?: (t: string) => void): void {
    const rem = result.madDualistRemainingMs ?? 0;
    const now = this.scene.time.now;
    if (rem > 0) {
      this.dualUntil = now + rem;
      if (!this.dualAura) {
        this.dualAura = this.scene.add
          .circle(this.player.x, this.player.y, 26, 0x8844cc, 0.22)
          .setDepth(9);
      }
    } else if (!result.madDualistActive) {
      this.dualUntil = 0;
    }
    if (result.madDualistProc) {
      // Только на прок: чуть раньше следующий удар + окно контратаки, без сноса стойки каждый хит
      this.lastAttack = Math.min(this.lastAttack, now - 60);
      this.counterUntil = Math.max(this.counterUntil, now + COUNTER_WINDOW_MS);
      this.setInvuln(320);
      onFeedback?.('Безумный дуальщик! Atk.Spd ×2 · двойной удар');
      this.scene.cameras.main.flash(100, 120, 60, 200, false);
    }
  }

  applySwarmFrenzy(result: {
    swarmFrenzyProc?: boolean;
    swarmFrenzyActive?: boolean;
    swarmFrenzyEnemies?: number;
    swarmFrenzyRemainingMs?: number;
  }, onFeedback?: (t: string) => void): void {
    const rem = result.swarmFrenzyRemainingMs ?? 0;
    const now = this.scene.time.now;
    if (rem > 0) {
      this.frenzyUntil = now + rem;
      if (!this.frenzyAura) {
        this.frenzyAura = this.scene.add
          .circle(this.player.x, this.player.y, 28, 0xaa2233, 0.25)
          .setDepth(9);
      }
    } else if (!result.swarmFrenzyActive) {
      this.frenzyUntil = 0;
    }
    if (result.swarmFrenzyProc) {
      this.lastAttack = Math.min(this.lastAttack, now - 60);
      this.counterUntil = Math.max(this.counterUntil, now + COUNTER_WINDOW_MS);
      const n = result.swarmFrenzyEnemies ?? 4;
      onFeedback?.(`Рой клинков! Скор. атаки / уклон ×${n} · Атк −${n * 10}%`);
      this.scene.cameras.main.flash(120, 180, 40, 40, false);
    }
  }

  private updateFrenzyAura(): void {
    if (this.frenzyAura) {
      if (this.scene.time.now < this.frenzyUntil && this.player.active) {
        this.frenzyAura.setPosition(this.player.x, this.player.y);
        this.frenzyAura.setVisible(true);
        this.frenzyAura.setAlpha(0.2 + Math.sin(this.scene.time.now / 80) * 0.12);
      } else {
        this.frenzyAura.setVisible(false);
      }
    }
    if (this.dualAura) {
      if (this.scene.time.now < this.dualUntil && this.player.active) {
        this.dualAura.setPosition(this.player.x, this.player.y);
        this.dualAura.setVisible(true);
        this.dualAura.setAlpha(0.18 + Math.sin(this.scene.time.now / 70) * 0.1);
      } else {
        this.dualAura.setVisible(false);
      }
    }
  }

  playHurt(): void {
    if (this.fsm.isDead) return;
    const epoch = ++this.hurtPoseEpoch;
    this.fsm.tryEnter('hurt');
    if (!this.mounted) {
      this.player.play(playerAnimKey(this.race, 'hurt', this.gender), true);
    }
    this.scene.time.delayedCall(180, () => {
      if (this.player.active && this.fsm.state === 'hurt' && epoch === this.hurtPoseEpoch) {
        this.fsm.tryEnter('idle');
        if (!this.mounted) {
          this.player.play(playerIdleAnimKey(this.race, this.facing, this.gender), true);
        }
      }
    });
  }

  setInvuln(ms: number): void {
    this.invulnUntil = this.scene.time.now + ms;
  }

  beginDeath(onComplete: () => void): void {
    this.deathTween?.stop();
    const epoch = ++this.deathEpoch;
    this.clearClickMove();
    this.motionFrames=[];this.predictedMotion?.reset(this.getPosition());
    this.fsm.force('dead');
    this.player.setVelocity(0, 0);
    this.clearMountVisual();
    const targets: Phaser.GameObjects.GameObject[] = [this.player];
    if (this.cloak?.visible) targets.push(this.cloak);
    if (this.shield?.visible) targets.push(this.shield);
    if (this.weapon?.visible) targets.push(this.weapon);
    this.deathTween = this.scene.tweens.add({
      targets,
      alpha: 0.25,
      angle: -90,
      duration: 500,
      onComplete: () => { if (epoch === this.deathEpoch && this.fsm.isDead) onComplete(); },
    });
  }

  /** Спрятать коня (смерть / спешивание). */
  clearMountVisual(): void {
    this.mounted = false;
    this.chargeHitPending = false;
    this.mountLook = null;
    this.cancelAlphaRestore();
    if (this.mount) {
      this.mount.anims.stop();
      this.mount.clearTint();
      this.mount.setVisible(false);
      this.mount.setAngle(0).setAlpha(1);
    }
    this.restoreDismountVisual();
  }

  respawn(save: PlayerSave, location: LocationConfig, stats?: PlayerStats): void {
    this.deathEpoch++;
    this.deathTween?.stop();
    this.deathTween = undefined;
    this.dashEndsAt = 0;
    this.chargeHitPending = false;
    this.attackLockUntil = 0;
    for (const visual of [this.player, this.cloak, this.shield, this.weapon]) visual?.setAlpha(1).setAngle(0);
    this.motionSave=save;this.motionFrames=[];this.predictedMotion?.reset(this.getPosition());
    this.fsm.reset();
    this.clearClickMove();
    this.cancelAlphaRestore();
    this.race = save.race;
    this.gender = save.gender === 'female' ? 'female' : 'male';
    const point = Number.isFinite(save.worldX) && Number.isFinite(save.worldY) ? { x: save.worldX!, y: save.worldY! } : location.spawn;
    this.setPosition(point.x, point.y);
    this.player.setActive(true).setVisible(true).setAlpha(1).setScale(1).setAngle(0);
    this.player.setTexture(playerTextureKey(save.race), playerSpriteFrame(save.race, 0, this.gender));
    setupSpriteDisplay(this.player);
    this.player.play(playerAnimKey(this.race, 'idle', this.gender));
    this.refreshCloak(save);
    this.refreshShield(save);
    this.refreshMount(save, stats);
    if (stats) this.refreshWeapon(save, stats);
    this.invulnUntil = this.scene.time.now + 1200;
  }
}
