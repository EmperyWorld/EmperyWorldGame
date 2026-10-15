import Phaser from 'phaser';
import { Depth, propDepth, propDepthFromSortY, PROP_SPRITE_ORIGIN_Y } from '../game/constants/depth.js';
import { addPropFootprint } from './prop-colliders.js';
import { propAllowsWalkBehind, propLayerKind } from './prop-layer.js';
import { getPropOpaqueBounds, opaqueSouthY } from './prop-silhouette.js';
import { placeProp } from './texture-loader.js';

const PROP_SHADOW_GFX_KEY = 'propGroundShadowGfx';

function occlusionProfile(
  kind: ReturnType<typeof propLayerKind>,
): 'mass' | 'stall' | 'arch' {
  if (kind === 'stall') return 'stall';
  if (kind === 'arch') return 'arch';
  return 'mass';
}

/** Resolve draw depth for a world prop from layer kind + silhouette. */
export function resolvePropDepth(
  scene: Phaser.Scene,
  assetId: string,
  anchorY: number,
  displaySize: number,
): number {
  if (!propAllowsWalkBehind(assetId)) {
    return Depth.Decor + anchorY * 0.00005;
  }
  const kind = propLayerKind(assetId);
  const opaque = getPropOpaqueBounds(scene, assetId);
  if (opaque) {
    // Arches: stronger negative bias so the player wins Y-ties in the opening.
    const bias = kind === 'arch' ? -0.004 : -0.0008;
    return propDepthFromSortY(
      opaqueSouthY(anchorY, displaySize, opaque, PROP_SPRITE_ORIGIN_Y, occlusionProfile(kind)),
      bias,
    );
  }
  return propDepth(anchorY, displaySize);
}

function ensureShadowGfx(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  let g = scene.data.get(PROP_SHADOW_GFX_KEY) as Phaser.GameObjects.Graphics | undefined;
  if (g?.active) return g;
  g = scene.add.graphics().setDepth(2);
  scene.data.set(PROP_SHADOW_GFX_KEY, g);
  return g;
}

/** Batched ground blob (one Graphics) — avoids hundreds of Ellipse objects. */
export function addPropGroundShadow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  kind: ReturnType<typeof propLayerKind>,
): void {
  if (size < 100 || kind === 'flat') return;
  const alpha = kind === 'trunk' ? 0.14 : kind === 'stall' ? 0.16 : 0.2;
  const g = ensureShadowGfx(scene);
  g.fillStyle(0x000000, alpha);
  g.fillEllipse(x, y + size * 0.05, size * 0.4, size * 0.15);
}

/**
 * Place prop art + footprint collider with correct flat/behind/trunk/arch/stall depth.
 * Returns the image, or null if texture missing.
 */
export function placeWorldProp(
  scene: Phaser.Scene,
  assetId: string,
  x: number,
  y: number,
  size: number,
): Phaser.GameObjects.Image | null {
  const depth = resolvePropDepth(scene, assetId, y, size);
  const img = placeProp(scene, assetId, x, y, size, depth);
  if (!img) return null;
  addPropFootprint(scene, assetId, x, y, size);
  if (assetId !== 'prop_hq_lounge_sofa') addPropGroundShadow(scene, x, y, size, propLayerKind(assetId));
  return img;
}
