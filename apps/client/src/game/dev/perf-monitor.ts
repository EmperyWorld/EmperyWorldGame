import type Phaser from 'phaser';
import { wantPerfOverlay } from '../systems/graphics-quality.js';

export interface PerfSnapshot {
  timestamp: number;
  fps: number;
  textures: number;
  displayList: number;
  activeEnemies: number;
  sceneLoads: number;
  heapMb?: number;
}

declare global {
  interface Window {
    __EMPERY_PERF__?: PerfMonitor;
  }
}

/** Dev/QA helper: FPS, texture count, heap — `window.__EMPERY_PERF__.snapshot()`. */
export class PerfMonitor {
  private scene: Phaser.Scene | null = null;
  private fps = 0;
  private sceneLoads = 0;
  private lastSampleAt = 0;
  private lastHudAt = 0;
  private lastSnapshot: PerfSnapshot | null = null;
  private hudEl: HTMLElement | null = null;
  private overlay = false;
  private readonly onStep = (_time: number, delta: number): void => {
    if (delta > 0) this.fps = Math.round(1000 / delta);
    if (!this.overlay) return;
    const now = this.scene?.time.now ?? 0;
    if (now - this.lastHudAt < 400) return;
    this.lastHudAt = now;
    this.renderHud(this.lastSnapshot ?? this.snapshot());
  };

  bind(scene: Phaser.Scene): void {
    this.unbind();
    this.scene = scene;
    this.sceneLoads += 1;
    this.overlay = wantPerfOverlay();
    scene.game.events.on('step', this.onStep);
    if (import.meta.env.DEV || this.overlay) {
      window.__EMPERY_PERF__ = this;
    }
    if (this.overlay) this.ensureHud();
  }

  unbind(): void {
    if (this.scene) {
      this.scene.game.events.off('step', this.onStep);
    }
    if (window.__EMPERY_PERF__ === this) {
      delete window.__EMPERY_PERF__;
    }
    this.hudEl?.remove();
    this.hudEl = null;
    this.scene = null;
    this.overlay = false;
  }

  snapshot(activeEnemies = 0): PerfSnapshot {
    const scene = this.scene;
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const snap: PerfSnapshot = {
      timestamp: Date.now(),
      fps: this.fps,
      textures: scene?.textures.getTextureKeys().length ?? 0,
      displayList: scene?.children.length ?? 0,
      activeEnemies,
      sceneLoads: this.sceneLoads,
      heapMb: perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1024 / 1024) : undefined,
    };
    this.lastSnapshot = snap;
    if (this.overlay) this.renderHud(snap);
    return snap;
  }

  /** Log snapshot every `intervalMs` while scene is active (dev soak tests). */
  startSoakLog(intervalMs = 60_000, activeEnemies: () => number): Phaser.Time.TimerEvent | null {
    if (!this.scene || (!import.meta.env.DEV && !this.overlay)) return null;
    return this.scene.time.addEvent({
      delay: intervalMs,
      loop: true,
      callback: () => {
        const snap = this.snapshot(activeEnemies());
        console.info('[perf]', snap);
      },
    });
  }

  getLastSnapshot(): PerfSnapshot | null {
    return this.lastSnapshot;
  }

  tickSample(activeEnemies: () => number, intervalMs = 2000): void {
    const scene = this.scene;
    if (!scene) return;
    const now = scene.time.now;
    if (now - this.lastSampleAt < intervalMs) return;
    this.lastSampleAt = now;
    this.snapshot(activeEnemies());
  }

  private ensureHud(): void {
    if (typeof document === 'undefined' || this.hudEl) return;
    const el = document.createElement('div');
    el.id = 'empery-perf-hud';
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed',
      left: '8px',
      bottom: '8px',
      zIndex: '40',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '11px',
      lineHeight: '1.35',
      color: '#e8dcc0',
      background: 'rgba(8,10,14,0.72)',
      border: '1px solid #6a5a38',
      padding: '6px 8px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    });
    document.body.appendChild(el);
    this.hudEl = el;
  }

  private renderHud(snap: PerfSnapshot): void {
    if (!this.hudEl) return;
    const heap = snap.heapMb != null ? `  heap ${snap.heapMb}MB` : '';
    this.hudEl.textContent = `FPS ${snap.fps}\ntex ${snap.textures}  list ${snap.displayList}\nenemies ${snap.activeEnemies}${heap}`;
  }
}
