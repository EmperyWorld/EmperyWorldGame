import Phaser from 'phaser';
import { clearPropOpaqueCache } from './prop-silhouette.js';

export const WORLD_MEDIA_ATLAS_KEY = 'world-media-atlas';

/** True when Phaser loaded a build-time atlas — do not CPU-rebuild it on travel. */
let fileWorldAtlasLoaded = false;

export function setFileWorldAtlasLoaded(active: boolean): void {
  fileWorldAtlasLoaded = active;
}

export function isFileWorldAtlasLoaded(): boolean {
  return fileWorldAtlasLoaded;
}

/** 4096 fits ~111×256px city props; 2048 overflowed and dropped landmarks. */
const MAX_ATLAS = 4096;
const PAD = 2;

function sourceSize(source: CanvasImageSource): { w: number; h: number } {
  if (source instanceof HTMLImageElement) return { w: source.naturalWidth, h: source.naturalHeight };
  if (source instanceof HTMLCanvasElement) return { w: source.width, h: source.height };
  if (source instanceof HTMLVideoElement) return { w: source.videoWidth, h: source.videoHeight };
  return { w: 64, h: 64 };
}

function isWorldMediaKey(key: string): boolean {
  return key.startsWith('prop-') || key.startsWith('npc-');
}

function isBaseFrame(name: string): boolean {
  return name === '__BASE' || name.startsWith('__BASE');
}

export function hasWorldMediaFrame(scene: Phaser.Scene, frame: string): boolean {
  if (!scene.textures.exists(WORLD_MEDIA_ATLAS_KEY)) return false;
  return scene.textures.get(WORLD_MEDIA_ATLAS_KEY).has(frame);
}

interface PackEntry {
  name: string;
  source: CanvasImageSource;
  w: number;
  h: number;
  sx: number;
  sy: number;
}

/**
 * Pack standalone `prop-*` / `npc-*` textures into one canvas atlas.
 * Idempotent across travel: merges new standalone keys into existing atlas frames.
 * Unpacked standalones are kept so placeProp can still draw them if the atlas fills up.
 */
export function packWorldMediaAtlas(scene: Phaser.Scene): void {
  if (fileWorldAtlasLoaded && scene.textures.exists(WORLD_MEDIA_ATLAS_KEY)) {
    return;
  }
  const standalone: string[] = [];
  for (const key of scene.textures.getTextureKeys()) {
    if (key === WORLD_MEDIA_ATLAS_KEY) continue;
    if (isWorldMediaKey(key)) standalone.push(key);
  }

  if (standalone.length === 0) return;

  const entries: PackEntry[] = [];
  const seen = new Set<string>();

  for (const key of standalone) {
    const tex = scene.textures.get(key);
    const src = tex.getSourceImage() as CanvasImageSource;
    const { w, h } = sourceSize(src);
    if (w < 1 || h < 1) continue;
    entries.push({ name: key, source: src, w, h, sx: 0, sy: 0 });
    seen.add(key);
  }

  if (scene.textures.exists(WORLD_MEDIA_ATLAS_KEY)) {
    const atlas = scene.textures.get(WORLD_MEDIA_ATLAS_KEY);
    const src = atlas.getSourceImage() as CanvasImageSource;
    for (const name of atlas.getFrameNames()) {
      if (isBaseFrame(name) || seen.has(name)) continue;
      const frame = atlas.get(name);
      const w = frame.cutWidth;
      const h = frame.cutHeight;
      if (w < 1 || h < 1) continue;
      const crop = document.createElement('canvas');
      crop.width = w;
      crop.height = h;
      const ctx = crop.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(src, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
      entries.push({ name, source: crop, w, h, sx: 0, sy: 0 });
      seen.add(name);
    }
  }

  if (entries.length === 0) return;

  // Shrink if raw 256px stack won't fit (old 2048 atlas dropped ~40% of city landmarks).
  const rawArea = entries.reduce((s, e) => s + (e.w + PAD) * (e.h + PAD), 0);
  if (rawArea > MAX_ATLAS * MAX_ATLAS * 0.92) {
    const target = 128;
    for (const entry of entries) {
      if (entry.w <= target && entry.h <= target) continue;
      const canvas = document.createElement('canvas');
      canvas.width = target;
      canvas.height = target;
      const c = canvas.getContext('2d')!;
      c.drawImage(entry.source, 0, 0, target, target);
      entry.source = canvas;
      entry.w = target;
      entry.h = target;
    }
  }

  entries.sort((a, b) => b.h - a.h || b.w - a.w);

  let cursorX = PAD;
  let cursorY = PAD;
  let rowH = 0;
  let atlasW = 0;
  let atlasH = 0;
  let skipped = 0;

  for (const entry of entries) {
    const cellW = entry.w + PAD;
    const cellH = entry.h + PAD;
    if (cursorX + cellW > MAX_ATLAS && cursorX > PAD) {
      cursorX = PAD;
      cursorY += rowH + PAD;
      rowH = 0;
    }
    if (cursorY + cellH > MAX_ATLAS) {
      console.warn('[world-media-atlas] overflow, keeping standalone', entry.name);
      entry.w = 0;
      skipped++;
      continue;
    }
    entry.sx = cursorX;
    entry.sy = cursorY;
    cursorX += cellW;
    rowH = Math.max(rowH, entry.h);
    atlasW = Math.max(atlasW, entry.sx + entry.w + PAD);
    atlasH = Math.max(atlasH, entry.sy + entry.h + PAD);
  }

  const placed = entries.filter((e) => e.w > 0);
  if (placed.length === 0) return;

  const canvas = document.createElement('canvas');
  canvas.width = Math.min(MAX_ATLAS, Math.max(64, atlasW));
  canvas.height = Math.min(MAX_ATLAS, Math.max(64, atlasH));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const entry of placed) {
    ctx.drawImage(entry.source, entry.sx, entry.sy, entry.w, entry.h);
  }

  const placedNames = new Set(placed.map((e) => e.name));
  // Only drop textures that actually made it into the atlas — overflowed ones stay drawable.
  for (const key of standalone) {
    if (placedNames.has(key) && scene.textures.exists(key)) scene.textures.remove(key);
  }
  if (scene.textures.exists(WORLD_MEDIA_ATLAS_KEY)) {
    scene.textures.remove(WORLD_MEDIA_ATLAS_KEY);
  }

  scene.textures.addCanvas(WORLD_MEDIA_ATLAS_KEY, canvas);
  const atlas = scene.textures.get(WORLD_MEDIA_ATLAS_KEY);
  for (const entry of placed) {
    atlas.add(entry.name, 0, entry.sx, entry.sy, entry.w, entry.h);
  }

  // Silhouette cache may still point at pre-atlas standalone sources.
  clearPropOpaqueCache();

  if (skipped > 0) {
    console.warn(`[world-media-atlas] packed ${placed.length}, kept ${skipped} as standalone`);
  }
}
