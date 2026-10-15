import Phaser from 'phaser';
import { combatDisplaySize, ENEMY_ASSET } from './texture-loader.js';
import { pickEnemySpriteSource } from './enemy-sprite-resolve.js';
import {
  enemyAnimPrefix,
  enemyDisplayScale,
  enemySpriteConfig,
  enemySpriteFrame,
  enemyTextureKey,
  npcFrame,
  npcTextureKey,
  playerAnimKey,
  playerSpriteFrame,
  playerSpritePrefix,
  playerTextureKey,
  playerWalkAnimKey,
  playerIdleAnimKey,
  registerCombatSprites,
  registerNpcSprites,
  SPRITE_SIZE,
} from './sprite-factory.js';
import { hasWorldMediaFrame, WORLD_MEDIA_ATLAS_KEY } from './world-media-atlas.js';

export { enemyArtTextureKey } from './enemy-sprite-resolve.js';

export const DISPLAY_SIZE = SPRITE_SIZE.width;

export function registerAllSprites(scene: Phaser.Scene, playerRace: string): void {
  registerCombatSprites(scene, playerRace);
  registerNpcSprites(scene);
}

export function setupSpriteDisplay(
  sprite: Phaser.Physics.Arcade.Sprite | Phaser.GameObjects.Sprite,
  scale = 1,
): void {
  // After atlas rebuild+remove, frame can be null until setTexture.
  if (!sprite.frame || !sprite.texture) return;
  const size = combatDisplaySize(sprite.scene, sprite.texture.key);
  sprite.setOrigin(0.5, 0.55);
  sprite.setDisplaySize(size * scale, size * scale);
}

/** ComfyUI PNG (world-media atlas or standalone) when loaded, else combat-atlas procedural. */
export function resolveNpcSprite(
  scene: Phaser.Scene,
  npcId: string,
): { textureKey: string; frame: string | number } {
  const artKey = npcFrame(npcId);
  if (hasWorldMediaFrame(scene, artKey)) {
    return { textureKey: WORLD_MEDIA_ATLAS_KEY, frame: artKey };
  }
  if (scene.textures.exists(artKey)) {
    return { textureKey: artKey, frame: 0 };
  }
  return { textureKey: npcTextureKey(npcId), frame: npcFrame(npcId) };
}

/**
 * Procedural combat atlas (4-dir). Single-facing ComfyUI art is not used for world sprites yet.
 */
export function resolveEnemySprite(
  scene: Phaser.Scene,
  type: string,
): { textureKey: string; frame: string | number } {
  const kind = enemySpriteConfig(type).kind;
  return pickEnemySpriteSource(kind, (key) => scene.textures.exists(key));
}

/**
 * Reserved for multi-row ComfyUI sheets. Single-facing art must not override
 * atlas idle/walk — that switches the sprite onto the full sheet (__BASE look).
 */
export function bindEnemyArtAnims(_scene: Phaser.Scene, _kind: string): void {
  /* no-op until enemy art has down/side/up rows */
}

export function bindAllEnemyArtAnims(scene: Phaser.Scene): void {
  for (const kind of Object.keys(ENEMY_ASSET)) {
    bindEnemyArtAnims(scene, kind);
  }
}

export function playHurtFlash(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite): void {
  sprite.setTint(0xff6666);
  scene.time.delayedCall(120, () => sprite.clearTint());
}

export {
  playerTextureKey,
  playerSpriteFrame,
  playerSpritePrefix,
  playerAnimKey,
  playerWalkAnimKey,
  playerIdleAnimKey,
  enemyTextureKey,
  enemySpriteFrame,
  npcTextureKey,
  npcFrame,
  enemyAnimPrefix,
  enemyDisplayScale,
};
