import type Phaser from 'phaser';
import { GROUND_LAYER_KEY, GROUND_RENDER_LAYER_KEY } from '../../sprites/world-collision-keys.js';
import { Depth } from '../constants/depth.js';

/** CPU TilemapLayer or Phaser 4 TilemapGPULayer — both extend TilemapLayerBase (`isTilemap`). */
export type GroundLayer = Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;

export interface GroundLayers {
  render: GroundLayer;
  collision: GroundLayer;
  gpu: boolean;
}

function tryCreate(
  map: Phaser.Tilemaps.Tilemap,
  tiles: Phaser.Tilemaps.Tileset,
  gpu: boolean,
): GroundLayer | null {
  try {
    return map.createLayer('ground', tiles, 0, 0, gpu);
  } catch {
    return null;
  }
}

export function isTilemapGpuLayer(layer: GroundLayer): layer is Phaser.Tilemaps.TilemapGPULayer {
  return typeof (layer as Phaser.Tilemaps.TilemapGPULayer).generateLayerDataTexture === 'function';
}

/** Prefer CPU for procedural/canvas sheets. File Images can use GPU when complete. */
export function preferGpuGround(tiles: Phaser.Tilemaps.Tileset): boolean {
  const src = tiles.image?.source?.[0]?.image;
  if (typeof HTMLImageElement === 'undefined' || !(src instanceof HTMLImageElement)) return false;
  // Haven/media strips: keep CPU — GPU path previously raced to black clear with terrain.
  return false;
}

/**
 * One layer only: LayerData.tilemapLayer can point at a single object.
 * Procedural `terrain-tiles` is a canvas sheet — always CPU TilemapLayer.
 * TilemapGPULayer + incomplete Image (addBase64 race) paints camera clear `#0f1115`.
 */
export function createGroundLayers(
  scene: Phaser.Scene,
  map: Phaser.Tilemaps.Tilemap,
  tiles: Phaser.Tilemaps.Tileset,
): GroundLayers | null {
  // Force CPU for canvas / procedural sheets. GPU only if caller already linked a file Image.
  const wantGpu = preferGpuGround(tiles);
  const gpuLayer = wantGpu ? tryCreate(map, tiles, true) : null;
  const render = gpuLayer ?? tryCreate(map, tiles, false);
  if (!render) return null;

  render.setDepth(Depth.Ground);
  const gpu = gpuLayer != null && isTilemapGpuLayer(gpuLayer);
  if (gpuLayer && isTilemapGpuLayer(gpuLayer)) {
    gpuLayer.generateLayerDataTexture();
  }

  scene.data.set(GROUND_LAYER_KEY, render);
  scene.data.set(GROUND_RENDER_LAYER_KEY, render);
  return { render, collision: render, gpu };
}
