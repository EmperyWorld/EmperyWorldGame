import { bustMediaUrl } from './media-url.js';
import type { MediaManifest } from './api.js';
import { hudAtlasBackgroundStyle } from './hud-atlas-style.js';

export interface HudAtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

let imageUrl: string | null = null;
let atlasW = 0;
let atlasH = 0;
let frames: Record<string, HudAtlasFrame> = {};
let loadedAt: string | undefined;

export function getHudAtlasImageUrl(): string | null {
  return imageUrl;
}

export function hudAtlasFrame(assetId: string): HudAtlasFrame | undefined {
  return frames[assetId];
}

export function resetHudAtlasForTests(): void {
  imageUrl = null;
  frames = {};
  atlasW = 0;
  atlasH = 0;
  loadedAt = undefined;
}

interface PhaserHashAtlas {
  frames?: Record<string, { frame?: { x: number; y: number; w: number; h: number } }>;
  meta?: { size?: { w: number; h: number } };
}

export async function ensureHudAtlas(manifest: MediaManifest): Promise<void> {
  const ref = manifest.atlases?.hud;
  const stamp = manifest.cacheRevision ?? manifest.generatedAt ?? '';
  if (!ref) {
    resetHudAtlasForTests();
    return;
  }
  if (loadedAt === stamp && imageUrl) return;
  try {
    const res = await fetch(bustMediaUrl(ref.json, stamp));
    if (!res.ok) return;
    const json = (await res.json()) as PhaserHashAtlas;
    const next: Record<string, HudAtlasFrame> = {};
    for (const [id, entry] of Object.entries(json.frames ?? {})) {
      const f = entry.frame;
      if (!f) continue;
      next[id] = { x: f.x, y: f.y, w: f.w, h: f.h };
    }
    frames = next;
    atlasW = json.meta?.size?.w ?? ref.width;
    atlasH = json.meta?.size?.h ?? ref.height;
    imageUrl = bustMediaUrl(ref.image, stamp);
    loadedAt = stamp;
  } catch {
    /* keep previous */
  }
}

/** CSS sprite from hud atlas, or a plain <img> fallback. */
export function mediaIconElement(
  assetId: string,
  opts: { url?: string; alt?: string; className?: string } = {},
): HTMLElement {
  const frame = frames[assetId];
  if (frame && imageUrl) {
    const el = document.createElement('span');
    el.className = opts.className ? `${opts.className} hud-atlas-icon` : 'hud-atlas-icon';
    el.setAttribute('role', 'img');
    if (opts.alt) el.setAttribute('aria-label', opts.alt);
    el.style.display = 'block';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.backgroundImage = `url("${imageUrl}")`;
    el.style.backgroundRepeat = 'no-repeat';
    const style = hudAtlasBackgroundStyle(frame, atlasW, atlasH);
    el.style.backgroundSize = style.backgroundSize;
    el.style.backgroundPosition = style.backgroundPosition;
    return el;
  }
  const img = document.createElement('img');
  if (opts.className) img.className = opts.className;
  if (opts.url) img.src = opts.url;
  img.alt = opts.alt ?? '';
  img.loading = 'lazy';
  return img;
}

export function appendMediaIcon(
  parent: HTMLElement,
  assetId: string,
  opts: { url?: string; alt?: string; onError?: () => void } = {},
): void {
  const el = mediaIconElement(assetId, opts);
  if (el instanceof HTMLImageElement && opts.onError) {
    el.onerror = () => {
      el.remove();
      opts.onError?.();
    };
  }
  parent.appendChild(el);
}
