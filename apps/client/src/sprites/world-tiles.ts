import type Phaser from 'phaser';
import { GROUND_LAYER_KEY } from './world-collision-keys.js';
import { isWalkableTileGid, nudgeFromCollidingCell } from '../game/systems/world-geodata.js';
import type { GroundLayer } from '../game/systems/ground-layer.js';

export { GROUND_LAYER_KEY, GROUND_RENDER_LAYER_KEY } from './world-collision-keys.js';

export function setGroundCollisionLayer(scene: Phaser.Scene, layer: GroundLayer | null): void {
  if (layer) scene.data.set(GROUND_LAYER_KEY, layer);
  else scene.data.remove(GROUND_LAYER_KEY);
}

function groundLayerOf(scene: Phaser.Scene): GroundLayer | null {
  const layer = scene.data.get(GROUND_LAYER_KEY) as GroundLayer | undefined;
  return layer ?? null;
}

export function isTileBlockedAt(scene: Phaser.Scene, worldX: number, worldY: number): boolean {
  const layer = groundLayerOf(scene);
  if (!layer) return false;
  const tile = layer.getTileAtWorldXY(worldX, worldY, true);
  if (!tile) return true;
  if (typeof tile.collides === 'boolean') return tile.collides;
  return !isWalkableTileGid(tile.index);
}

export function nudgeFromGroundTiles(
  scene: Phaser.Scene,
  x: number,
  y: number,
): { x: number; y: number } {
  const layer = groundLayerOf(scene);
  if (!layer) return { x, y };
  const map = layer.tilemap;
  const tw = map.tileWidth || 64;
  const th = map.tileHeight || 64;
  return nudgeFromCollidingCell(x, y, tw, th, (tx, ty) => {
    const tile = layer.getTileAt(tx, ty, true);
    if (!tile) return true;
    if (typeof tile.collides === 'boolean') return tile.collides;
    return !isWalkableTileGid(tile.index);
  });
}
