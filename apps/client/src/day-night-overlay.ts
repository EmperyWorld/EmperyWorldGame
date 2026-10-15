import Phaser from 'phaser';
import {
  dayNightAt,
  formatGameClock,
  type DayNightLocationProfile,
  type DayNightSnapshot,
} from '@empery/shared';
import { Depth } from './game/constants/depth.js';
import { getGraphicsProfile, placeHudInScreen, hudZoomCompensation } from './game/systems/graphics-quality.js';
import { overlayColorMatrix } from './game/systems/night-color-matrix.js';
import { layoutNightStars } from './game/systems/night-stars.js';
import {
  addGpuMembers,
  createGpuDecorLayer,
  ensureGpuDotTexture,
  GPU_DOT_KEY,
} from './sprites/gpu-decor.js';

/**
 * Fullscreen day/night tint via Phaser 4 ColorMatrix (`cameras.main.filters.external`).
 * Stars: SpriteGPULayer (twinkle) with Graphics fallback; ADD so they read through the matrix.
 */
export class DayNightOverlay {
  private scene: Phaser.Scene | null = null;
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private matrixFilter: Phaser.Filters.ColorMatrix | null = null;
  private stars: Phaser.GameObjects.Graphics | null = null;
  private starLayer: Phaser.GameObjects.SpriteGPULayer | null = null;
  private lastStarKey = '';
  private base: Pick<DayNightSnapshot, 'cycleMs' | 'epochMs'> | null = null;
  private snapshot: DayNightSnapshot | null = null;
  private profile: DayNightLocationProfile = { mode: 'outdoor', safeZone: false };
  private lastStarDraw = 0;

  bind(scene: Phaser.Scene): void {
    this.scene = scene;
    const cam = scene.cameras.main;
    this.matrixFilter = this.attachColorMatrix(cam);
    // Always keep a rectangle fallback — ColorMatrix alone can look like day under ADD lamps.
    this.overlay = scene.add
      .rectangle(0, 0, cam.width, cam.height, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(Depth.DayNightOverlay)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.layoutCover();
    scene.scale.on('resize', this.onResize, this);
  }

  private attachColorMatrix(cam: Phaser.Cameras.Scene2D.Camera): Phaser.Filters.ColorMatrix | null {
    try {
      return cam.filters.external.addColorMatrix();
    } catch {
      try {
        return cam.filters.internal.addColorMatrix();
      } catch {
        return null;
      }
    }
  }

  setProfile(profile: DayNightLocationProfile): void {
    this.profile = profile;
    if (this.base && this.snapshot) {
      const next = dayNightAt(this.snapshot.serverAt, this.base, this.profile);
      this.snapshot = next;
      this.apply(next);
    }
  }

  /** QA / harbor proof: pin local clock. Values >= 24 are absolute game hours. */
  forceHour(hour: number): DayNightSnapshot | null {
    const now = this.snapshot?.serverAt ?? Date.now();
    const cycleMs = this.snapshot?.cycleMs ?? 3_600_000;
    const abs = Number.isFinite(hour) ? Math.max(0, hour) : 0;
    const epochMs = now - (abs / 24) * cycleMs;
    try {
      this.setWorldTime(dayNightAt(now, { cycleMs, epochMs }, this.profile));
    } catch {
      this.base = { cycleMs, epochMs };
      this.snapshot = dayNightAt(now, { cycleMs, epochMs }, this.profile);
    }
    return this.snapshot;
  }

  /** Sync world clock from server (base snapshot — location profile applied locally). */
  setWorldTime(snapshot: DayNightSnapshot): void {
    this.base = { cycleMs: snapshot.cycleMs, epochMs: snapshot.epochMs };
    const next = dayNightAt(snapshot.serverAt, this.base, this.profile);
    this.snapshot = next;
    this.apply(next);
  }

  update(): void {
    // Strict server truth: no client-side time interpolation.
  }

  currentClock(): string | null {
    const snap = this.snapshot;
    if (!snap) return null;
    return `${formatGameClock(snap.hour)} · ${snap.phaseName}`;
  }

  currentSnapshot(): DayNightSnapshot | null {
    return this.snapshot;
  }

  private apply(snap: DayNightSnapshot): void {
    const useMatrix = Boolean(this.matrixFilter) && this.profile.mode !== 'outdoor';
    if (useMatrix && this.matrixFilter) {
      this.matrixFilter.colorMatrix.set(
        overlayColorMatrix(snap.overlayColor, snap.overlayAlpha, snap.darkness),
      );
      // Soft extra veil so unlit streets stay dark; lamps punch through via ADD above this.
      const veil = snap.darkness >= 0.35 ? Math.min(0.38, snap.darkness * 0.42) : 0;
      this.overlay?.setFillStyle(0x04060e, veil);
    } else {
      try {
        this.matrixFilter?.colorMatrix.reset();
      } catch {
        /* filter may be gone with camera */
      }
      this.overlay?.setFillStyle(snap.overlayColor, snap.overlayAlpha);
    }
    this.layoutCover();
    const showStars =
      getGraphicsProfile().stars &&
      snap.darkness >= 0.45 &&
      snap.overlayAlpha > 0.2 &&
      this.profile.mode === 'outdoor';
    this.stars?.setVisible(showStars && !this.starLayer);
    this.starLayer?.setVisible(showStars);
    if (!showStars) return;
    if (Math.abs(snap.hour - this.lastStarDraw) < 0.02) return;
    this.lastStarDraw = snap.hour;
    const scene = this.scene;
    const cam = scene?.cameras.main;
    if (!scene || !cam || !Number.isFinite(cam.width) || !Number.isFinite(cam.height)) return;
    const pts = layoutNightStars(cam.width, cam.height, snap.darkness, snap.dayProgress);
    const alpha = Math.min(0.85, (snap.darkness - 0.4) * 1.2);
    const key = `${cam.width}x${cam.height}:${pts.length}:${cam.zoom}`;
    if (this.starLayer && this.lastStarKey === key) return;
    this.lastStarKey = key;
    this.rebuildStars(scene, cam, pts, alpha);
  }

  private rebuildStars(
    scene: Phaser.Scene,
    cam: Phaser.Cameras.Scene2D.Camera,
    pts: ReturnType<typeof layoutNightStars>,
    alpha: number,
  ): void {
    this.starLayer?.destroy();
    this.starLayer = null;
    ensureGpuDotTexture(scene);
    const layer = createGpuDecorLayer(scene, GPU_DOT_KEY, pts.length, Depth.DayNightOverlay + 0.1);
    if (layer) {
      this.stars?.setVisible(false);
      layer.setBlendMode(Phaser.BlendModes.ADD);
      const z = hudZoomCompensation(cam.zoom);
      const zoom = cam.zoom > 0 ? cam.zoom : 1;
      const w = cam.width;
      const h = cam.height;
      addGpuMembers(
        layer,
        pts.map((p, i) => {
          const x = w * 0.5 + (p.x - w * 0.5) / zoom;
          const y = h * 0.5 + (p.y - h * 0.5) / zoom;
          const sc = p.r * 0.28 * z;
          return {
            x,
            y,
            scaleX: sc,
            scaleY: sc,
            alpha: {
              base: alpha * 0.7,
              amplitude: alpha * 0.3,
              duration: 1600 + (i % 9) * 120,
              delay: i * 40,
              yoyo: true,
              loop: true,
              ease: 'Sine.easeInOut',
            },
            scrollFactorX: 0,
            scrollFactorY: 0,
            tintTopLeft: 0xe8f0ff,
            tintTopRight: 0xe8f0ff,
            tintBottomLeft: 0xe8f0ff,
            tintBottomRight: 0xe8f0ff,
            tintBlend: 1,
          };
        }),
      );
      this.starLayer = layer;
      return;
    }
    if (!this.stars) {
      this.stars = scene.add
        .graphics()
        .setScrollFactor(0)
        .setDepth(Depth.DayNightOverlay + 0.1)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.layoutCover();
    }
    const stars = this.stars;
    stars.clear();
    stars.fillStyle(0xe8f0ff, alpha);
    for (const p of pts) stars.fillCircle(p.x, p.y, p.r);
  }

  private layoutCover(): void {
    const scene = this.scene;
    if (!scene) return;
    const cam = scene.cameras.main;
    if (!cam || !Number.isFinite(cam.width) || !Number.isFinite(cam.height)) return;
    const overlay = this.overlay;
    if (overlay) {
      overlay.setSize(cam.width, cam.height);
      placeHudInScreen(overlay, 0, 0, cam.zoom, cam.width, cam.height);
    }
    if (this.stars) {
      placeHudInScreen(this.stars, 0, 0, cam.zoom, cam.width, cam.height);
    }
  }

  private onResize(): void {
    this.lastStarKey = '';
    this.lastStarDraw = 0;
    this.layoutCover();
    if (this.snapshot) this.apply(this.snapshot);
  }

  shutdown(): void {
    this.scene?.scale.off('resize', this.onResize, this);
    try {
      this.matrixFilter?.colorMatrix.reset();
      this.matrixFilter?.destroy();
    } catch {
      /* filter already gone with camera */
    }
    this.matrixFilter = null;
    this.overlay?.destroy();
    this.stars?.destroy();
    this.starLayer?.destroy();
    this.overlay = null;
    this.stars = null;
    this.starLayer = null;
    this.lastStarKey = '';
    this.base = null;
    this.snapshot = null;
    this.scene = null;
  }
}
