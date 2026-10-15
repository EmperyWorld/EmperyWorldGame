import Phaser from 'phaser';
import { Depth } from '../constants/depth.js';
import type { LocationConfig } from '../scenes/location-types.js';
import type { WorldNavigationTarget } from '@empery/shared';
import type { EntityManager } from './EntityManager.js';
import type { RemotePlayerManager } from './RemotePlayerManager.js';
import { placeHudInScreen } from './graphics-quality.js';

const MINI_W = 210;
const MINI_H = 150;
const MARGIN = 12;
const PAD = 0.94;
export const NAVIGATION_ARRIVE_RADIUS = 72;

export function navigationTargetReached(
  playerX: number,
  playerY: number,
  target: Pick<WorldNavigationTarget, 'x' | 'y'>,
  radius = NAVIGATION_ARRIVE_RADIUS,
): boolean {
  const dx = target.x - playerX;
  const dy = target.y - playerY;
  return dx * dx + dy * dy <= radius * radius;
}

export interface InfrastructureMarkerStyle {
  color: number;
  radius: number;
}

export function infrastructureMarkerStyle(
  kind: string,
  category: 'landmark' | 'station',
): InfrastructureMarkerStyle {
  if (category === 'station') {
    if (kind === 'water') return { color: 0x65c8ff, radius: 2.2 };
    if (kind === 'hearth' || kind === 'campfire') {
      return { color: 0xff9a4a, radius: 2.2 };
    }
    return { color: 0xe8c878, radius: 1.8 };
  }
  if (kind === 'blacksmith') return { color: 0xff8750, radius: 2.4 };
  if (kind === 'inn' || kind === 'tavern' || kind === 'dock_tavern') {
    return { color: 0xf0c060, radius: 2.4 };
  }
  if (kind === 'cathedral' || kind === 'chapel') {
    return { color: 0xb8c8ff, radius: 2.4 };
  }
  if (kind === 'healer') return { color: 0x70df9a, radius: 2.4 };
  if (kind === 'stable') return { color: 0xd0a060, radius: 2.2 };
  if (kind === 'map_shop') return { color: 0x78e0dd, radius: 2.2 };
  if (kind === 'fire_brigade') return { color: 0xff6860, radius: 2.2 };
  return { color: 0xa8a090, radius: 1.25 };
}

type InfrastructurePoint = {
  category: 'landmark' | 'station' | 'exit';
  kind: string;
  x: number;
  y: number;
};

/**
 * Миникарта — только HUD Graphics на main camera (scrollFactor 0).
 * Без второй world-камеры: маркеры рисуются по world→mini scale, не дублируя сцену.
 */
export class MinimapSystem {
  private scene!: Phaser.Scene;
  private mapW = 1;
  private mapH = 1;
  private miniScale = 1;
  private container?: Phaser.GameObjects.Container;
  private frame?: Phaser.GameObjects.Graphics;
  private infrastructure?: Phaser.GameObjects.Graphics;
  private markers?: Phaser.GameObjects.Graphics;
  private label?: Phaser.GameObjects.Text;
  private youLabel?: Phaser.GameObjects.Text;
  private pulseT = 0;
  private resizeHandler?: () => void;
  private lastDrawAt = 0;
  private lastDirtyHash = 0;
  private locationId = '';
  private navigationTarget: WorldNavigationTarget | null = null;
  private navigationRing?: Phaser.GameObjects.Ellipse;
  private navigationLabel?: Phaser.GameObjects.Text;
  private infrastructurePoints: InfrastructurePoint[] = [];
  private readonly scratch = { x: 0, y: 0 };
  private static readonly DRAW_INTERVAL_MS = 160;
  /** Re-draw if entities moved more than this (world units, quantized). */
  private static readonly DIRTY_CELL = 20;

  init(scene: Phaser.Scene, mapW: number, mapH: number, location: LocationConfig): void {
    this.shutdown();
    this.scene = scene;
    this.mapW = Math.max(1, mapW);
    this.mapH = Math.max(1, mapH);
    this.locationId = location.id;
    this.pulseT = 0;
    this.lastDrawAt = 0;
    this.lastDirtyHash = 0;
    this.infrastructurePoints = [
      ...(location.landmarks ?? []).map((point) => ({
        category: 'landmark' as const,
        kind: point.kind,
        x: point.x,
        y: point.y,
      })),
      ...(location.stations ?? []).map((point) => ({
        category: 'station' as const,
        kind: point.kind,
        x: point.x,
        y: point.y,
      })),
      ...(location.zones ?? [])
        .filter((point) => Boolean(point.travelTo))
        .map((point) => ({
          category: 'exit' as const,
          kind: 'exit',
          x: point.x,
          y: point.y,
        })),
    ];

    const { x, y } = this.framePos();
    this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(Depth.Minimap);

    this.frame = scene.add.graphics();
    this.infrastructure = scene.add.graphics();
    this.markers = scene.add.graphics();
    this.label = scene.add.text(8, 4, location.name, {
      fontFamily: 'Georgia, serif',
      fontSize: '11px',
      color: '#d4c4a0',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.youLabel = scene.add
      .text(0, 0, '▼ ВЫ', {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fff56a',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1);

    this.container.add([
      this.frame,
      this.infrastructure,
      this.markers,
      this.label,
      this.youLabel,
    ]);

    this.resizeHandler = () => this.layout();
    scene.scale.on('resize', this.resizeHandler);
    this.layout();
  }

  setNavigationTarget(target: WorldNavigationTarget): boolean {
    if (!this.scene || target.locationId !== this.locationId) return false;
    this.clearNavigationTarget();
    this.navigationTarget = { ...target };
    this.navigationRing = this.scene.add
      .ellipse(target.x, target.y, 56, 28, 0xffd45a, 0.12)
      .setStrokeStyle(2, 0xffe080, 0.95)
      .setDepth(Depth.EntityMark - 0.1);
    this.navigationLabel = this.scene.add
      .text(target.x, target.y - 24, `◆ ${target.label}`, {
        color: '#ffe080',
        fontSize: '12px',
        fontStyle: 'bold',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(Depth.EntityMark);
    this.lastDrawAt = 0;
    this.lastDirtyHash = Number.NaN;
    return true;
  }

  clearNavigationTarget(): void {
    this.navigationRing?.destroy();
    this.navigationLabel?.destroy();
    this.navigationRing = undefined;
    this.navigationLabel = undefined;
    this.navigationTarget = null;
    this.lastDrawAt = 0;
    this.lastDirtyHash = Number.NaN;
  }

  private framePos(): { x: number; y: number } {
    const w = this.scene.scale.width;
    return { x: Math.max(MARGIN, w - MINI_W - MARGIN), y: MARGIN };
  }

  private drawFrame(): void {
    if (!this.frame) return;
    this.frame.clear();
    this.frame.fillStyle(0x050608, 0.35);
    this.frame.fillRoundedRect(0, 0, MINI_W, MINI_H, 3);
    this.frame.lineStyle(2, 0xc9a66b, 1);
    this.frame.strokeRoundedRect(1, 1, MINI_W - 2, MINI_H - 2, 3);
    this.frame.lineStyle(1, 0x2a2010, 1);
    this.frame.strokeRoundedRect(-1, -1, MINI_W + 2, MINI_H + 2, 4);
  }

  private drawInfrastructure(): void {
    const graphics = this.infrastructure;
    if (!graphics) return;
    graphics.clear();
    for (const point of this.infrastructurePoints) {
      const pos = this.worldToMini(point.x, point.y);
      if (point.category === 'exit') {
        graphics.fillStyle(0x68d890, 0.95);
        graphics.fillTriangle(pos.x, pos.y - 3.5, pos.x + 3.5, pos.y, pos.x, pos.y + 3.5);
        graphics.fillTriangle(pos.x, pos.y - 3.5, pos.x - 3.5, pos.y, pos.x, pos.y + 3.5);
        continue;
      }
      const style = infrastructureMarkerStyle(point.kind, point.category);
      graphics.fillStyle(style.color, point.category === 'station' ? 0.9 : 0.68);
      graphics.fillCircle(pos.x, pos.y, style.radius);
    }
  }

  private layout(): void {
    if (!this.container || !this.scene) return;
    const cam = this.scene.cameras.main;
    const { x, y } = this.framePos();
    placeHudInScreen(this.container, x, y, cam.zoom, cam.width, cam.height);
    this.miniScale = Math.min(MINI_W / this.mapW, MINI_H / this.mapH) * PAD;
    this.drawFrame();
    this.drawInfrastructure();
    this.label?.setPosition(8, 4);
  }

  /** Мир → локальные координаты внутри контейнера миникарты (scratch, без аллокации). */
  private worldToMini(wx: number, wy: number): { x: number; y: number } {
    const contentW = this.mapW * this.miniScale;
    const contentH = this.mapH * this.miniScale;
    const offsetX = (MINI_W - contentW) / 2;
    const offsetY = (MINI_H - contentH) / 2;
    this.scratch.x = offsetX + wx * this.miniScale;
    this.scratch.y = offsetY + wy * this.miniScale;
    return this.scratch;
  }

  private paintPlayerMarker(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    this.pulseT += 0.07;
    const pulse = 0.55 + Math.sin(this.pulseT) * 0.45;
    const ringR = 10 + pulse * 8;

    g.lineStyle(3, 0xfff36a, 0.35 + pulse * 0.45);
    g.strokeCircle(x, y, ringR);
    g.lineStyle(1.5, 0xffffff, 0.5 + pulse * 0.4);
    g.strokeCircle(x, y, ringR + 3);

    g.lineStyle(4, 0x000000, 0.85);
    g.lineBetween(x - 14, y, x + 14, y);
    g.lineBetween(x, y - 14, x, y + 14);
    g.lineStyle(2.5, 0xfff36a, 1);
    g.lineBetween(x - 12, y, x + 12, y);
    g.lineBetween(x, y - 12, x, y + 12);

    g.fillStyle(0x000000, 0.9);
    g.fillCircle(x, y, 7);
    g.fillStyle(0xfff36a, 1);
    g.fillCircle(x, y, 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x, y, 2.2);
  }

  private npcRole(id: string): 'merchant' | 'blacksmith' | 'innkeeper' | 'captain' | 'talk' {
    const s = id.toLowerCase();
    if (s.includes('merchant') || s.includes('shop') || s.includes('vendor')) return 'merchant';
    if (s.includes('blacksmith') || s.includes('smith') || s.includes('forge')) return 'blacksmith';
    if (s.includes('innkeeper') || s.includes('inn_') || s.endsWith('_inn')) return 'innkeeper';
    if (s.includes('captain') || s.includes('guard') || s.includes('knight')) return 'captain';
    return 'talk';
  }

  /** Пины NPC: роль → иконка. */
  private paintNpcMarker(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    role: ReturnType<MinimapSystem['npcRole']>,
  ): void {
    g.fillStyle(0x000000, 0.55);
    g.fillCircle(x + 1, y + 1, 7);

    if (role === 'merchant') {
      g.fillStyle(0x1a1408, 1);
      g.fillCircle(x, y, 7);
      g.fillStyle(0xe8c050, 1);
      g.fillCircle(x, y, 5.5);
      g.lineStyle(1.5, 0x8a6020, 1);
      g.strokeCircle(x, y, 5.5);
      g.fillStyle(0xfff0a0, 1);
      g.fillCircle(x - 1, y - 1, 1.6);
      return;
    }

    if (role === 'blacksmith') {
      g.fillStyle(0x1a1010, 1);
      g.fillRoundedRect(x - 7, y - 6, 14, 12, 2);
      g.fillStyle(0x8899aa, 1);
      g.fillRect(x - 5, y - 2, 10, 4);
      g.fillStyle(0x556677, 1);
      g.fillRect(x - 3, y + 2, 6, 3);
      g.lineStyle(2, 0xffaa66, 1);
      g.lineBetween(x - 2, y - 5, x + 5, y + 4);
      g.fillStyle(0xdd8866, 1);
      g.fillCircle(x + 5, y + 4, 2);
      return;
    }

    if (role === 'innkeeper') {
      g.fillStyle(0x1a1010, 1);
      g.fillRoundedRect(x - 5, y - 6, 10, 12, 2);
      g.fillStyle(0xc9a070, 1);
      g.fillRoundedRect(x - 4, y - 5, 8, 10, 2);
      g.fillStyle(0xe8d0a0, 1);
      g.fillRect(x - 3, y - 3, 6, 3);
      g.lineStyle(1.5, 0x8a7050, 1);
      g.strokeCircle(x + 5, y - 1, 3);
      return;
    }

    if (role === 'captain') {
      g.fillStyle(0x102018, 1);
      g.fillTriangle(x, y + 7, x - 7, y - 4, x + 7, y - 4);
      g.fillStyle(0x4a8a5a, 1);
      g.fillTriangle(x, y + 5, x - 5.5, y - 3, x + 5.5, y - 3);
      g.fillStyle(0xd4c4a0, 1);
      g.fillCircle(x, y - 1, 2);
      return;
    }

    g.fillStyle(0x0a1828, 1);
    g.fillRoundedRect(x - 7, y - 6, 14, 10, 3);
    g.fillStyle(0xd8ecff, 1);
    g.fillRoundedRect(x - 6, y - 5, 12, 8, 2);
    g.fillStyle(0x0a1828, 1);
    g.fillCircle(x - 3, y - 1, 1.2);
    g.fillCircle(x, y - 1, 1.2);
    g.fillCircle(x + 3, y - 1, 1.2);
    g.fillTriangle(x - 2, y + 3, x + 2, y + 3, x - 4, y + 7);
  }

  private updateNavigationTarget(playerX: number, playerY: number): void {
    const target = this.navigationTarget;
    if (!target || !this.scene) return;
    if (navigationTargetReached(playerX, playerY, target)) {
      const label = target.label;
      this.clearNavigationTarget();
      const callbacks = this.scene.registry.get('callbacks') as
        | { onCombatFeedback?: (text: string) => void }
        | undefined;
      callbacks?.onCombatFeedback?.(`Маршрут завершён: ${label}`);
      return;
    }
    const pulse = 1 + Math.sin(this.scene.time.now * 0.006) * 0.08;
    this.navigationRing?.setScale(pulse).setAlpha(0.8 + (pulse - 1));
  }

  private paintNavigationMarker(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
  ): void {
    g.fillStyle(0x000000, 0.8);
    g.fillTriangle(x, y - 8, x + 7, y, x, y + 8);
    g.fillTriangle(x, y - 8, x - 7, y, x, y + 8);
    g.fillStyle(0xffd45a, 1);
    g.fillTriangle(x, y - 6, x + 5, y, x, y + 6);
    g.fillTriangle(x, y - 6, x - 5, y, x, y + 6);
    g.lineStyle(1.5, 0xffffcc, 1);
    g.strokeCircle(x, y, 9);
  }

  update(
    playerX: number,
    playerY: number,
    entities: EntityManager,
    remotes: RemotePlayerManager,
    partySaveIds?: ReadonlySet<string>,
    assistTargetSaveId?: string | null,
  ): void {
    if (!this.markers || !this.scene) return;

    this.updateNavigationTarget(playerX, playerY);
    const now = this.scene.time.now;
    // Within interval: only slide the "you" label — skip O(n) dirty scan + Graphics clear.
    if (now - this.lastDrawAt < MinimapSystem.DRAW_INTERVAL_MS) {
      const p = this.worldToMini(playerX, playerY);
      this.youLabel?.setPosition(p.x, p.y - 16).setVisible(true);
      return;
    }
    const dirtyHash = this.buildDirtyHash(
      playerX,
      playerY,
      entities,
      remotes,
      partySaveIds,
      assistTargetSaveId,
    );
    if (dirtyHash === this.lastDirtyHash) {
      this.lastDrawAt = now;
      const p = this.worldToMini(playerX, playerY);
      this.youLabel?.setPosition(p.x, p.y - 16).setVisible(true);
      return;
    }
    this.lastDrawAt = now;
    this.lastDirtyHash = dirtyHash;

    this.markers.clear();

    entities.forEachActive((e) => {
      const p = this.worldToMini(e.x, e.y);
      this.markers!.fillStyle(0xff4466, 0.95);
      this.markers!.fillCircle(p.x, p.y, 2.5);
    });

    entities.forEachNpc((npc) => {
      const p = this.worldToMini(npc.x, npc.y);
      this.paintNpcMarker(this.markers!, p.x, p.y, this.npcRole(npc.id));
    });

    remotes.forEachPresence((rx, ry, presence) => {
      const p = this.worldToMini(rx, ry);
      const inParty = partySaveIds?.has(presence.saveId);
      const isAssist = Boolean(assistTargetSaveId && presence.saveId === assistTargetSaveId);
      const dead = presence.hp <= 0;

      if (isAssist) {
        this.paintAssistMarker(this.markers!, p.x, p.y, dead);
      } else if (inParty) {
        if (dead) this.paintPartyDeadMarker(this.markers!, p.x, p.y);
        else this.paintPartyMarker(this.markers!, p.x, p.y);
      } else if (!dead) {
        this.markers!.fillStyle(0xffb040, 0.95);
        this.markers!.fillCircle(p.x, p.y, 2.6);
      }
    });

    if (this.navigationTarget) {
      const waypoint = this.worldToMini(
        this.navigationTarget.x,
        this.navigationTarget.y,
      );
      this.paintNavigationMarker(this.markers, waypoint.x, waypoint.y);
    }

    const p = this.worldToMini(playerX, playerY);
    this.paintPlayerMarker(this.markers, p.x, p.y);
    this.youLabel?.setPosition(p.x, p.y - 16).setVisible(true);
  }

  /** Integer hash — no per-frame string alloc across all entities. */
  private buildDirtyHash(
    playerX: number,
    playerY: number,
    entities: EntityManager,
    remotes: RemotePlayerManager,
    partySaveIds?: ReadonlySet<string>,
    assistTargetSaveId?: string | null,
  ): number {
    const cell = MinimapSystem.DIRTY_CELL;
    let h =
      ((((playerX / cell) | 0) * 73856093) ^ (((playerY / cell) | 0) * 19349663)) | 0;
    let n = 0;
    entities.forEachActive((e) => {
      n += 1;
      h = (Math.imul(h, 31) + ((e.x / cell) | 0)) | 0;
      h = (Math.imul(h, 31) + ((e.y / cell) | 0)) | 0;
    });
    h = (Math.imul(h, 31) + n) | 0;
    let npcCount = 0;
    entities.forEachNpc((npc) => {
      npcCount += 1;
      h = (Math.imul(h, 31) + this.idHash(npc.id)) | 0;
      h = (Math.imul(h, 31) + ((npc.x / cell) | 0)) | 0;
      h = (Math.imul(h, 31) + ((npc.y / cell) | 0)) | 0;
    });
    h = (Math.imul(h, 31) + npcCount) | 0;
    remotes.forEachPresence((rx, ry, presence) => {
      h = (Math.imul(h, 31) + this.idHash(presence.saveId)) | 0;
      h = (Math.imul(h, 31) + ((rx / cell) | 0)) | 0;
      h = (Math.imul(h, 31) + ((ry / cell) | 0)) | 0;
      h = (Math.imul(h, 31) + (presence.hp <= 0 ? 0 : 1)) | 0;
    });
    if (assistTargetSaveId) {
      h = (Math.imul(h, 31) + this.idHash(assistTargetSaveId)) | 0;
    }
    if (partySaveIds) {
      h = (Math.imul(h, 31) + partySaveIds.size) | 0;
      for (const id of partySaveIds) {
        h = (Math.imul(h, 31) + this.idHash(id)) | 0;
      }
    }
    if (this.navigationTarget) {
      h = (Math.imul(h, 31) + this.idHash(this.navigationTarget.label)) | 0;
      h = (Math.imul(h, 31) + ((this.navigationTarget.x / cell) | 0)) | 0;
      h = (Math.imul(h, 31) + ((this.navigationTarget.y / cell) | 0)) | 0;
    }
    return h;
  }

  private idHash(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
    return h;
  }

  private paintPartyMarker(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x000000, 0.75);
    g.fillCircle(x, y, 5.5);
    g.fillStyle(0x4ecf8a, 1);
    g.fillCircle(x, y, 4);
    g.lineStyle(1.5, 0xb8ffe0, 0.95);
    g.strokeCircle(x, y, 5);
  }

  private paintPartyDeadMarker(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x000000, 0.7);
    g.fillCircle(x, y, 5);
    g.fillStyle(0x6a4050, 0.95);
    g.fillCircle(x, y, 3.5);
    g.lineStyle(1.5, 0xc07080, 0.9);
    g.lineBetween(x - 3, y - 3, x + 3, y + 3);
    g.lineBetween(x + 3, y - 3, x - 3, y + 3);
  }

  /** Цель пати (assist) — ромб поверх. */
  private paintAssistMarker(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    dead: boolean,
  ): void {
    const fill = dead ? 0x886060 : 0xff9040;
    const stroke = dead ? 0xc09090 : 0xffe0a0;
    g.fillStyle(0x000000, 0.8);
    g.fillTriangle(x, y - 7, x + 6, y, x, y + 7);
    g.fillTriangle(x, y - 7, x - 6, y, x, y + 7);
    g.fillStyle(fill, 1);
    g.fillTriangle(x, y - 5.5, x + 4.5, y, x, y + 5.5);
    g.fillTriangle(x, y - 5.5, x - 4.5, y, x, y + 5.5);
    g.lineStyle(1.5, stroke, 0.95);
    g.strokeTriangle(x, y - 6, x + 5, y, x, y + 6);
    g.lineBetween(x, y - 6, x - 5, y);
    g.lineBetween(x - 5, y, x, y + 6);
  }

  shutdown(): void {
    if (this.scene && this.resizeHandler) {
      this.scene.scale.off('resize', this.resizeHandler);
    }
    this.resizeHandler = undefined;
    this.clearNavigationTarget();
    this.container?.destroy(true);
    this.container = undefined;
    this.frame = undefined;
    this.infrastructure = undefined;
    this.markers = undefined;
    this.label = undefined;
    this.youLabel = undefined;
    this.locationId = '';
    this.infrastructurePoints = [];
  }
}
