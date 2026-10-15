import Phaser from 'phaser';
import type { SpriteFacingRow } from './facing4.js';

const GEAR_ATLAS_BASE = 'gear-atlas-v1';
/** Live key — bumps when atlas is repacked so existing sprites keep the previous texture. */
export let GEAR_ATLAS_KEY = GEAR_ATLAS_BASE;

const FW = 48;
const FH = 48;
export const GEAR_FRAMES = 6;
const PAD = 2;
const MAX_ATLAS = 2048;

const stripCache = new Map<string, HTMLCanvasElement>();
let atlasSerial = 0;
/** Kept alive one generation so sprites can rebind before GPU free. */
let previousGearAtlasKey: string | null = null;

export function isGearAtlasKey(key: string): boolean {
  return key === GEAR_ATLAS_BASE || key.startsWith(`${GEAR_ATLAS_BASE}-r`);
}

export function cloakFramePrefix(variant: string, facing: SpriteFacingRow): string {
  return `clk-${variant}-${facing}`;
}

export function cloakFrameName(variant: string, facing: SpriteFacingRow, frame: number): string {
  return `${cloakFramePrefix(variant, facing)}-${frame}`;
}

export function shieldFramePrefix(variant: string): string {
  return `shd-${variant}`;
}

export function shieldFrameName(variant: string, frame: number): string {
  return `${shieldFramePrefix(variant)}-${frame}`;
}

export function weaponFramePrefix(kind: string, facing: string): string {
  return `wpn-${kind}-${facing}`;
}

export function weaponFrameName(kind: string, facing: string, frame: number): string {
  return `${weaponFramePrefix(kind, facing)}-${frame}`;
}

export function hasGearStrip(scene: Phaser.Scene, prefix: string): boolean {
  if (!stripCache.has(prefix)) return false;
  if (!scene.textures.exists(GEAR_ATLAS_KEY)) return false;
  return scene.textures.get(GEAR_ATLAS_KEY).has(`${prefix}-0`);
}

export function cacheGearStrip(prefix: string, canvas: HTMLCanvasElement): void {
  stripCache.set(prefix, canvas);
}

export function getCachedGearStrip(prefix: string): HTMLCanvasElement | undefined {
  return stripCache.get(prefix);
}

function purgeAnimsBoundToTexture(scene: Phaser.Scene, textureKey: string): void {
  const customMap = (
    scene.anims as unknown as {
      anims?: {
        entries?: Record<string, Phaser.Animations.Animation>;
        each?: (cb: (key: string, anim: Phaser.Animations.Animation) => void) => void;
      };
    }
  ).anims;
  if (!customMap) return;
  const doomed: string[] = [];
  const collect = (key: string, anim: Phaser.Animations.Animation) => {
    if (anim.frames?.[0]?.textureKey === textureKey) doomed.push(key);
  };
  if (typeof customMap.each === 'function') {
    customMap.each(collect);
  } else if (customMap.entries) {
    for (const key of Object.keys(customMap.entries)) {
      const anim = customMap.entries[key];
      if (anim) collect(key, anim);
    }
  }
  for (const key of doomed) {
    scene.anims.remove(key);
  }
}

function stopSpritesOnTexture(scene: Phaser.Scene, textureKey: string): void {
  scene.children.each((child) => {
    const spr = child as Phaser.GameObjects.Sprite;
    if (!spr || typeof spr.anims?.stop !== 'function') return;
    if (spr.texture?.key === textureKey) {
      try {
        spr.anims.stop();
      } catch {
        /* ignore */
      }
    }
  });
}

export function ensureGearAtlas(scene: Phaser.Scene): void {
  if (stripCache.size === 0) return;

  if (scene.textures.exists(GEAR_ATLAS_KEY)) {
    const atlas = scene.textures.get(GEAR_ATLAS_KEY);
    let complete = true;
    for (const prefix of stripCache.keys()) {
      if (!atlas.has(`${prefix}-0`)) {
        complete = false;
        break;
      }
    }
    if (complete) return;
    // Bump key; keep previous one generation, then drop older GPU textures.
    if (previousGearAtlasKey && scene.textures.exists(previousGearAtlasKey)) {
      stopSpritesOnTexture(scene, previousGearAtlasKey);
      purgeAnimsBoundToTexture(scene, previousGearAtlasKey);
      scene.textures.remove(previousGearAtlasKey);
    }
    previousGearAtlasKey = GEAR_ATLAS_KEY;
    atlasSerial += 1;
    GEAR_ATLAS_KEY = `${GEAR_ATLAS_BASE}-r${atlasSerial}`;
    purgeAnimsBoundToTexture(scene, previousGearAtlasKey);
  }

  type Place = { prefix: string; sx: number; sy: number };
  const places: Place[] = [];
  let cursorX = PAD;
  let cursorY = PAD;
  let rowH = 0;
  let atlasW = 0;
  let atlasH = 0;
  const stripW = FW * GEAR_FRAMES;
  const stripH = FH;

  for (const prefix of stripCache.keys()) {
    const cellW = stripW + PAD;
    const cellH = stripH + PAD;
    if (cursorX + cellW > MAX_ATLAS && cursorX > PAD) {
      cursorX = PAD;
      cursorY += rowH + PAD;
      rowH = 0;
    }
    if (cursorY + cellH > MAX_ATLAS) {
      console.warn('[gear-atlas] overflow, skipping', prefix);
      continue;
    }
    places.push({ prefix, sx: cursorX, sy: cursorY });
    cursorX += cellW;
    rowH = Math.max(rowH, stripH);
    atlasW = Math.max(atlasW, cursorX);
    atlasH = Math.max(atlasH, cursorY + cellH);
  }

  if (places.length === 0) return;

  const canvas = document.createElement('canvas');
  canvas.width = Math.min(MAX_ATLAS, Math.max(64, atlasW));
  canvas.height = Math.min(MAX_ATLAS, Math.max(64, atlasH));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const place of places) {
    const strip = stripCache.get(place.prefix);
    if (!strip) continue;
    ctx.drawImage(strip, place.sx, place.sy);
  }

  scene.textures.addCanvas(GEAR_ATLAS_KEY, canvas);
  const atlas = scene.textures.get(GEAR_ATLAS_KEY);
  for (const place of places) {
    for (let i = 0; i < GEAR_FRAMES; i++) {
      atlas.add(`${place.prefix}-${i}`, 0, place.sx + i * FW, place.sy, FW, FH);
    }
  }
}
