import type Phaser from 'phaser';
import type { LocationConfig } from '../game/scenes/location-types.js';

const LIGHT2D_ENABLED_KEY = 'light2dEnabled';

export function shouldEnableLocationLight2D(location: LocationConfig): boolean {
  return location.id === 'empery_haven' && location.dayNight !== 'indoor' && location.dayNight !== 'dungeon';
}

export function setSceneLight2DEnabled(scene: Phaser.Scene, enabled: boolean): void {
  scene.data.set(LIGHT2D_ENABLED_KEY, enabled);
}

export function isSceneLight2DEnabled(scene: Phaser.Scene): boolean {
  return Boolean(scene.data.get(LIGHT2D_ENABLED_KEY));
}

export function applyLight2DPipeline(
  gameObject: { scene?: Phaser.Scene | null; setPipeline?: (name: string) => unknown } | null | undefined,
): void {
  if (!gameObject?.scene || typeof gameObject.setPipeline !== 'function') return;
  if (!isSceneLight2DEnabled(gameObject.scene)) return;
  try {
    gameObject.setPipeline('Light2D');
  } catch {
    /* renderer/pipeline may be unavailable */
  }
}
