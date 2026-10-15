import Phaser from 'phaser';
import type { GroundLootPile } from '@empery/shared';
import { GROUND_LOOT_PICKUP_RADIUS } from '@empery/shared';
import { Depth, entityDepth } from './game/constants/depth.js';

interface LootVisual {
  pile: GroundLootPile;
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

/**
 * World ground-loot piles. Server-authoritative; client only renders + requests pickup.
 */
export class GroundLootManager {
  private scene: Phaser.Scene | null = null;
  private visuals = new Map<string, LootVisual>();
  private fetchingIds = new Set<string>();
  private hint?: Phaser.GameObjects.Text;

  bind(scene: Phaser.Scene): void {
    this.scene = scene;
  }

  clear(): void {
    for (const v of this.visuals.values()) v.root.destroy(true);
    this.visuals.clear();
    this.fetchingIds.clear();
    this.hint?.destroy();
    this.hint = undefined;
  }

  shutdown(): void {
    this.clear();
    this.scene = null;
  }

  syncFromSnapshot(piles: GroundLootPile[] | undefined): void {
    const ids = new Set((piles ?? []).map((p) => p.id));
    for (const id of this.visuals.keys()) {
      if (!ids.has(id)) this.remove(id);
    }
    for (const pile of piles ?? []) this.upsert(pile);
  }

  upsert(pile: GroundLootPile): void {
    const scene = this.scene;
    if (!scene) return;
    const existing = this.visuals.get(pile.id);
    if (existing) {
      existing.pile = pile;
      existing.root.setPosition(pile.x, pile.y);
      existing.label.setText(this.labelText(pile));
      return;
    }

    const glow = scene.add.circle(0, 0, 14, 0xd4a017, 0.35);
    const coin = scene.add.circle(0, -2, 7, 0xf0c040, 0.95);
    coin.setStrokeStyle(1, 0x8a6010, 0.9);
    const label = scene.add
      .text(0, 16, this.labelText(pile), {
        fontFamily: 'Georgia, serif',
        fontSize: '11px',
        color: '#f5e6b8',
        stroke: '#1a1208',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);
    const root = scene.add.container(pile.x, pile.y, [glow, coin, label]);
    root.setDepth(entityDepth(pile.y, -0.5));
    scene.tweens.add({
      targets: glow,
      scale: 1.25,
      alpha: 0.2,
      duration: 900,
      yoyo: true,
      repeat: -1,
    });
    this.visuals.set(pile.id, { pile, root, glow, label });
  }

  remove(id: string): void {
    const v = this.visuals.get(id);
    if (!v) return;
    v.root.destroy(true);
    this.visuals.delete(id);
    this.fetchingIds.delete(id);
  }

  /** Keep pile visible while companion runs to it (already picked server-side). */
  markCompanionFetching(id: string): void {
    this.fetchingIds.add(id);
  }

  getPile(id: string): GroundLootPile | null {
    return this.visuals.get(id)?.pile ?? null;
  }

  isFetching(id: string): boolean {
    return this.fetchingIds.has(id);
  }

  findNearest(
    x: number,
    y: number,
    radius = GROUND_LOOT_PICKUP_RADIUS,
    visible?: (x: number, y: number) => boolean,
  ): GroundLootPile | null {
    let best: GroundLootPile | null = null;
    let bestD = radius;
    for (const v of this.visuals.values()) {
      if (this.fetchingIds.has(v.pile.id)) continue;
      const d = Math.hypot(v.pile.x - x, v.pile.y - y);
      if (d <= bestD && (!visible || visible(v.pile.x, v.pile.y))) {
        best = v.pile;
        bestD = d;
      }
    }
    return best;
  }

  updateHint(playerX: number, playerY: number, visible?: (x: number, y: number) => boolean): void {
    const scene = this.scene;
    if (!scene) return;
    const near = this.findNearest(playerX, playerY, undefined, visible);
    if (!near) {
      this.hint?.setVisible(false);
      return;
    }
    if (!this.hint) {
      this.hint = scene.add
        .text(0, 0, 'Лут [E]', {
          fontFamily: 'Georgia, serif',
          fontSize: '12px',
          color: '#ffe9a8',
          stroke: '#1a1208',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(Depth.EntityHud);
    }
    this.hint.setVisible(true);
    this.hint.setPosition(near.x, near.y - 28);
  }

  private labelText(pile: GroundLootPile): string {
    const items = pile.drops.filter((d) => d.kind === 'item').length;
    const adena = pile.drops
      .filter((d) => d.kind === 'adena')
      .reduce((s, d) => s + d.count, 0);
    if (adena && items) return `★ ${adena}+`;
    if (adena) return `${adena}`;
    return items > 1 ? `×${items}` : '★';
  }
}
