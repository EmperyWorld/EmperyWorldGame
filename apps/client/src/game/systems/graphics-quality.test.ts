import { afterEach, describe, expect, it } from 'vitest';
import { SETTINGS_STORAGE_KEY } from '../../settings-store.js';
import {
  GRAPHICS_STORAGE_KEY,
  PERF_OVERLAY_STORAGE_KEY,
  canvasGameSize,
  cycleGraphicsQuality,
  getGraphicsQuality,
  graphicsProfile,
  graphicsQualityLabel,
  overlayIntervalMs,
  parseGraphicsQuality,
  resetGraphicsQualityForTests,
  resetGraphicsQualityCache,
  setGraphicsQuality,
  shouldSpawnAmbientCitizen,
  decorCounterDuration,
  hudZoomCompensation,
  placeHudInScreen,
  wantPerfOverlay,
} from './graphics-quality.js';

afterEach(() => {
  resetGraphicsQualityForTests();
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    localStorage.removeItem(GRAPHICS_STORAGE_KEY);
    localStorage.removeItem(PERF_OVERLAY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe('parseGraphicsQuality', () => {
  it('defaults unknown values to balanced', () => {
    expect(parseGraphicsQuality(null)).toBe('balanced');
    expect(parseGraphicsQuality('')).toBe('balanced');
    expect(parseGraphicsQuality('ultra')).toBe('balanced');
    expect(parseGraphicsQuality('high')).toBe('high');
    expect(parseGraphicsQuality('ultra_sane_90')).toBe('ultra_sane_90');
    expect(parseGraphicsQuality('ultra_sane')).toBe('ultra_sane');
    expect(parseGraphicsQuality('performance')).toBe('performance');
  });
});

describe('graphicsProfile', () => {
  it('reuses an immutable profile instead of allocating in every frame', () => {
    const first = graphicsProfile('balanced');
    const second = graphicsProfile('balanced');
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('keeps high at native scale and 60 fps', () => {
    const p = graphicsProfile('high');
    expect(p.resolutionScale).toBe(1);
    expect(p.fpsTarget).toBe(60);
    expect(p.fpsLimit).toBe(0);
    expect(p.citizenStride).toBe(1);
    expect(p.nightLights).toBe(true);
    expect(p.movingLights).toBe(true);
    expect(p.entityShadows).toBe(true);
    expect(p.smoothPixelArt).toBe(false);
  });

  it('sets balanced crowd stride and no moving lanterns', () => {
    const p = graphicsProfile('balanced');
    expect(p.resolutionScale).toBe(1);
    expect(p.fpsTarget).toBe(60);
    expect(p.citizenStride).toBe(2);
    expect(p.movingLights).toBe(false);
    expect(p.nightLights).toBe(true);
    expect(p.ambientParticleScale).toBe(0.5);
    expect(p.havenDecorFx).toBe(true);
    expect(p.smoothPixelArt).toBe(false);
    expect(p.decorTweenScale).toBe(1);
    expect(p.havenDistrictHalos).toBe(false);
  });

  it('keeps ultra-sane visual density with a hard 60 fps cap', () => {
    const p = graphicsProfile('ultra_sane');
    expect(p.resolutionScale).toBe(1);
    expect(p.fpsTarget).toBe(60);
    expect(p.fpsLimit).toBe(60);
    expect(p.citizenStride).toBe(1);
    expect(p.nightLights).toBe(true);
    expect(p.movingLights).toBe(false);
    expect(p.ambientParticles).toBe(true);
    expect(p.ambientParticleScale).toBe(0.7);
    expect(p.entityShadows).toBe(true);
    expect(p.smoothPixelArt).toBe(false);
  });

  it('keeps ultra-sane-90 close to high with a hard 90 fps cap', () => {
    const p = graphicsProfile('ultra_sane_90');
    expect(p.resolutionScale).toBe(1);
    expect(p.fpsTarget).toBe(90);
    expect(p.fpsLimit).toBe(90);
    expect(p.citizenStride).toBe(1);
    expect(p.nightLights).toBe(true);
    expect(p.movingLights).toBe(false);
    expect(p.ambientParticles).toBe(true);
    expect(p.ambientParticleScale).toBe(0.8);
    expect(p.entityShadows).toBe(true);
  });

  it('caps performance at 30 fps and strips lights/crowd extras', () => {
    const p = graphicsProfile('performance');
    expect(p.resolutionScale).toBe(0.65);
    expect(p.fpsTarget).toBe(30);
    expect(p.fpsLimit).toBe(30);
    expect(p.citizenStride).toBe(3);
    expect(p.nightLights).toBe(false);
    expect(p.stars).toBe(false);
    expect(p.ambientParticles).toBe(false);
    expect(p.entityShadows).toBe(false);
    expect(p.ambientCritters).toBe(false);
    expect(p.citizenSocial).toBe(false);
    expect(p.cssVignette).toBe(false);
    expect(p.havenDecorFx).toBe(false);
    expect(p.smoothPixelArt).toBe(true);
    expect(p.havenVignettes).toBe(false);
    expect(p.havenDistrictHalos).toBe(false);
  });
});

describe('shouldSpawnAmbientCitizen', () => {
  it('always keeps night patrols', () => {
    expect(shouldSpawnAmbientCitizen(1, true, 3)).toBe(true);
    expect(shouldSpawnAmbientCitizen(2, true, 2)).toBe(true);
  });

  it('spawns every slot at stride 1', () => {
    expect(shouldSpawnAmbientCitizen(1, false, 1)).toBe(true);
    expect(shouldSpawnAmbientCitizen(5, false, 1)).toBe(true);
  });

  it('keeps even slots at stride 2', () => {
    expect(shouldSpawnAmbientCitizen(0, false, 2)).toBe(true);
    expect(shouldSpawnAmbientCitizen(1, false, 2)).toBe(false);
    expect(shouldSpawnAmbientCitizen(4, false, 2)).toBe(true);
  });

  it('keeps every third slot at stride 3', () => {
    expect(shouldSpawnAmbientCitizen(0, false, 3)).toBe(true);
    expect(shouldSpawnAmbientCitizen(1, false, 3)).toBe(false);
    expect(shouldSpawnAmbientCitizen(3, false, 3)).toBe(true);
  });
});

describe('canvasGameSize', () => {
  it('scales CSS size and floors at 640x360', () => {
    expect(canvasGameSize(1920, 1080, 0.65)).toEqual({
      width: Math.round(1920 * 0.65),
      height: Math.round(1080 * 0.65),
    });
    expect(canvasGameSize(800, 400, 0.65).width).toBeGreaterThanOrEqual(640);
    expect(canvasGameSize(800, 400, 0.65).height).toBeGreaterThanOrEqual(360);
  });
});

describe('cycle / labels / storage', () => {
  it('cycles high → ultra_sane_90 → ultra_sane → balanced → performance → high', () => {
    expect(cycleGraphicsQuality('high')).toBe('ultra_sane_90');
    expect(cycleGraphicsQuality('ultra_sane_90')).toBe('ultra_sane');
    expect(cycleGraphicsQuality('ultra_sane')).toBe('balanced');
    expect(cycleGraphicsQuality('balanced')).toBe('performance');
    expect(cycleGraphicsQuality('performance')).toBe('high');
  });

  it('uses Russian labels', () => {
    expect(graphicsQualityLabel('high')).toBe('высокая');
    expect(graphicsQualityLabel('ultra_sane_90')).toBe('ультра-90');
    expect(graphicsQualityLabel('ultra_sane')).toBe('ультра-сбаланс');
    expect(graphicsQualityLabel('balanced')).toBe('средняя');
    expect(graphicsQualityLabel('performance')).toBe('производительность');
  });

  it('persists quality across cache drop', () => {
    expect(getGraphicsQuality()).toBe('balanced');
    setGraphicsQuality('performance');
    expect(getGraphicsQuality()).toBe('performance');
    resetGraphicsQualityCache();
    expect(getGraphicsQuality()).toBe('performance');
  });

  it('throttles overlay to ~8 Hz', () => {
    expect(overlayIntervalMs(graphicsProfile('high'))).toBe(125);
    expect(overlayIntervalMs(graphicsProfile('performance'))).toBe(125);
  });

  it('skips looping decor on performance and keeps balanced at native speed', () => {
    expect(decorCounterDuration(1000, graphicsProfile('high'))).toBe(1000);
    expect(decorCounterDuration(1000, graphicsProfile('balanced'))).toBe(1000);
    expect(decorCounterDuration(1000, graphicsProfile('performance'))).toBeNull();
  });

  it('enables perf overlay from persisted setting', () => {
    expect(wantPerfOverlay()).toBe(false);
    const previousWindow = (globalThis as { window?: { location?: { search?: string } } }).window;
    const previousStorage = (globalThis as { localStorage?: Storage }).localStorage;
    const store = new Map<string, string>();
    const mockStorage = {
      getItem(key: string): string | null {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string): void {
        store.set(key, value);
      },
      removeItem(key: string): void {
        store.delete(key);
      },
      clear(): void {
        store.clear();
      },
      key(index: number): string | null {
        return [...store.keys()][index] ?? null;
      },
      get length(): number {
        return store.size;
      },
    } satisfies Storage;
    try {
      (globalThis as { window?: { location?: { search?: string } } }).window = {
        location: { search: '' },
      };
      (globalThis as { localStorage?: Storage }).localStorage = mockStorage;
      mockStorage.setItem(PERF_OVERLAY_STORAGE_KEY, '1');
      expect(wantPerfOverlay()).toBe(true);
    } finally {
      (globalThis as { window?: { location?: { search?: string } } }).window = previousWindow;
      (globalThis as { localStorage?: Storage }).localStorage = previousStorage;
    }
  });
});

describe('hudZoomCompensation', () => {
  it('undoes camera zoom around viewport center so top-right HUD stays on screen', () => {
    expect(hudZoomCompensation(1)).toBe(1);
    expect(hudZoomCompensation(0.8)).toBe(1.25);
    expect(hudZoomCompensation(0)).toBe(1);
    const obj = {
      scale: 1,
      x: 0,
      y: 0,
      setScale(v: number) {
        this.scale = v;
      },
      setPosition(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };
    const viewW = 1000;
    const viewH = 600;
    const zoom = 0.8;
    const screenX = viewW - 210 - 12;
    const screenY = 12;
    placeHudInScreen(obj, screenX, screenY, zoom, viewW, viewH);
    expect(obj.scale).toBe(1.25);
    const cx = viewW * 0.5;
    const cy = viewH * 0.5;
    expect(cx + (obj.x - cx) * zoom).toBeCloseTo(screenX);
    expect(cy + (obj.y - cy) * zoom).toBeCloseTo(screenY);
  });
});
