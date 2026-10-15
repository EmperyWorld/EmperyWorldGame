import type Phaser from 'phaser';
import { isInsidePropAabb, propCollisionRevision } from './prop-colliders.js';
import { isTileBlockedAt } from './world-tiles.js';
import { GROUND_LAYER_KEY } from './world-collision-keys.js';

const caches = new WeakMap<Phaser.Scene, { revision: number; ground: unknown; doors: Map<string, { x: number; y: number } | null> }>();
/** Houses face south: approach the first clear point outside their ground footprint. */
export function resolveNpcHomeEntrance(scene: Phaser.Scene, x: number, y: number): { x: number; y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const revision = propCollisionRevision(scene), ground = scene.data?.get(GROUND_LAYER_KEY);
  let cache = caches.get(scene);
  if (!cache || cache.revision !== revision || cache.ground !== ground) { cache = { revision, ground, doors: new Map() }; caches.set(scene, cache); }
  const key = `${x}:${y}`;
  if (cache.doors.has(key)) return cache.doors.get(key)!;
  let door: { x: number; y: number } | null = null;
  for (let offset = 30; offset <= 256; offset += 8) {
    if (!isTileBlockedAt(scene, x, y + offset) && !isInsidePropAabb(scene, x, y + offset, 16)) { door = { x, y: y + offset }; break; }
  }
  cache.doors.set(key, door);
  return door;
}
