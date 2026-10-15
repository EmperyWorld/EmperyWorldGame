import type Phaser from 'phaser';
import { isInsidePropAabb, nudgePointFromPropColliders } from './prop-colliders.js';
import { isTileBlockedAt } from './world-tiles.js';
export interface NpcAnchor { x: number; y: number }
/** Resolve authored outdoor points against collision geometry, never sprite-image bounds. */
export function resolveNpcAnchor(scene: Phaser.Scene, x: number, y: number): NpcAnchor | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const clear = (px: number, py: number) => !isTileBlockedAt(scene, px, py) && !isInsidePropAabb(scene, px, py, 16);
  if (clear(x, y)) return { x, y };
  const projected = nudgePointFromPropColliders(scene, x, y, 16);
  if (Math.hypot(projected.x - x, projected.y - y) <= 256 && clear(projected.x, projected.y)) return projected;
  for (let radius = 16; radius <= 256; radius += 16) {
    let best: NpcAnchor | null = null, distance = Infinity;
    for (let dy = -radius; dy <= radius; dy += 16) for (let dx = -radius; dx <= radius; dx += 16) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const d = dx * dx + dy * dy;
      if (d < distance && clear(x + dx, y + dy)) { distance = d; best = { x: x + dx, y: y + dy }; }
    }
    if (best) return best;
  }
  return null;
}
