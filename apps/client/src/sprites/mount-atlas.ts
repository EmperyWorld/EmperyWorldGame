import Phaser from 'phaser';
import type { SpriteFacingRow } from './facing4.js';
import { mountedLookId, type MountedLook } from './mounted-look.js';
import { MOUNT_FRAME_COUNT } from './mounted-pose.js';

const MOUNT_ATLAS_BASE = 'mount-atlas-v1';
/** Live key — bumps when atlas is repacked so existing sprites keep the previous texture. */
export let MOUNT_ATLAS_KEY = MOUNT_ATLAS_BASE;

const FW = 48;
const FH = 48;
export const MOUNT_FRAMES = MOUNT_FRAME_COUNT;
const PAD = 2;
const MAX_ATLAS = 2048;

/** CPU-side strips survive scene travel; GPU atlas rebuilt per scene as needed. */
const stripCache = new Map<string, HTMLCanvasElement>();
let atlasSerial = 0;
let previousMountAtlasKey: string | null = null;

export function isMountAtlasKey(key: string): boolean {
  return key === MOUNT_ATLAS_BASE || key.startsWith(`${MOUNT_ATLAS_BASE}-r`);
}

export function mountedFramePrefix(look: MountedLook, facing: SpriteFacingRow): string {
  return `mntf-${mountedLookId(look)}-${facing}`;
}

export function mountedFrameName(look: MountedLook, facing: SpriteFacingRow, frame: number): string {
  return `${mountedFramePrefix(look, facing)}-${frame}`;
}

/** Texture key for all mounted sprites (atlas). */
export function mountAtlasTextureKey(): string {
  return MOUNT_ATLAS_KEY;
}

export function hasMountStrip(scene: Phaser.Scene, prefix: string): boolean {
  if (!stripCache.has(prefix)) return false;
  if (!scene.textures.exists(MOUNT_ATLAS_KEY)) return false;
  return scene.textures.get(MOUNT_ATLAS_KEY).has(`${prefix}-0`);
}

export function cacheMountStrip(prefix: string, canvas: HTMLCanvasElement): void {
  stripCache.set(prefix, canvas);
}

export function getCachedMountStrip(prefix: string): HTMLCanvasElement | undefined {
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

/**
 * Rebuild GPU atlas from all cached strips. Idempotent when frames already present.
 * Incomplete packs bump the texture key instead of removing the live atlas.
 */
export function ensureMountAtlas(scene: Phaser.Scene): void {
  if (stripCache.size === 0) return;

  if (scene.textures.exists(MOUNT_ATLAS_KEY)) {
    const atlas = scene.textures.get(MOUNT_ATLAS_KEY);
    let complete = true;
    for (const prefix of stripCache.keys()) {
      if (!atlas.has(`${prefix}-0`)) {
        complete = false;
        break;
      }
    }
    if (complete) return;
    if (previousMountAtlasKey && scene.textures.exists(previousMountAtlasKey)) {
      stopSpritesOnTexture(scene, previousMountAtlasKey);
      purgeAnimsBoundToTexture(scene, previousMountAtlasKey);
      scene.textures.remove(previousMountAtlasKey);
    }
    previousMountAtlasKey = MOUNT_ATLAS_KEY;
    atlasSerial += 1;
    MOUNT_ATLAS_KEY = `${MOUNT_ATLAS_BASE}-r${atlasSerial}`;
    // Старые anims указывают на прошлый ключ — сбросим, registerMountedLook пересоздаст
    purgeAnimsBoundToTexture(scene, previousMountAtlasKey);
  }

  type Place = { prefix: string; sx: number; sy: number };
  const places: Place[] = [];
  let cursorX = PAD;
  let cursorY = PAD;
  let rowH = 0;
  let atlasW = 0;
  let atlasH = 0;
  const stripW = FW * MOUNT_FRAMES;
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
      console.warn('[mount-atlas] overflow, skipping', prefix);
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

  scene.textures.addCanvas(MOUNT_ATLAS_KEY, canvas);
  const atlas = scene.textures.get(MOUNT_ATLAS_KEY);
  for (const place of places) {
    for (let i = 0; i < MOUNT_FRAMES; i++) {
      atlas.add(`${place.prefix}-${i}`, 0, place.sx + i * FW, place.sy, FW, FH);
    }
  }
}
