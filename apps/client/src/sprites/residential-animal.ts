import Phaser from 'phaser';
import { CityRouteFollower } from '../game/systems/city-route-follower.js';
import { entityDepth } from '../game/constants/depth.js';
import { buildNpcRoute } from './npc-pathing.js';
import { resolveNpcAnchor } from './npc-anchor.js';
import { isInsidePropAabb, propCollisionRevision } from './prop-colliders.js';
import { isTileBlockedAt } from './world-tiles.js';

/** Feet and shadow share a ground anchor; only legs animate, never the world height. */
export function placeResidentialAnimal(
  scene: Phaser.Scene,
  authoredPath: Array<{ x: number; y: number }>,
  kind: 'cat' | 'dog',
  color: number,
): void {
  const path = authoredPath.map(p => resolveNpcAnchor(scene, p.x, p.y)).filter(p => p !== null);
  if (path.length < 2) return;
  let pose = { ...path[0]! }, index = 1, wait = 0, phase = 0, facing = 1;
  const body = scene.add.graphics();
  const shadow = scene.add.ellipse(pose.x, pose.y, kind === 'cat' ? 22 : 28, 7, 0x000000, 0.2);
  const route = new CityRouteFollower({
    position: () => pose,
    move: p => { pose = p; },
    route: (from, to) => buildNpcRoute(scene, from.x, from.y, to.x, to.y, 1),
    revision: () => propCollisionRevision(scene),
    walkable: p => !isTileBlockedAt(scene, p.x, p.y) && !isInsidePropAabb(scene, p.x, p.y, 13),
  });
  const draw = (moving: boolean) => {
    body.clear().setPosition(pose.x, pose.y).setDepth(entityDepth(pose.y));
    shadow.setPosition(pose.x, pose.y).setDepth(entityDepth(pose.y) - 0.01);
    const size = kind === 'cat' ? 8 : 11;
    const stride = moving ? Math.sin(phase) * 2.5 : 0;
    body.lineStyle(2, 0x493527, 1);
    for (const side of [-1, 1]) {
      body.lineBetween(side * size * 0.65, -4, side * size * 0.65 + side * stride, 0);
    }
    body.fillStyle(color, 1);
    body.fillEllipse(0, -7, size * 2, 10);
    body.fillCircle(facing * (size + 2), -10, kind === 'cat' ? 4 : 5);
    if (kind === 'cat') {
      body.fillTriangle(facing * size, -12, facing * (size + 2), -17, facing * (size + 4), -12);
      body.lineStyle(2, color, 1);
      body.lineBetween(-facing * size, -7, -facing * (size + 6), -13);
    } else {
      body.fillStyle(0x493527, 1);
      body.fillEllipse(facing * size, -8, 4, 7);
      body.lineBetween(-facing * size, -7, -facing * (size + 5), -10);
    }
  };
  draw(false);
  route.setGoal(path[index]!);
  const update = (_time: number, delta: number) => {
    const elapsed = Math.min(250, Math.max(0, delta));
    if (wait > 0) { wait = Math.max(0, wait - elapsed); return; }
    const before = pose;
    if (route.step(elapsed, kind === 'cat' ? 24 : 32)) {
      index = (index + 1) % path.length;
      route.setGoal(path[index]!);
      wait = 800;
    }
    const distance = Math.hypot(pose.x - before.x, pose.y - before.y);
    if (Math.abs(pose.x - before.x) > 0.01) facing = pose.x < before.x ? -1 : 1;
    phase += distance * 0.7;
    draw(distance > 0.01);
  };
  scene.events.on('update', update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off('update', update);
    route.clear(); body.destroy(); shadow.destroy();
  });
}
