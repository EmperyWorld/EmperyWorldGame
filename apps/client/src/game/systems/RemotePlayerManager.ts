import { walkCadence } from '../../sprites/walk-cadence.js';
import Phaser from 'phaser';
import type { MultiplayerLocationSnapshot, MultiplayerPlayerPresence } from '../../api.js';
import {
  playerAnimKey,
  playerSpriteFrame,
  playerTextureKey,
  playerWalkAnimKey,
  playerIdleAnimKey,
  registerCombatSprites,
} from '../../sprites/sprite-factory.js';
import { registerMountedLook, mountedFrameName, MOUNT_ATLAS_KEY } from '../../sprites/mounted-sprite.js';
import {
  mountedAnimKey,
  mountedLookFromPresence,
  looksEqual,
  type MountedLook,
} from '../../sprites/mounted-look.js';
import { setupSpriteDisplay, DISPLAY_SIZE } from '../../sprites/sprite-loader.js';
import { attachEntityShadow, entityDepth, syncEntityShadow } from '../../sprites/visual-polish.js';
import { facingFromDelta, facingNeedsFlipX, facingRow, type Facing8 } from '../../sprites/facing4.js';
import { frameRateIndependentLerpFactor } from '../utils/frame-interpolation.js';

const NAME_COLORS: Record<string, string> = {
  peaceful: '#d8ecff',
  flagged: '#c88cff',
  chaotic: '#ff6666',
};

const MOUNT_DISPLAY = 1.12;
/** Soft cap — лишние views уничтожаются при release. */
const POOL_CAP = 16;

interface RemotePlayerView {
  sprite: Phaser.GameObjects.Sprite;
  mount: Phaser.GameObjects.Sprite | null;
  mountLook: MountedLook | null;
  label: Phaser.GameObjects.Text;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFg: Phaser.GameObjects.Rectangle;
  selectRing: Phaser.GameObjects.Ellipse;
  target: MultiplayerPlayerPresence;
  /** Локальный дедлайн grace — таймер на nameplate без спама snapshot. */
  disconnectDeadlineMs: number | null;
  onPointerDown?: (pointer: Phaser.Input.Pointer) => void;
  lastDepthBucket: number;
  facing: Facing8;
}

export class RemotePlayerManager {
  private scene: Phaser.Scene | null = null;
  private selfSaveId = '';
  private players = new Map<string, RemotePlayerView>();
  private readonly pool: RemotePlayerView[] = [];
  private selectedSaveId: string | null = null;
  private assistSaveId: string | null = null;
  private onSelect: ((saveId: string) => void) | null = null;
  private frame = 0;
  private readonly knownAnims = new Set<string>();
  private readonly missingAnims = new Set<string>();
  private readonly presenceBuffer: MultiplayerPlayerPresence[] = [];

  init(scene: Phaser.Scene, selfSaveId: string, onSelect?: (saveId: string) => void): void {
    this.destroyAllViews();
    this.scene = scene;
    this.selfSaveId = selfSaveId;
    this.onSelect = onSelect ?? null;
    this.selectedSaveId = null;
    this.assistSaveId = null;
    this.frame = 0;
    this.knownAnims.clear();
    this.missingAnims.clear();
  }

  setSelected(saveId: string | null): void {
    this.selectedSaveId = saveId;
    this.refreshRings();
  }

  setAssistTarget(saveId: string | null): void {
    this.assistSaveId = saveId;
    this.refreshRings();
  }

  getSelected(): string | null {
    return this.selectedSaveId;
  }

  private refreshRings(): void {
    for (const [id, view] of this.players) {
      const selected = id === this.selectedSaveId;
      const assist = id === this.assistSaveId;
      view.selectRing.setVisible(selected || assist);
      if (assist && !selected) {
        view.selectRing.setFillStyle(0xd48a30, 0.32);
        view.selectRing.setStrokeStyle(2, 0xffc878, 0.95);
      } else if (selected) {
        view.selectRing.setFillStyle(0x3a8fd4, 0.28);
        view.selectRing.setStrokeStyle(2, 0x8ec8ff, 0.9);
      }
    }
  }

  getPresence(saveId: string): MultiplayerPlayerPresence | null {
    return this.players.get(saveId)?.target ?? null;
  }

  applySnapshot(snapshot: MultiplayerLocationSnapshot): void {
    if (!this.scene) return;
    const seen = new Set<string>();
    for (const presence of snapshot.players) {
      if (presence.saveId === this.selfSaveId) continue;
      seen.add(presence.saveId);
      this.upsert(presence);
    }
    for (const [saveId] of this.players) {
      if (!seen.has(saveId)) this.remove(saveId);
    }
  }

  applyPresence(presence: MultiplayerPlayerPresence): void {
    if (presence.saveId === this.selfSaveId) return;
    this.upsert(presence);
  }

  remove(saveId: string): void {
    const current = this.players.get(saveId);
    if (!current) return;
    this.players.delete(saveId);
    this.graceToastWarned.delete(saveId);
    this.releaseView(current);
  }

  forEachAlive(fn: (x: number, y: number, presence: MultiplayerPlayerPresence) => void): void {
    for (const view of this.players.values()) {
      if (view.target.hp <= 0) continue;
      fn(view.sprite.x, view.sprite.y, view.target);
    }
  }

  /** Все remote (включая мёртвых) — для миникарты пати. */
  forEachPresence(fn: (x: number, y: number, presence: MultiplayerPlayerPresence) => void): void {
    for (const view of this.players.values()) {
      fn(view.sprite.x, view.sprite.y, view.target);
    }
  }

  collectInRange(x: number, y: number, range: number): MultiplayerPlayerPresence[] {
    this.presenceBuffer.length = 0;
    const rangeSq = range * range;
    for (const view of this.players.values()) {
      if (view.target.hp <= 0) continue;
      const dx = view.sprite.x - x;
      const dy = view.sprite.y - y;
      if (dx * dx + dy * dy <= rangeSq) this.presenceBuffer.push(view.target);
    }
    return this.presenceBuffer;
  }

  nearestInRange(
    x: number,
    y: number,
    range: number,
    visible?: (x: number, y: number) => boolean,
    excludedSaveIds?: ReadonlySet<string>,
  ): { presence: MultiplayerPlayerPresence; dist: number } | null {
    const rangeSq = range * range;
    let best: { presence: MultiplayerPlayerPresence; distSq: number } | null = null;
    for (const view of this.players.values()) {
      if (view.target.hp <= 0 || excludedSaveIds?.has(view.target.saveId)) continue;
      const dx = view.sprite.x - x;
      const dy = view.sprite.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq || (visible && !visible(view.sprite.x, view.sprite.y))) continue;
      if (!best || distSq < best.distSq) best = { presence: view.target, distSq };
    }
    return best ? { presence: best.presence, dist: Math.sqrt(best.distSq) } : null;
  }

  nearestDeadInRange(
    x: number,
    y: number,
    range: number,
    visible?: (x: number, y: number) => boolean,
  ): { presence: MultiplayerPlayerPresence; dist: number } | null {
    const rangeSq = range * range;
    let best: { presence: MultiplayerPlayerPresence; distSq: number } | null = null;
    for (const view of this.players.values()) {
      if (view.target.hp > 0) continue;
      const dx = view.sprite.x - x;
      const dy = view.sprite.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq || (visible && !visible(view.sprite.x, view.sprite.y))) continue;
      if (!best || distSq < best.distSq) best = { presence: view.target, distSq };
    }
    return best ? { presence: best.presence, dist: Math.sqrt(best.distSq) } : null;
  }

  getSprite(saveId: string): Phaser.GameObjects.Sprite | null {
    return this.players.get(saveId)?.sprite ?? null;
  }

  update(deltaMs = this.scene?.game.loop.delta ?? 1000 / 60): void {
    this.frame++;
    const doDepth = (this.frame & 1) === 0;
    const tickLabel = (this.frame % 15) === 0;
    const now = Date.now();
    const followFactor = frameRateIndependentLerpFactor(0.24, deltaMs);
    for (const view of this.players.values()) {
      if (tickLabel && view.disconnectDeadlineMs != null) {
        const rem = Math.max(0, view.disconnectDeadlineMs - now);
        view.target = { ...view.target, disconnectRemainingMs: rem };
        view.label.setText(this.nameplateText(view.target));
        this.maybeGraceToast(view.target);
      }
      const dx = view.target.x - view.sprite.x;
      const dy = view.target.y - view.sprite.y;
      const distance = Math.hypot(dx, dy);
      // Corrections near a resting pose must not turn the actor or restart its gait.
      const moving = view.target.moving || distance > 2.5;
      if (distance > 2.5) view.facing = facingFromDelta(dx, dy) ?? view.facing;
      const facing = view.facing;
      if (distance <= 0.25) {
        view.sprite.setPosition(view.target.x, view.target.y);
      } else {
        view.sprite.x = Phaser.Math.Linear(view.sprite.x, view.target.x, followFactor);
        view.sprite.y = Phaser.Math.Linear(view.sprite.y, view.target.y, followFactor);
      }
      view.sprite.setFlipX(facingNeedsFlipX(facing));

      const visualSpeed = deltaMs>0 ? distance*followFactor*1000/deltaMs : 0;
      const gender = view.target.gender === 'female' ? 'female' : 'male';
      const mounted = Boolean(view.target.mounted);
      if (mounted && view.mountLook) {
        view.sprite.anims.stop();
        view.sprite.setVisible(false);
      } else {
        view.sprite.setVisible(true);
        view.sprite.setCrop();
        const walk = playerWalkAnimKey(view.target.race, facing, gender);
        const anim = moving
          ? this.animExists(walk)
            ? walk
            : playerAnimKey(view.target.race, 'walk', gender)
          : playerIdleAnimKey(view.target.race, facing, gender);
        view.sprite.anims.timeScale = moving ? walkCadence(visualSpeed,120) : 1;
        if (!view.sprite.anims.isPlaying || view.sprite.anims.currentAnim?.key !== anim) {
          view.sprite.play(anim, true);
        }
      }

      view.label.setPosition(view.sprite.x, view.sprite.y - 38);
      view.selectRing.setPosition(view.sprite.x, view.sprite.y + 10);
      const depthBucket = (view.sprite.y / 4) | 0;
      let depth = entityDepth(view.sprite.y);
      if (doDepth || depthBucket !== view.lastDepthBucket) {
        view.lastDepthBucket = depthBucket;
        view.sprite.setDepth(depth);
        view.selectRing.setDepth(depth - 1);
      } else {
        depth = view.sprite.depth;
      }
      if (view.target.hp <= 0) {
        view.mount?.setVisible(false);
        view.sprite.setVisible(true);
        if (doDepth) view.label.setDepth(depth + 1);
        this.syncHpBar(view, doDepth);
        if (doDepth) syncEntityShadow(view.sprite);
        continue;
      }
      if (view.mount?.visible && view.mountLook) {
        const row = facingRow(facing);
        view.mount.setPosition(view.sprite.x, view.sprite.y + 2);
        view.mount.setFlipX(view.sprite.flipX);
        if (doDepth) view.mount.setDepth(depth);
        if (view.mount.displayWidth !== DISPLAY_SIZE * MOUNT_DISPLAY) {
          view.mount.setDisplaySize(DISPLAY_SIZE * MOUNT_DISPLAY, DISPLAY_SIZE * MOUNT_DISPLAY);
          view.mount.setOrigin(0.5, 0.55);
        }
        if (view.mount.texture.key !== MOUNT_ATLAS_KEY) {
          view.mount.setTexture(MOUNT_ATLAS_KEY, mountedFrameName(view.mountLook, row, 0));
        }
        view.mount.clearTint();
        view.mount.anims.timeScale = moving ? walkCadence(visualSpeed,180) : 1;
        const manim = mountedAnimKey(view.mountLook, moving ? 'walk' : 'idle', row);
        if ((!view.mount.anims.isPlaying || view.mount.anims.currentAnim?.key !== manim) && this.animExists(manim)) {
          view.mount.play(manim, true);
        }
      }
      if (doDepth) view.label.setDepth(depth + 1);
      this.syncHpBar(view, doDepth);
      if (doDepth) syncEntityShadow(view.sprite);
    }
  }

  private animExists(key: string): boolean {
    if (this.missingAnims.has(key)) return false;
    if (!this.scene?.anims.exists(key)) {
      this.knownAnims.delete(key);
      this.missingAnims.add(key);
      return false;
    }
    this.missingAnims.delete(key);
    this.knownAnims.add(key);
    return true;
  }

  private syncHpBar(view: RemotePlayerView, syncDepth = true): void {
    const maxHp = Math.max(1, view.target.maxHp);
    const ratio = Phaser.Math.Clamp(view.target.hp / maxHp, 0, 1);
    view.hpBarBg.setPosition(view.sprite.x, view.sprite.y - 48);
    view.hpBarFg.setPosition(view.sprite.x - 18, view.sprite.y - 48);
    view.hpBarFg.width = 36 * ratio;
    if (syncDepth) {
      const depth = entityDepth(view.sprite.y);
      view.hpBarBg.setDepth(depth + 1);
      view.hpBarFg.setDepth(depth + 2);
    }
    const show = view.target.hp > 0 && view.target.hp < maxHp;
    view.hpBarBg.setVisible(show);
    view.hpBarFg.setVisible(show);
  }

  private nameplateText(presence: MultiplayerPlayerPresence): string {
    if (presence.connectionStatus === 'disconnected') {
      const ms = presence.disconnectRemainingMs;
      if (typeof ms === 'number' && ms > 0) {
        const sec = Math.ceil(ms / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${presence.name}\nDISCONNECT ${m}:${String(s).padStart(2, '0')}`;
      }
      return `${presence.name}\nDISCONNECT`;
    }
    return presence.name;
  }

  private nameColor(presence: MultiplayerPlayerPresence): string {
    if (presence.connectionStatus === 'disconnected') return '#ffaa66';
    return NAME_COLORS[presence.pvpStatus] ?? NAME_COLORS.peaceful;
  }

  private readonly graceToastWarned = new Set<string>();

  private stampDisconnectDeadline(
    view: RemotePlayerView,
    presence: MultiplayerPlayerPresence,
  ): void {
    if (presence.connectionStatus !== 'disconnected') {
      view.disconnectDeadlineMs = null;
      return;
    }
    const ms = presence.disconnectRemainingMs;
    if (typeof ms === 'number' && ms >= 0) {
      view.disconnectDeadlineMs = Date.now() + ms;
    } else if (view.disconnectDeadlineMs == null) {
      view.disconnectDeadlineMs = Date.now() + 60_000;
    }
  }

  private upsert(presence: MultiplayerPlayerPresence): void {
    if (!this.scene) return;
    let current = this.players.get(presence.saveId);
    if (!current) {
      current = this.acquireView(presence);
      this.players.set(presence.saveId, current);
    } else {
      this.applyPresenceToView(current, presence, false);
    }
    this.stampDisconnectDeadline(current, presence);
    this.maybeGraceToast(presence);
    this.syncRemoteMount(current);
    this.syncHpBar(current);
    this.refreshRings();
  }

  private maybeGraceToast(presence: MultiplayerPlayerPresence): void {
    if (presence.connectionStatus !== 'disconnected') {
      this.graceToastWarned.delete(presence.saveId);
      return;
    }
    const ms = presence.disconnectRemainingMs;
    if (typeof ms !== 'number' || ms > 10_000 || ms <= 0) return;
    if (this.graceToastWarned.has(presence.saveId)) return;
    this.graceToastWarned.add(presence.saveId);
    const cb = this.scene?.registry.get('callbacks') as
      | { onCombatFeedback?: (t: string) => void }
      | undefined;
    cb?.onCombatFeedback?.(`${presence.name}: DISCONNECT ~${Math.ceil(ms / 1000)}с`);
  }

  private acquireView(presence: MultiplayerPlayerPresence): RemotePlayerView {
    const pooled = this.pool.pop();
    if (pooled) {
      this.reactivateView(pooled, presence);
      return pooled;
    }
    return this.createView(presence);
  }

  private createView(presence: MultiplayerPlayerPresence): RemotePlayerView {
    const scene = this.scene!;
    const gender = presence.gender === 'female' ? 'female' : 'male';
    registerCombatSprites(scene, presence.race);
    const sprite = scene.add.sprite(
      presence.x,
      presence.y,
      playerTextureKey(presence.race),
      playerSpriteFrame(presence.race, 0, gender),
    );
    sprite.setDepth(10);
    setupSpriteDisplay(sprite);
    sprite.play(playerAnimKey(presence.race, 'idle', gender));
    attachEntityShadow(scene, sprite);

    const label = scene.add
      .text(presence.x, presence.y - 38, this.nameplateText(presence), {
        color: this.nameColor(presence),
        fontSize: '12px',
        backgroundColor: '#00000088',
        padding: { x: 5, y: 2 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(11);

    const hpBarBg = scene.add
      .rectangle(presence.x, presence.y - 48, 36, 4, 0x222222, 0.85)
      .setOrigin(0.5)
      .setDepth(11);
    const hpBarFg = scene.add
      .rectangle(presence.x - 18, presence.y - 48, 36, 4, 0x66cc88, 0.95)
      .setOrigin(0, 0.5)
      .setDepth(12);
    const selectRing = scene.add
      .ellipse(presence.x, presence.y + 10, 44, 20, 0x3a8fd4, 0.28)
      .setStrokeStyle(2, 0x8ec8ff, 0.9)
      .setDepth(9)
      .setVisible(false);

    const view: RemotePlayerView = {
      sprite,
      mount: null,
      mountLook: null,
      label,
      hpBarBg,
      hpBarFg,
      selectRing,
      target: presence,
      disconnectDeadlineMs: null,
      lastDepthBucket: Number.NaN,
      facing: presence.facing,
    };
    this.bindSelectHandlers(view);
    return view;
  }

  private reactivateView(view: RemotePlayerView, presence: MultiplayerPlayerPresence): void {
    view.mountLook = null;
    view.facing = presence.facing;
    view.lastDepthBucket = Number.NaN;
    view.selectRing.setVisible(false);
    view.selectRing.setFillStyle(0x3a8fd4, 0.28);
    view.selectRing.setStrokeStyle(2, 0x8ec8ff, 0.9);
    view.sprite.setVisible(true);
    view.sprite.setActive(true);
    view.label.setVisible(true);
    view.hpBarBg.setVisible(false);
    view.hpBarFg.setVisible(false);
    const shadow = view.sprite.getData('dropShadow') as Phaser.GameObjects.Ellipse | undefined;
    shadow?.setVisible(true);
    this.applyPresenceToView(view, presence, true);
    this.enableSelectHandlers(view);
  }

  private applyPresenceToView(
    view: RemotePlayerView,
    presence: MultiplayerPlayerPresence,
    snapPosition: boolean,
  ): void {
    const gender = presence.gender === 'female' ? 'female' : 'male';
    const prevGender = view.target.gender === 'female' ? 'female' : 'male';
    const raceChanged = view.target.race !== presence.race || prevGender !== gender;
    view.target = presence;
    if (snapPosition) {
      view.sprite.setPosition(presence.x, presence.y);
      view.label.setPosition(presence.x, presence.y - 38);
      view.selectRing.setPosition(presence.x, presence.y + 10);
    }
    if (raceChanged || view.sprite.texture.key !== playerTextureKey(presence.race)) {
      registerCombatSprites(this.scene!, presence.race);
      view.sprite.setTexture(
        playerTextureKey(presence.race),
        playerSpriteFrame(presence.race, 0, gender),
      );
      setupSpriteDisplay(view.sprite);
      view.sprite.play(playerAnimKey(presence.race, 'idle', gender));
    }
    view.label.setText(this.nameplateText(presence));
    view.label.setColor(this.nameColor(presence));
    view.label.setAlign('center');
  }

  private bindSelectHandlers(view: RemotePlayerView): void {
    const pick = (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;
      this.onSelect?.(view.target.saveId);
    };
    view.onPointerDown = pick;
    this.enableSelectHandlers(view);
    view.sprite.on('pointerdown', pick);
    view.selectRing.on('pointerdown', pick);
  }

  private enableSelectHandlers(view: RemotePlayerView): void {
    view.sprite.setInteractive({ useHandCursor: true });
    view.selectRing.setInteractive(
      new Phaser.Geom.Ellipse(0, 0, 44, 20),
      Phaser.Geom.Ellipse.Contains,
    );
    if (view.mount?.visible && view.onPointerDown) {
      view.mount.setInteractive({ useHandCursor: true });
    }
  }

  private disableSelectHandlers(view: RemotePlayerView): void {
    view.sprite.disableInteractive();
    view.selectRing.disableInteractive();
    view.mount?.disableInteractive();
  }

  private bindMountSelect(view: RemotePlayerView): void {
    if (!view.mount || !view.onPointerDown) return;
    view.mount.setInteractive({ useHandCursor: true });
    view.mount.off('pointerdown', view.onPointerDown);
    view.mount.on('pointerdown', view.onPointerDown);
  }

  private releaseView(view: RemotePlayerView): void {
    this.disableSelectHandlers(view);
    view.sprite.anims.stop();
    view.sprite.setVisible(false);
    view.sprite.setActive(false);
    view.mount?.anims.stop();
    view.mount?.setVisible(false);
    view.mount?.clearTint();
    view.mountLook = null;
    view.label.setVisible(false);
    view.hpBarBg.setVisible(false);
    view.hpBarFg.setVisible(false);
    view.selectRing.setVisible(false);
    const shadow = view.sprite.getData('dropShadow') as Phaser.GameObjects.Ellipse | undefined;
    shadow?.setVisible(false);
    if (this.pool.length < POOL_CAP) {
      this.pool.push(view);
    } else {
      this.destroyView(view);
    }
  }

  private destroyView(view: RemotePlayerView): void {
    if (view.onPointerDown) {
      view.sprite.off('pointerdown', view.onPointerDown);
      view.selectRing.off('pointerdown', view.onPointerDown);
      view.mount?.off('pointerdown', view.onPointerDown);
    }
    view.sprite.destroy();
    view.mount?.destroy();
    view.label.destroy();
    view.hpBarBg.destroy();
    view.hpBarFg.destroy();
    view.selectRing.destroy();
  }

  private destroyAllViews(): void {
    for (const id of this.players.keys()) {
      const view = this.players.get(id);
      this.players.delete(id);
      if (view) this.destroyView(view);
    }
    while (this.pool.length > 0) {
      const view = this.pool.pop();
      if (view) this.destroyView(view);
    }
  }

  private syncRemoteMount(view: RemotePlayerView): void {
    if (!this.scene) return;
    const mounted = Boolean(view.target.mounted);
    if (!mounted) {
      view.mount?.setVisible(false);
      view.mount?.clearTint();
      view.mountLook = null;
      view.sprite.setVisible(true);
      view.sprite.setCrop();
      setupSpriteDisplay(view.sprite);
      return;
    }
    const look = mountedLookFromPresence(view.target);
    const rebuilt = !view.mountLook || !looksEqual(view.mountLook, look);
    view.mountLook = look;
    registerMountedLook(this.scene, look);
    const frame = mountedFrameName(look, 'down', 0);
    if (!view.mount) {
      view.mount = this.scene.add.sprite(view.sprite.x, view.sprite.y + 2, MOUNT_ATLAS_KEY, frame);
      view.mount.setOrigin(0.5, 0.55);
      setupSpriteDisplay(view.mount);
      view.mount.setDisplaySize(DISPLAY_SIZE * MOUNT_DISPLAY, DISPLAY_SIZE * MOUNT_DISPLAY);
      this.bindMountSelect(view);
    } else if (rebuilt || view.mount.texture.key !== MOUNT_ATLAS_KEY) {
      view.mount.setTexture(MOUNT_ATLAS_KEY, frame);
    }
    view.mount.setVisible(true);
    view.sprite.setVisible(false);
  }

  clear(): void {
    for (const id of this.players.keys()) this.remove(id);
  }

  shutdown(): void {
    this.destroyAllViews();
    this.knownAnims.clear();
    this.missingAnims.clear();
    this.presenceBuffer.length = 0;
    this.scene = null;
  }
}
