import Phaser from 'phaser';
import { Depth } from '../constants/depth.js';
import type { LocationConfig } from '../scenes/location-types.js';
import type { InputManager } from './InputManager.js';
import type { PlayerController } from '../controllers/PlayerController.js';
import {
  HAVEN_TRAVEL_PAD_DEFAULT_RADIUS,
  HAVEN_TRAVEL_PAD_Y_OFFSET,
  playerInsideTravelPad,
  travelConfirmLabel,
} from './portal-pad.js';

type PortalPad = {
  locationId: string;
  label: string;
  zoneX: number;
  zoneY: number;
  radius: number;
  pad: Phaser.GameObjects.Rectangle;
};

const TRAVEL_LOCK_MS = 10_000;

function syncEnterButton(label: string | null): void {
  const btn = document.getElementById('action-enter');
  const text = document.getElementById('action-enter-label');
  if (!btn) return;
  const show = Boolean(label);
  btn.classList.toggle('hidden', !show);
  if (text)
    text.innerHTML = `<img class="hud-action-icon" alt="" src="/media/assets/ui_action_enter.webp" />${
      label ? label.replace(/\s*\[[ER]\]\s*$/i, '') : 'Войти'
    }`;
}

/**
 * Click a distant pad to approach; from inside, click / [R] / HUD «Войти» to travel.
 * E/A — разговор (NPC часто стоит на пэде). R на пэде важнее рации.
 */
export class PortalSystem {
  private portals: PortalPad[] = [];
  private lockUntil = 0;
  private scene: Phaser.Scene | null = null;
  private travelInFlight = false;
  private playerCtrl: PlayerController | null = null;
  private input: InputManager | null = null;
  private onTravel: ((locationId: string) => void) | null = null;
  private prompt: Phaser.GameObjects.Text | null = null;
  private active: PortalPad | null = null;

  setup(
    scene: Phaser.Scene,
    _player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    location: LocationConfig,
    input: InputManager,
    playerCtrl: PlayerController,
    onTravel: (locationId: string) => void,
  ): void {
    this.scene = scene;
    this.playerCtrl = playerCtrl;
    this.input = input;
    this.onTravel = onTravel;
    this.travelInFlight = false;
    this.portals = [];
    this.active = null;

    this.prompt = scene.add
      .text(0, 0, '', {
        color: '#d8f8e0',
        fontSize: '13px',
        fontStyle: 'bold',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setDepth(Depth.EntityHud)
      .setVisible(false);

    for (const zone of location.zones ?? []) {
      if (!zone.travelTo) continue;
      const r = zone.radius ?? HAVEN_TRAVEL_PAD_DEFAULT_RADIUS;
      const cx = zone.x;
      const cy = zone.y + HAVEN_TRAVEL_PAD_Y_OFFSET;
      const pad = scene.add
        .rectangle(cx, cy, r * 1.6, r * 1.1, 0x44aa66, 0.08)
        .setDepth(Depth.Portal)
        .setStrokeStyle(1, 0x6bcf8e, 0.35)
        .setInteractive({ useHandCursor: true });
      const entry: PortalPad = {
        locationId: zone.travelTo,
        label: zone.label,
        zoneX: zone.x,
        zoneY: zone.y,
        radius: r,
        pad,
      };
      pad.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.button === 2 || pointer.rightButtonDown()) return;
        if (!this.canInteract()) return;
        // Clicking another pad must never confirm the one currently underfoot.
        if (playerInsideTravelPad(this.playerCtrl!.x, this.playerCtrl!.y, entry.zoneX, entry.zoneY, entry.radius)) {
          this.confirm(entry);
        } else {
          this.playerCtrl!.setClickMoveTarget(cx, cy);
        }
      });
      this.portals.push(entry);
    }
    syncEnterButton(null);
  }

  /** После успешного travel — короткая пауза у спавна (промпт не жмёт сам). */
  setSpawnLock(now: number, ms = 400): void {
    this.lockUntil = now + ms;
  }

  beginTravelAttempt(now: number, _locationId: string, ms = TRAVEL_LOCK_MS): void {
    this.travelInFlight = true;
    this.lockUntil = now + ms;
  }

  endTravelAttempt(failed: boolean): void {
    this.travelInFlight = false;
    if (failed) this.lockUntil = this.scene?.time.now ?? 0;
  }

  private canInteract(): boolean {
    return Boolean(this.scene && this.playerCtrl && !this.travelInFlight && this.scene.time.now >= this.lockUntil && !this.input?.isUiBlocked() && !this.playerCtrl.isDead);
  }

  private confirm(pad: PortalPad): void {
    this.beginTravelAttempt(this.scene!.time.now, pad.locationId);
    this.playerCtrl!.clearClickMove();
    this.playerCtrl!.setVelocity(0, 0);
    this.onTravel?.(pad.locationId);
  }

  /** Call from scene update — highlight pad underfoot + HUD button. */
  update(): void {
    if (!this.playerCtrl || !this.scene) return;

    const px = this.playerCtrl.x;
    const py = this.playerCtrl.y;
    let hit: PortalPad | null = null;
    for (const p of this.portals) {
      if (playerInsideTravelPad(px, py, p.zoneX, p.zoneY, p.radius)) {
        hit = p;
        break;
      }
    }
    this.active = hit;

    for (const p of this.portals) {
      const on = p === hit;
      p.pad.setFillStyle(0x44aa66, on ? 0.22 : 0.08);
      p.pad.setStrokeStyle(1, 0x6bcf8e, on ? 0.85 : 0.35);
    }

    const show = Boolean(hit) && this.canInteract();
    if (this.prompt) {
      if (show && hit) {
        const aabbCy = hit.zoneY + HAVEN_TRAVEL_PAD_Y_OFFSET;
        this.prompt.setText(travelConfirmLabel(hit.label));
        this.prompt.setPosition(hit.zoneX, aabbCy - hit.radius * 0.35);
        this.prompt.setVisible(true);
      } else {
        this.prompt.setVisible(false);
      }
    }
    syncEnterButton(show && hit ? hit.label : null);
  }

  tryConfirm(): boolean {
    if (!this.canInteract() || !this.onTravel || !this.playerCtrl) return false;
    const px = this.playerCtrl.x;
    const py = this.playerCtrl.y;
    const pad =
      this.active && playerInsideTravelPad(px, py, this.active.zoneX, this.active.zoneY, this.active.radius)
        ? this.active
        : this.portals.find((p) => playerInsideTravelPad(px, py, p.zoneX, p.zoneY, p.radius));
    if (!pad) return false;
    this.confirm(pad);
    return true;
  }

  shutdown(): void {
    this.travelInFlight = false;
    this.playerCtrl = null;
    this.input = null;
    this.onTravel = null;
    this.active = null;
    this.prompt?.destroy();
    this.prompt = null;
    for (const p of this.portals) {
      p.pad.off('pointerdown');
      p.pad.destroy();
    }
    this.portals = [];
    this.scene = null;
    syncEnterButton(null);
  }
}
