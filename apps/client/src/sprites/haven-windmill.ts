import Phaser from 'phaser';
import { Depth } from '../game/constants/depth.js';
import { placeWorldProp, resolvePropDepth } from './place-world-prop.js';
import { addPropFootprint } from './prop-colliders.js';
import { loopDecorTween } from './decor-fx.js';

/**
 * Haven windmill: static millhouse body (no sails in the texture) +
 * a Container of blades that rotates with a linear tween.
 * One landmark, one animation — no double-sails overlay on painted blades.
 */
export function placeHavenWindmill(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
): void {
  const body = placeWorldProp(scene, 'prop_windmill', x, y, size);
  if (!body) {
    const g = scene.add.graphics().setDepth(resolvePropDepth(scene, 'prop_windmill', y, size));
    g.fillStyle(0x8a7860, 0.95);
    g.fillEllipse(x, y - size * 0.05, size * 0.42, size * 0.36);
    g.fillStyle(0x6a5848, 1);
    g.fillCircle(x, y - size * 0.22, size * 0.12);
    addPropFootprint(scene, 'prop_windmill', x, y, size);
  }

  const hubY = y - size * 0.3;
  const bladeLen = size * 0.34;
  const depth = Math.max(
    resolvePropDepth(scene, 'prop_windmill', y, size) + 2,
    Depth.Ambient,
  );

  const blades = scene.add.graphics();
  drawWindmillBlades(blades, bladeLen);
  const rotor = scene.add.container(x, hubY, [blades]).setDepth(depth);

  loopDecorTween(scene, {
    targets: rotor,
    angle: 360,
    duration: 14_000,
    repeat: -1,
    ease: 'Linear',
  });
}

function drawWindmillBlades(g: Phaser.GameObjects.Graphics, len: number): void {
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const tipX = cos * len;
    const tipY = sin * len * 0.88;
    const midX = cos * len * 0.52;
    const midY = sin * len * 0.52;
    const perpX = -sin * (len * 0.1);
    const perpY = cos * (len * 0.1);

    g.fillStyle(0xd8c8a8, 0.88);
    g.fillTriangle(perpX * 0.35, perpY * 0.35, tipX, tipY, midX + perpX, midY + perpY);
    g.fillStyle(0xc0b090, 0.75);
    g.fillTriangle(-perpX * 0.2, -perpY * 0.2, tipX, tipY, midX - perpX * 0.6, midY - perpY * 0.6);
    g.lineStyle(3, 0x5a4830, 0.85);
    g.lineBetween(0, 0, tipX, tipY);
  }
  g.fillStyle(0x4a3828, 0.95);
  g.fillCircle(0, 0, Math.max(5, len * 0.07));
  g.fillStyle(0x8a7050, 0.9);
  g.fillCircle(0, 0, Math.max(3, len * 0.04));
}
