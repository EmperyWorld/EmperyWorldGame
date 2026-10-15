import type Phaser from 'phaser';
import { havenTileCenter, resolveAmbientSleepTile } from '@empery/shared';
import type { CitizenDef } from './haven-ambient-defs.js';
import { resolveNpcAnchor } from './npc-anchor.js';
import { resolveNpcHomeEntrance } from './npc-home-entrance.js';

/** Indoor pose, outdoor entrance, post and patrol are distinct coordinate roles. */
export function ambientPlacement(scene: Phaser.Scene, def: CitizenDef, index: number) {
  const origin = def.tiles[0];
  if (!origin) return null;
  // The definition's district route owns its post. A separate slot-index table
  // previously assigned field workers a workplace inside the closed city walls.
  const [wx, wy] = def.workTile ?? origin;
  const [hx, hy] = resolveAmbientSleepTile(origin[0], origin[1], index, def.sleepTile);
  const originWorld = havenTileCenter(origin[0], origin[1]);
  const authoredPath = def.pathOffsets
    ? def.pathOffsets.map(([dx, dy]) => ({ x: originWorld.x + dx, y: originWorld.y + dy }))
    : def.tiles.map(([tx, ty]) => havenTileCenter(tx, ty));
  if (authoredPath.length === 0) return null;
  const indoor = havenTileCenter(hx, hy), work = def.pathOffsets ? authoredPath[0]! : havenTileCenter(wx, wy);
  const post = resolveNpcAnchor(scene, work.x, work.y);
  const door = resolveNpcHomeEntrance(scene, indoor.x, indoor.y);
  const path = authoredPath.map(p => resolveNpcAnchor(scene, p.x, p.y));
  if (!post || !door || path.some(point => point === null)) return null;
  return { indoor, door, post, path: path.filter(point => point !== null) };
}

/** Turn single-tile sitters into short loiter loops (keeps ~1/3 as pure sitters). */
export function ambientPatrolPlacement(
  scene: Phaser.Scene,
  def: CitizenDef,
  index: number,
  basePath: Array<{ x: number; y: number }>,
): { path: Array<{ x: number; y: number }>; speed: number; pauseMs: number; sitter: boolean } {
  const speed = def.speed ?? 30;
  const pauseMs = def.pauseMs ?? 1000;
  // An explicit stationary role must not depend on its definition's array index.
  if (speed <= 0 || basePath.length === 0) {
    return { path: basePath.slice(0, 1), speed: 0, pauseMs, sitter: true };
  }
  if (basePath.length >= 2 && speed > 0) {
    return { path: basePath, speed, pauseMs, sitter: false };
  }
  if (basePath.length < 2) {
    const keepSitter = index % 3 === 0 || Boolean(def.bark && index % 2 === 0);
    if (keepSitter) {
      return {
        path: basePath,
        speed: 0,
        pauseMs,
        sitter: true,
      };
    }
    const p = basePath[0]!;
    const ox = ((index & 1) === 0 ? 1 : -1) * (26 + (index % 5) * 7);
    const oy = ((index % 3) === 1 ? 1 : -1) * (16 + (index % 4) * 6);
    const mid = resolveNpcAnchor(scene, p.x + ox, p.y + oy);
    const mid2 = resolveNpcAnchor(scene, p.x - ox * 0.35, p.y + oy * 0.25);
    if(!mid||!mid2)return {path:[p],speed:0,pauseMs,sitter:true};
    return {
      path: [p, mid, mid2, p],
      speed: 15 + (index % 6) * 2,
      pauseMs: 1200 + (index % 5) * 350,
      sitter: false,
    };
  }
  return { path: basePath, speed, pauseMs, sitter: false };
}
