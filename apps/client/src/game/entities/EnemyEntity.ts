import Phaser from 'phaser';
import { EnemyFsm } from '../fsm/EnemyFsm.js';
import {
  enemyAnimPrefix,
  enemyDisplayScale,
  resolveEnemySprite,
  setupSpriteDisplay,
} from '../../sprites/sprite-loader.js';
import { attachEntityShadow, entityDepth, syncEntityShadow } from '../../sprites/visual-polish.js';
import { SPRITE_SIZE, COMBAT_ATLAS_KEY } from '../../sprites/sprite-factory.js';
import {
  facingFromDelta,
  facingNeedsFlipX,
  facingRow,
  type Facing8,
} from '../../sprites/facing4.js';
import type { EncounterEntitySpawn } from '../scenes/location-types.js';
import { frameRateIndependentLerpFactor } from '../utils/frame-interpolation.js';

const HIT_RADIUS = SPRITE_SIZE.hitRadius;

const DIFFICULTY_COLOR: Record<string, string> = {
  gray: '#888888',
  trivial: '#aaaaaa',
  easy: '#88cc88',
  normal: '#e8e8e8',
  hard: '#ffaa44',
  very_hard: '#ff6666',
};

function enemyHpColor(type: string): number {
  switch (type) {
    case 'shadow_thug':
    case 'cave_stalker':
    case 'shadow_overlord':
      return 0x8844cc;
    case 'forest_wolf':
      return 0xcc8844;
    case 'cinder_imp':
      return 0xff6622;
    case 'bone_walker':
    case 'deep_wraith':
      return 0xccccaa;
    case 'orc_grunt':
      return 0xcc3333;
    case 'field_scavenger':
      return 0xaa8844;
    default:
      return 0xcc4444;
  }
}

/**
 * Pooled arcade enemy with HUD children owned by this instance.
 * Group instantiates via (scene, x, y, texture, frame).
 */
export class EnemyEntity extends Phaser.Physics.Arcade.Sprite {
  entityId = '';
  enemyType = '';
  enemyLevel = 1;
  questEnemy = false;
  readonly fsm = new EnemyFsm();
  private hp = 0;
  private maxHp = 0;
  private moveSpeed = 85;
  private displayScale = 1;
  private hpBarBg?: Phaser.GameObjects.Rectangle;
  private hpBarFg?: Phaser.GameObjects.Rectangle;
  private lvlText?: Phaser.GameObjects.Text;
  private questMark?: Phaser.GameObjects.Text;
  private barW = 34;
  private lastHitAt = 0;
  private bleedTimer?: Phaser.Time.TimerEvent;
  private aiFrame = 0;
  private serverX = 0;
  private serverY = 0;
  private serverMoving = false;
  private serverFacing: 'left' | 'right' = 'right';
  private hasServerPose = false;
  private lastServerAt = 0;
  private facing: Facing8 = 'down';
  /** ComfyUI sheet: 1-dir + flipX only (no 8-way walk rows). */
  private artBased = false;
  private lastDepthBucket = Number.NaN;
  private lastHpRatio = -1;
  /** Контроль с сервера: stun не бьёт игрока, pin — медленнее. */
  control?: 'pin' | 'stun';

  private setShadowVisible(visible: boolean): void {
    const shadow = this.getData('dropShadow') as Phaser.GameObjects.Ellipse | undefined;
    shadow?.setVisible(visible);
  }

  private isOnCamera(): boolean {
    const cam = this.scene.cameras.main;
    const pad = 64;
    return (
      this.x >= cam.worldView.x - pad &&
      this.x <= cam.worldView.right + pad &&
      this.y >= cam.worldView.y - pad &&
      this.y <= cam.worldView.bottom + pad
    );
  }

  /** On-camera (or dying) — needs full presentation every frame. */
  isPresentationHot(): boolean {
    return this.isDying || this.isOnCamera();
  }

  constructor(scene: Phaser.Scene, x: number, y: number, texture = COMBAT_ATLAS_KEY, frame: string | number = 'enemy-goblin-0') {
    super(scene, x, y, texture, frame);
  }

  get isDying(): boolean {
    return this.fsm.isDying;
  }

  getHp(): number {
    return this.hp;
  }

  getMaxHp(): number {
    return this.maxHp;
  }

  getSpeed(): number {
    return this.moveSpeed;
  }

  getLastHitAt(): number {
    return this.lastHitAt;
  }

  setLastHitAt(t: number): void {
    this.lastHitAt = t;
  }

  bumpAiFrame(): number {
    this.aiFrame += 1;
    return this.aiFrame;
  }

  activateFromSpawn(spawn: EncounterEntitySpawn, difficultyKey: string): void {
    this.entityId = spawn.entityId;
    this.enemyType = spawn.type;
    this.enemyLevel = spawn.level;
    this.questEnemy = spawn.quest;
    this.hp = spawn.hp;
    this.maxHp = spawn.maxHp;
    this.moveSpeed = spawn.speed;
    this.displayScale = enemyDisplayScale(spawn.type);
    this.fsm.reset();
    this.lastHitAt = 0;
    this.clearBleed();
    this.serverX = spawn.x;
    this.serverY = spawn.y;
    this.serverMoving = false;
    this.serverFacing = 'right';
    this.hasServerPose = true;
    this.facing = 'down';
    this.lastDepthBucket = Number.NaN;
    this.lastHpRatio = -1;
    this.control = spawn.control;

    const { textureKey, frame } = resolveEnemySprite(this.scene, spawn.type);
    this.artBased = textureKey !== COMBAT_ATLAS_KEY;
    this.setTexture(textureKey, frame);
    this.enableBody(true, spawn.x, spawn.y, true, true);
    this.setActive(true).setVisible(true).setAlpha(1).setScale(1).setAngle(0);
    this.setCircle(HIT_RADIUS * this.displayScale);
    this.setDepth(10);
    this.setVelocity(0, 0);
    setupSpriteDisplay(this, this.displayScale);

    if (!this.getData('dropShadow')) {
      attachEntityShadow(this.scene, this, 26 * this.displayScale, 11 * this.displayScale, 0.28);
    } else {
      this.setShadowVisible(true);
    }

    this.ensureHud(difficultyKey);
    this.syncHud();
    const prefix = enemyAnimPrefix(spawn.type);
    if (this.scene.anims.exists(`${prefix}-idle`)) {
      this.play(`${prefix}-idle`);
    }
    this.refreshTint();
  }

  private ensureHud(difficultyKey: string): void {
    this.barW = Math.floor(34 * this.displayScale);
    if (!this.hpBarBg) {
      this.hpBarBg = this.scene.add.rectangle(this.x, this.y - 26, this.barW, 5, 0x222222, 0.9).setDepth(12);
      this.hpBarFg = this.scene.add
        .rectangle(this.x, this.y - 26, this.barW, 5, enemyHpColor(this.enemyType), 0.95)
        .setDepth(13);
      this.lvlText = this.scene.add
        .text(this.x, this.y - 40, '', { color: '#e8e8e8', fontSize: '11px', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(13);
    }
    this.hpBarBg!.setVisible(true);
    this.hpBarFg!.setVisible(true).setFillStyle(enemyHpColor(this.enemyType), 0.95);
    this.lvlText!.setVisible(true)
      .setColor(DIFFICULTY_COLOR[difficultyKey] ?? '#e8e8e8')
      .setText(`Lv.${this.enemyLevel}`);

    if (this.questEnemy) {
      if (!this.questMark) {
        this.questMark = this.scene.add
          .text(this.x + 14, this.y - 40, '!', { color: '#ffcc44', fontSize: '12px', fontStyle: 'bold' })
          .setDepth(14);
      }
      this.questMark.setVisible(true);
    } else {
      this.questMark?.setVisible(false);
    }
  }

  syncHud(): void {
    if (!this.hpBarBg || !this.hpBarFg) return;
    const depthBucket = (this.y / 4) | 0;
    if (depthBucket !== this.lastDepthBucket) {
      this.lastDepthBucket = depthBucket;
      const d = entityDepth(this.y);
      this.setDepth(d);
      this.hpBarBg.setDepth(d + 2);
      this.hpBarFg.setDepth(d + 3);
      this.lvlText?.setDepth(d + 3);
      this.questMark?.setDepth(d + 4);
    }
    this.hpBarBg.setPosition(this.x, this.y - 26);
    const ratio = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
    if (ratio !== this.lastHpRatio) {
      this.lastHpRatio = ratio;
      this.hpBarFg.width = this.barW * ratio;
    }
    this.hpBarFg.setPosition(this.x - this.barW / 2 + (this.barW * ratio) / 2, this.y - 26);
    this.lvlText?.setPosition(this.x, this.y - 40);
    this.questMark?.setPosition(this.x + 14, this.y - 40);
    if ((this.scene.game.loop.frame & 1) === 0) syncEntityShadow(this);
  }

  applyHp(hp: number): void {
    this.hp = Math.max(0, hp);
    this.syncHud();
  }

  applyServerState(state: {
    x: number;
    y: number;
    hp: number;
    moving: boolean;
    facing: 'left' | 'right';
    speed?: number;
    control?: 'pin' | 'stun';
  }): void {
    if (this.isDying) return;
    this.serverX = state.x;
    this.serverY = state.y;
    this.serverMoving = state.moving;
    this.serverFacing = state.facing;
    this.hasServerPose = true;
    this.lastServerAt = this.scene.time.now;
    if (typeof state.speed === 'number' && Number.isFinite(state.speed)) {
      this.moveSpeed = state.speed;
    }
    this.control = state.control;
    this.refreshTint();
    // Don't raise HP while local bleed is ticking (server HP lags until bleed-kill).
    if (state.hp < this.hp || !this.bleedTimer) {
      this.applyHp(state.hp);
    }
  }

  setAiState(next: 'idle' | 'chase'): void {
    if (this.fsm.state === next) return;
    if (!this.fsm.tryEnter(next)) return;
    this.refreshTint();
  }

  private refreshTint(): void {
    if (this.control === 'stun') this.setTint(0xffee66);
    else if (this.control === 'pin') this.setTint(0x77ccee);
    else if (this.fsm.state === 'chase') this.setTint(0xffaaaa);
    else this.clearTint();
  }

  /**
   * Презентация моба: всегда от серверного pose + экстраполяция chase.
   * Нельзя «свободно» бежать от локальной позиции — после combat HTTP
   * снапшот догоняет и вся пачка отскакивает от игрока.
   */
  tickPresentation(playerX: number, playerY: number, dtMs: number): void {
    this.setVelocity(0, 0);
    const onCam = this.isOnCamera();
    if (this.isDying) {
      if (onCam) this.syncHud();
      return;
    }

    const stopRange = 24;
    const aggroRange = 720;
    const stopRangeSq = stopRange * stopRange;
    const aggroRangeSq = aggroRange * aggroRange;
    const dt = Math.min(Math.max(0, dtMs), 100);

    if (this.control === 'stun' && this.hasServerPose) {
      this.setPosition(this.serverX, this.serverY);
      this.setAiState('idle');
      this.playIdleOrWalk(false);
      if (onCam) this.syncHud();
      return;
    }

    if (!this.hasServerPose) {
      // Ещё ни одного снапшота — редкий fallback
      const dx = playerX - this.x;
      const dy = playerY - this.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < aggroRangeSq && distSq > stopRangeSq) {
        const dist = Math.sqrt(distSq) || 1;
        const step = (this.moveSpeed * dt) / 1000;
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        this.facing = facingFromDelta(dx, dy) ?? this.facing;
        this.setAiState('chase');
        this.playIdleOrWalk(true);
      } else {
        this.setAiState('idle');
        this.playIdleOrWalk(false);
      }
      if (onCam) this.syncHud();
      return;
    }

    const snapshotAge = Math.max(0, this.scene.time.now - this.lastServerAt);
    // Экстраполяция от serverX/Y (не от локального x/y) — лид ограничен age×speed.
    let tx = this.serverX;
    let ty = this.serverY;
    const toPlayerX = playerX - tx;
    const toPlayerY = playerY - ty;
    const toPlayerDistSq = toPlayerX * toPlayerX + toPlayerY * toPlayerY;
    const toPlayerDist = Math.sqrt(toPlayerDistSq) || 1;
    const chasing = this.serverMoving || toPlayerDistSq > stopRangeSq;

    if (chasing && toPlayerDist > stopRange) {
      const ageSec = Math.min(snapshotAge, 350) / 1000;
      const travel = Math.min(this.moveSpeed * ageSec, toPlayerDist - stopRange);
      tx += (toPlayerX / toPlayerDist) * travel;
      ty += (toPlayerY / toPlayerDist) * travel;
    }

    const errX = tx - this.x;
    const errY = ty - this.y;
    const errSq = errX * errX + errY * errY;
    if (errSq > 160 * 160) {
      this.setPosition(tx, ty);
    } else if (errSq > 1) {
      const followFactor = frameRateIndependentLerpFactor(0.22, dt);
      const nx = Phaser.Math.Linear(this.x, tx, followFactor);
      const ny = Phaser.Math.Linear(this.y, ty, followFactor);
      const curDx = playerX - this.x;
      const curDy = playerY - this.y;
      const newDx = playerX - nx;
      const newDy = playerY - ny;
      const curDistSq = curDx * curDx + curDy * curDy;
      const newDistSq = newDx * newDx + newDy * newDy;
      // Никогда не увеличиваем дистанцию до игрока в chase — это и есть «отброс пачки».
      if (!(chasing && curDistSq < aggroRangeSq && newDistSq > curDistSq + 0.3)) {
        this.x = nx;
        this.y = ny;
      }
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const distSq = dx * dx + dy * dy;
    const showChase = chasing || distSq > stopRangeSq;
    if (showChase) {
      this.facing =
        facingFromDelta(dx, dy) ?? (this.serverFacing === 'left' ? 'left' : 'right');
    } else {
      this.facing = this.serverFacing === 'left' ? 'left' : 'right';
    }
    this.setAiState(showChase ? 'chase' : 'idle');
    this.playIdleOrWalk(showChase);

    if (onCam) {
      this.syncHud();
    }
  }

  private applyFacingFlip(): void {
    if (this.artBased) {
      this.setFlipX(this.facing === 'left');
      return;
    }
    this.setFlipX(facingNeedsFlipX(this.facing));
  }

  /** @deprecated use tickPresentation */
  syncFromServer(): void {
    this.tickPresentation(this.x, this.y, 16);
  }

  playHurt(): void {
    this.flashHurt();
  }

  /** Красная вспышка без смены анимации — walk/chase не прерывается. */
  flashHurt(): void {
    if (!this.active || this.isDying) return;
    this.setTint(0xff6666);
    this.scene.time.delayedCall(90, () => {
      if (!this.active || this.isDying) return;
      this.refreshTint();
    });
  }

  playIdleOrWalk(chasing: boolean): void {
    if (this.isDying) return;
    this.applyFacingFlip();
    const prefix = enemyAnimPrefix(this.enemyType);
    if (chasing && !this.artBased) {
      const dirKey = `${prefix}-walk-${facingRow(this.facing)}`;
      if (this.scene.anims.exists(dirKey)) {
        if (this.anims.currentAnim?.key !== dirKey) this.play(dirKey, true);
        return;
      }
    }
    const key = chasing ? `${prefix}-walk` : `${prefix}-idle`;
    if (this.anims.currentAnim?.key !== key && this.scene.anims.exists(key)) {
      this.play(key, true);
    }
  }

  beginDeath(onRecycled: (e: EnemyEntity) => void): void {
    if (this.fsm.isDying) return;
    this.fsm.force('dying');
    this.clearBleed();
    this.setVelocity(0, 0);
    this.clearTint();
    this.hideHud();
    // Disable hits immediately so corpse can't spam enemy-hit while tweening.
    this.disableBody(true, false);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scale: 0.1,
      angle: Phaser.Math.Between(-40, 40),
      duration: 340,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.fsm.force('dead');
        onRecycled(this);
      },
    });
  }

  hideHud(): void {
    this.hpBarBg?.setVisible(false);
    this.hpBarFg?.setVisible(false);
    this.lvlText?.setVisible(false);
    this.questMark?.setVisible(false);
  }

  setBleedTimer(timer: Phaser.Time.TimerEvent): void {
    this.clearBleed();
    this.bleedTimer = timer;
  }

  clearBleed(): void {
    this.bleedTimer?.remove(false);
    this.bleedTimer = undefined;
  }

  recycle(): void {
    this.clearBleed();
    this.control = undefined;
    this.hideHud();
    this.setShadowVisible(false);
    this.setVelocity(0, 0);
    this.disableBody(true, true);
    this.setActive(false).setVisible(false);
    this.entityId = '';
    this.fsm.force('dead');
  }

  /** Full destroy of HUD when scene tears down. */
  destroyHud(): void {
    this.clearBleed();
    this.hpBarBg?.destroy();
    this.hpBarFg?.destroy();
    this.lvlText?.destroy();
    this.questMark?.destroy();
    this.hpBarBg = undefined;
    this.hpBarFg = undefined;
    this.lvlText = undefined;
    this.questMark = undefined;
  }
}
