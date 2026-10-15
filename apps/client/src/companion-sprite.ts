import Phaser from 'phaser';
import type { CompanionState } from '@empery/shared';
import { companionFollowSpeed, companionLootTarget } from '@empery/shared';
import { COMBAT_ATLAS_KEY } from './sprites/sprite-factory.js';
import { setupSpriteDisplay } from './sprites/sprite-loader.js';
import { attachEntityShadow, entityDepth, syncEntityShadow } from './sprites/visual-polish.js';
import { nudgePointFromPropColliders } from './sprites/prop-colliders.js';

type FetchPhase = 'none' | 'to_loot' | 'at_loot' | 'return';

/**
 * Local companion follow visual (puppy / seagull).
 * Runs/flys to loot piles; server picks up only after arriveAt.
 */
export class CompanionSprite {
  private scene: Phaser.Scene | null = null;
  private sprite: Phaser.GameObjects.Sprite | null = null;
  private gullGfx: Phaser.GameObjects.Graphics | null = null;
  private companion: CompanionState | null = null;
  private tx = 0;
  private ty = 0;
  private flap = 0;
  private fetchPhase: FetchPhase = 'none';
  private fetchTargetX = 0;
  private fetchTargetY = 0;
  private fetchHomeX = 0;
  private fetchHomeY = 0;
  private fetchLootId: string | null = null;
  private fetchArriveAt = 0;
  private fetchPauseMs = 0;

  bind(scene: Phaser.Scene): void {
    this.scene = scene;
  }

  setCompanion(companion: CompanionState | null | undefined): void {
    if (!companion) {
      this.cancelFetch();
      this.destroyVisual();
      this.companion = null;
      return;
    }
    const changed =
      !this.companion ||
      this.companion.kind !== companion.kind ||
      this.companion.variantId !== companion.variantId;
    this.companion = companion;
    if (changed) this.rebuild();
  }

  isFetchingLoot(): boolean {
    return this.fetchPhase !== 'none';
  }

  getFetchingLootId(): string | null {
    return this.fetchLootId;
  }

  /** Animate to loot; speed synced with server arriveAt. */
  fetchLoot(
    lootId: string,
    lootX: number,
    lootY: number,
    arriveAt: number,
    fromX?: number,
    fromY?: number,
  ): void {
    const companion = this.companion;
    if (!companion) return;
    this.fetchPhase = 'to_loot';
    this.fetchLootId = lootId;
    const target = companionLootTarget(companion, lootX, lootY);
    this.fetchTargetX = target.x;
    this.fetchTargetY = target.y;
    this.fetchArriveAt = arriveAt;
    this.fetchPauseMs = 0;
    if (fromX != null && fromY != null) {
      this.tx = fromX;
      this.ty = fromY;
    }
  }

  /** Loot gone before arrival — run back to the player. */
  abortFetchToReturn(playerX: number, playerY: number): void {
    const companion = this.companion;
    if (!companion || this.fetchPhase === 'none') return;
    const offsetX = companion.kind === 'seagull' ? 28 : 36;
    const offsetY = companion.kind === 'seagull' ? -42 : 18;
    this.fetchHomeX = playerX - offsetX;
    this.fetchHomeY = playerY + offsetY;
    this.fetchPhase = 'return';
    this.fetchLootId = null;
  }

  private cancelFetch(): void {
    this.fetchPhase = 'none';
    this.fetchLootId = null;
    this.fetchPauseMs = 0;
    this.fetchArriveAt = 0;
  }

  private rebuild(): void {
    const scene = this.scene;
    const companion = this.companion;
    if (!scene || !companion) return;
    this.destroyVisual();

    if (companion.kind === 'seagull') {
      this.gullGfx = scene.add.graphics().setDepth(entityDepth(this.ty, 2));
      return;
    }

    const key = COMBAT_ATLAS_KEY;
    if (!scene.textures.exists(key)) return;
    const frames = scene.textures.get(key).getFrameNames();
    const frame =
      frames.find((f) => f.includes('wolf') && f.includes('idle')) ??
      frames.find((f) => f.includes('wolf')) ??
      frames[0];
    if (!frame) return;
    const spr = scene.add.sprite(this.tx, this.ty, key, frame);
    setupSpriteDisplay(spr, 0.55);
    spr.setTint(0xf0d0a0);
    attachEntityShadow(scene, spr, 18, 8, 0.28);
    this.sprite = spr;
  }

  update(playerX: number, playerY: number, dtMs: number): void {
    const companion = this.companion;
    const scene = this.scene;
    if (!companion || !scene) return;

    if (this.fetchPhase !== 'none') {
      this.updateFetch(playerX, playerY, companion, dtMs);
      return;
    }

    const speed = companionFollowSpeed(companion);
    const offsetX = companion.kind === 'seagull' ? 28 : 36;
    const offsetY = companion.kind === 'seagull' ? -42 : 18;
    let targetX = playerX - offsetX;
    let targetY = playerY + offsetY;
    if (companion.kind === 'puppy') {
      const nudged = nudgePointFromPropColliders(scene, targetX, targetY, 10);
      targetX = nudged.x;
      targetY = nudged.y;
    }

    this.moveToward(targetX, targetY, speed, dtMs);
    this.drawCompanion(companion, targetX - this.tx);
  }

  private updateFetch(
    playerX: number,
    playerY: number,
    companion: CompanionState,
    dtMs: number,
  ): void {
    if (this.fetchPhase === 'to_loot') {
      const dx = this.fetchTargetX - this.tx;
      const dy = this.fetchTargetY - this.ty;
      const dist = Math.hypot(dx, dy);
      if (dist <= 10 || Date.now() >= this.fetchArriveAt) {
        this.tx = this.fetchTargetX;
        this.ty = this.fetchTargetY;
        this.fetchPhase = 'at_loot';
        this.fetchPauseMs = 180;
      } else {
        const remainingMs = Math.max(80, this.fetchArriveAt - Date.now());
        const speed = (dist / remainingMs) * 1000;
        this.moveToward(this.fetchTargetX, this.fetchTargetY, speed, dtMs);
      }
      this.drawCompanion(companion, dx, true);
      return;
    }

    if (this.fetchPhase === 'at_loot') {
      this.fetchPauseMs -= dtMs;
      this.drawCompanion(companion, 0, true);
      if (this.fetchPauseMs <= 0) {
        const offsetX = companion.kind === 'seagull' ? 28 : 36;
        const offsetY = companion.kind === 'seagull' ? -42 : 18;
        this.fetchHomeX = playerX - offsetX;
        this.fetchHomeY = playerY + offsetY;
        this.fetchPhase = 'return';
        this.fetchLootId = null;
      }
      return;
    }

    if (this.fetchPhase === 'return') {
      const dx = this.fetchHomeX - this.tx;
      const dy = this.fetchHomeY - this.ty;
      if (Math.hypot(dx, dy) <= 8) {
        this.fetchPhase = 'none';
        return;
      }
      this.moveToward(this.fetchHomeX, this.fetchHomeY, companionFollowSpeed(companion), dtMs);
      this.drawCompanion(companion, dx);
    }
  }

  private moveToward(targetX: number, targetY: number, speed: number, dtMs: number): void {
    const dx = targetX - this.tx;
    const dy = targetY - this.ty;
    const dist = Math.hypot(dx, dy);
    const step = (speed * dtMs) / 1000;
    if (dist > 2) {
      const move = Math.min(step, dist);
      this.tx += (dx / dist) * move;
      this.ty += (dy / dist) * move;
    }
  }

  private drawCompanion(companion: CompanionState, faceDx: number, fastFlap = false): void {
    this.flap += fastFlap ? 0.018 : 0.008;
    if (companion.kind === 'seagull' && this.gullGfx) {
      const bob = fastFlap ? Math.sin(this.flap * 4.8) * 5 : Math.sin(this.flap) * 4;
      this.drawGull(this.tx, this.ty - 8 + bob, fastFlap);
      this.gullGfx.setDepth(entityDepth(this.ty, 2));
      return;
    }
    if (this.sprite) {
      this.sprite.setPosition(this.tx, this.ty);
      if (Math.abs(faceDx) > 0.5) this.sprite.setFlipX(faceDx > 0);
      this.sprite.setDepth(entityDepth(this.ty));
      syncEntityShadow(this.sprite);
    }
  }

  private drawGull(x: number, y: number, fastFlap: boolean): void {
    const g = this.gullGfx;
    if (!g) return;
    g.clear();
    const flap = fastFlap ? 0.35 + 0.65 * Math.sin(this.flap * 5.4) : 0.55 + 0.45 * Math.sin(this.flap * 3.2);
    const wing = 16 * flap;
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(x, y + 18, 18, 5);
    g.fillStyle(0xe8eef4, 0.95);
    g.fillTriangle(x - 2, y + 4, x - wing * 0.45, y, x - wing * 0.15, y - 6);
    g.fillTriangle(x + 2, y + 4, x + wing * 0.45, y, x + wing * 0.15, y - 6);
    g.fillStyle(0xf7fafc, 1);
    g.fillEllipse(x, y + 2, 10, 5);
    g.fillStyle(0xf0a020, 1);
    g.fillTriangle(x + 5, y + 1, x + 11, y + 2, x + 5, y + 3);
  }

  private destroyVisual(): void {
    this.sprite?.destroy();
    this.sprite = null;
    this.gullGfx?.destroy();
    this.gullGfx = null;
  }

  shutdown(): void {
    this.cancelFetch();
    this.destroyVisual();
    this.companion = null;
    this.scene = null;
  }

  snapTo(x: number, y: number): void {
    this.tx = x - 36;
    this.ty = y + 18;
  }
}
