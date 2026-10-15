import Phaser from 'phaser';
import { getGraphicsProfile } from '../game/systems/graphics-quality.js';
export { Depth, ENTITY_Y_SCALE, entityDepth } from '../game/constants/depth.js';

const SHADOW_Y = 14;

/** Soft oval shadow under a moving sprite (player, enemy, NPC). */
export function attachEntityShadow(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  width = 26,
  height = 11,
  alpha = 0.3,
): Phaser.GameObjects.Ellipse | undefined {
  if (!getGraphicsProfile().entityShadows) return undefined;
  const shadow = scene.add
    .ellipse(sprite.x, sprite.y + SHADOW_Y, width, height, 0x000000, alpha)
    .setDepth(sprite.depth - 0.5);
  sprite.setData('dropShadow', shadow);
  sprite.once(Phaser.GameObjects.Events.DESTROY, () => shadow.destroy());
  return shadow;
}

export function syncEntityShadow(sprite: Phaser.GameObjects.Sprite): void {
  const shadow = sprite.getData('dropShadow') as Phaser.GameObjects.Ellipse | undefined;
  if (!shadow?.active) return;
  if (!sprite.visible) {
    shadow.setVisible(false);
    return;
  }
  shadow.setVisible(true);
  shadow.setPosition(sprite.x, sprite.y + SHADOW_Y);
  shadow.setDepth(sprite.depth - 0.5);
}

export function syncEntityShadows(sprites: Iterable<Phaser.GameObjects.Sprite>): void {
  for (const sprite of sprites) syncEntityShadow(sprite);
}
