/** Client graphics quality — localStorage, same pattern as `empery-survival-fx`. */

import {
  type GraphicsQualitySetting,
  LEGACY_GRAPHICS_STORAGE_KEY,
  LEGACY_PERF_OVERLAY_STORAGE_KEY,
  getClientSetting,
  resetClientSettingsCacheForTests,
  setClientSetting,
} from '../../settings-store.js';

export const GRAPHICS_STORAGE_KEY = LEGACY_GRAPHICS_STORAGE_KEY;
export const GRAPHICS_CHANGED_EVENT = 'empery-graphics';
export const PERF_OVERLAY_STORAGE_KEY = LEGACY_PERF_OVERLAY_STORAGE_KEY;

export type GraphicsQuality = GraphicsQualitySetting;

export interface GraphicsProfile {
  quality: GraphicsQuality;
  /** Drawing buffer / game size vs CSS parent. Camera zoom matches so FOV stays. */
  resolutionScale: number;
  fpsTarget: number;
  /** Phaser TimeStep limit; 0 = uncapped (vsync). */
  fpsLimit: number;
  /** Spawn every Nth ambient citizen. Night patrols always spawn. */
  citizenStride: number;
  nightLights: boolean;
  movingLights: boolean;
  stars: boolean;
  ambientParticles: boolean;
  ambientParticleScale: number;
  entityShadows: boolean;
  ambientCritters: boolean;
  citizenSocial: boolean;
  /** Looping Graphics counters (smoke, flags, embers). False = draw once. */
  havenDecorFx: boolean;
  /** Phaser 4 smoothPixelArt — only on downscaled performance profile. */
  smoothPixelArt: boolean;
  /** Duration multiplier when havenDecorFx is on (1 = real time). */
  decorTweenScale: number;
  /** Basketball court, cats, sandbox, extra garrison bits. */
  havenVignettes: boolean;
  /** Extra district cobble dots / inner halos. */
  havenDistrictHalos: boolean;
  overlayHz: number;
  cssVignette: boolean;
  powerPreference: 'high-performance' | 'low-power';
}

const PROFILES: Record<GraphicsQuality, Omit<GraphicsProfile, 'quality'>> = {
  high: {
    resolutionScale: 1,
    fpsTarget: 60,
    fpsLimit: 0,
    citizenStride: 1,
    nightLights: true,
    movingLights: true,
    stars: true,
    ambientParticles: true,
    ambientParticleScale: 1,
    entityShadows: true,
    ambientCritters: true,
    citizenSocial: true,
    havenDecorFx: true,
    smoothPixelArt: false,
    decorTweenScale: 1,
    havenVignettes: true,
    havenDistrictHalos: true,
    overlayHz: 8,
    cssVignette: true,
    powerPreference: 'high-performance',
  },
  ultra_sane_90: {
    resolutionScale: 1,
    fpsTarget: 90,
    fpsLimit: 90,
    citizenStride: 1,
    nightLights: true,
    movingLights: false,
    stars: true,
    ambientParticles: true,
    ambientParticleScale: 0.8,
    entityShadows: true,
    ambientCritters: true,
    citizenSocial: true,
    havenDecorFx: true,
    smoothPixelArt: false,
    decorTweenScale: 1,
    havenVignettes: true,
    havenDistrictHalos: false,
    overlayHz: 8,
    cssVignette: true,
    powerPreference: 'high-performance',
  },
  ultra_sane: {
    resolutionScale: 1,
    fpsTarget: 60,
    fpsLimit: 60,
    citizenStride: 1,
    nightLights: true,
    movingLights: false,
    stars: true,
    ambientParticles: true,
    ambientParticleScale: 0.7,
    entityShadows: true,
    ambientCritters: true,
    citizenSocial: true,
    havenDecorFx: true,
    smoothPixelArt: false,
    decorTweenScale: 1,
    havenVignettes: true,
    havenDistrictHalos: false,
    overlayHz: 8,
    cssVignette: true,
    powerPreference: 'high-performance',
  },
  balanced: {
    resolutionScale: 1,
    fpsTarget: 60,
    fpsLimit: 0,
    citizenStride: 2,
    nightLights: true,
    movingLights: false,
    stars: true,
    ambientParticles: true,
    ambientParticleScale: 0.5,
    entityShadows: true,
    ambientCritters: true,
    citizenSocial: true,
    havenDecorFx: true,
    smoothPixelArt: false,
    decorTweenScale: 1,
    havenVignettes: true,
    havenDistrictHalos: false,
    overlayHz: 8,
    cssVignette: true,
    powerPreference: 'high-performance',
  },
  performance: {
    resolutionScale: 0.65,
    fpsTarget: 30,
    fpsLimit: 30,
    citizenStride: 3,
    nightLights: false,
    movingLights: false,
    stars: false,
    ambientParticles: false,
    ambientParticleScale: 0,
    entityShadows: false,
    ambientCritters: false,
    citizenSocial: false,
    havenDecorFx: false,
    smoothPixelArt: true,
    decorTweenScale: 1,
    havenVignettes: false,
    havenDistrictHalos: false,
    overlayHz: 8,
    cssVignette: false,
    powerPreference: 'low-power',
  },
};

const PROFILE_CACHE = {} as Record<GraphicsQuality, GraphicsProfile>;
for (const quality of Object.keys(PROFILES) as GraphicsQuality[]) {
  PROFILE_CACHE[quality] = Object.freeze({
    quality,
    ...PROFILES[quality],
  });
}

let cached: GraphicsQuality | null = null;
let memoryQuality: GraphicsQuality | null = null;

export function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return (
    value === 'high' ||
    value === 'ultra_sane_90' ||
    value === 'ultra_sane' ||
    value === 'balanced' ||
    value === 'performance'
  );
}

export function parseGraphicsQuality(raw: string | null | undefined): GraphicsQuality {
  return isGraphicsQuality(raw) ? raw : 'balanced';
}

export function graphicsProfile(quality: GraphicsQuality): GraphicsProfile {
  return PROFILE_CACHE[quality];
}

export function graphicsQualityLabel(quality: GraphicsQuality): string {
  if (quality === 'high') return 'высокая';
  if (quality === 'ultra_sane_90') return 'ультра-90';
  if (quality === 'ultra_sane') return 'ультра-сбаланс';
  if (quality === 'balanced') return 'средняя';
  return 'производительность';
}

export function cycleGraphicsQuality(current: GraphicsQuality): GraphicsQuality {
  if (current === 'high') return 'ultra_sane_90';
  if (current === 'ultra_sane_90') return 'ultra_sane';
  if (current === 'ultra_sane') return 'balanced';
  if (current === 'balanced') return 'performance';
  return 'high';
}

export function shouldSpawnAmbientCitizen(
  slotIndex: number,
  nightPatrolOnly: boolean,
  stride: number,
): boolean {
  if (nightPatrolOnly) return true;
  if (stride <= 1) return true;
  return slotIndex % stride === 0;
}

/**
 * Camera zoom multiplies scrollFactor-0 HUD. Return 1/zoom so overlay/minimap stay screen-sized.
 */
export function hudZoomCompensation(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return 1 / zoom;
}

/** Pin a HUD object to screen pixels despite camera zoom around viewport center. */
export function placeHudInScreen(
  obj: {
    setScale: (x: number, y?: number) => unknown;
    setPosition: (x: number, y: number) => unknown;
  },
  screenX: number,
  screenY: number,
  zoom: number,
  viewW: number,
  viewH: number,
): void {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const w = viewW > 0 ? viewW : 1;
  const h = viewH > 0 ? viewH : 1;
  obj.setScale(hudZoomCompensation(z));
  obj.setPosition(w * 0.5 + (screenX - w * 0.5) / z, h * 0.5 + (screenY - h * 0.5) / z);
}

export function canvasGameSize(
  cssW: number,
  cssH: number,
  scale: number,
): { width: number; height: number } {
  const s = Math.min(1, Math.max(0.4, scale));
  const w = Number.isFinite(cssW) ? cssW : 1280;
  const h = Number.isFinite(cssH) ? cssH : 720;
  return {
    width: Math.max(640, Math.round(Math.max(1, w) * s)),
    height: Math.max(360, Math.round(Math.max(1, h) * s)),
  };
}

function readStoredQuality(): GraphicsQuality {
  if (memoryQuality) return memoryQuality;
  const stored = getClientSetting('graphicsQuality');
  if (isGraphicsQuality(stored)) return stored;
  return 'balanced';
}

export function getGraphicsQuality(): GraphicsQuality {
  cached ??= readStoredQuality();
  return cached;
}

export function getGraphicsProfile(): GraphicsProfile {
  return graphicsProfile(getGraphicsQuality());
}

export function setGraphicsQuality(quality: GraphicsQuality): GraphicsProfile {
  cached = quality;
  memoryQuality = quality;
  setClientSetting('graphicsQuality', quality);
  applyGraphicsDocument(quality);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(GRAPHICS_CHANGED_EVENT));
  }
  return graphicsProfile(quality);
}

export function applyGraphicsDocument(quality = getGraphicsQuality()): void {
  if (typeof document === 'undefined') return;
  const profile = graphicsProfile(quality);
  document.documentElement.dataset.graphics = quality;
  document.documentElement.classList.toggle('graphics-no-vignette', !profile.cssVignette);
}

/** Tests only — drop memo so the next get() re-reads storage. */
export function resetGraphicsQualityCache(): void {
  cached = null;
  resetClientSettingsCacheForTests();
}

/** Tests only — forget session + memo. */
export function resetGraphicsQualityForTests(): void {
  cached = null;
  memoryQuality = null;
  resetClientSettingsCacheForTests();
}

export function overlayIntervalMs(profile = getGraphicsProfile()): number {
  return Math.round(1000 / Math.max(1, profile.overlayHz));
}

/** `null` = draw first frame only, do not loop. */
export function decorCounterDuration(baseMs: number, profile = getGraphicsProfile()): number | null {
  if (!profile.havenDecorFx) return null;
  const scaled = Math.round(baseMs * Math.max(1, profile.decorTweenScale));
  return Math.max(200, scaled);
}

export function wantPerfOverlay(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).has('perf')) return true;
    return getClientSetting('perfOverlayEnabled');
  } catch {
    return false;
  }
}
