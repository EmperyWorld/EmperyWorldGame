/**
 * Runtime alpha sampling for prop colliders.
 * Pure collider math: prop-silhouette-math.ts (no Phaser).
 */
import {
  boundsFromImageData,
  type PropOpaqueNorm,
} from './prop-silhouette-math.js';

export type {
  PropOpaqueNorm,
  PropOpaqueBand,
  SilhouetteColliderMode,
} from './prop-silhouette-math.js';
export {
  PROP_SPRITE_ORIGIN_Y,
  behindOcclusionStrip,
  opaqueSouthY,
  silhouetteColliderBoxes,
  silhouetteFootprintWorld,
  boundsFromImageData,
} from './prop-silhouette-math.js';

const SAMPLE = 96;
const cache = new Map<string, PropOpaqueNorm | null>();

/** Duck-typed texture access — avoids importing Phaser into unit-test graphs. */
interface TextureScene {
  textures: {
    exists: (key: string) => boolean;
    get: (key: string) => {
      has: (frame: string) => boolean;
      get: (frame?: string) => {
        cutWidth: number;
        width: number;
        cutHeight: number;
        height: number;
        cutX: number;
        cutY: number;
      };
      // Phaser may return RenderTexture; runtime only uses canvas/image sources.
      getSourceImage: () => unknown;
    };
  };
}

const WORLD_MEDIA_ATLAS_KEY = 'world-media-atlas';

function propFrameKey(assetId: string): string {
  return `prop-${assetId}`;
}

function readFrameImageData(
  scene: TextureScene,
  textureKey: string,
  frameName?: string,
): ImageData | null {
  if (!scene.textures.exists(textureKey)) return null;
  const tex = scene.textures.get(textureKey);
  const frame = frameName && tex.has(frameName) ? tex.get(frameName) : tex.get();
  const src = tex.getSourceImage();
  if (!src || typeof (src as CanvasImageSource) !== 'object') return null;
  // Skip Phaser RenderTexture — only HTMLImage/Canvas are readable via 2d context.
  if (!('width' in (src as object) || 'naturalWidth' in (src as object))) return null;
  const w = Math.max(1, Math.floor(frame.cutWidth || frame.width));
  const h = Math.max(1, Math.floor(frame.cutHeight || frame.height));
  if (w < 2 || h < 2) return null;

  const sw = Math.min(SAMPLE, w);
  const sh = Math.min(SAMPLE, h);
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(src as CanvasImageSource, frame.cutX, frame.cutY, w, h, 0, 0, sw, sh);
    return ctx.getImageData(0, 0, sw, sh);
  } catch {
    return null;
  }
}

/** Scan prop texture alpha → opaque AABB. Cached per asset. */
export function getPropOpaqueBounds(
  scene: TextureScene,
  assetId: string,
): PropOpaqueNorm | null {
  if (cache.has(assetId)) return cache.get(assetId)!;

  const frame = propFrameKey(assetId);
  let data: ImageData | null = null;
  if (scene.textures.exists(WORLD_MEDIA_ATLAS_KEY) && scene.textures.get(WORLD_MEDIA_ATLAS_KEY).has(frame)) {
    data = readFrameImageData(scene, WORLD_MEDIA_ATLAS_KEY, frame);
  } else if (scene.textures.exists(frame)) {
    data = readFrameImageData(scene, frame);
  }

  const bounds = data ? boundsFromImageData(data) : null;
  cache.set(assetId, bounds);
  return bounds;
}

export function clearPropOpaqueCache(): void {
  cache.clear();
}
