import { describe, expect, it } from 'vitest';
import { enemyArtTextureKey, ENEMY_WORLD_ATLAS_KEY, pickEnemySpriteSource } from './enemy-sprite-resolve.js';

describe('pickEnemySpriteSource', () => {
  it('uses combat atlas frames (4-dir procedural)', () => {
    expect(pickEnemySpriteSource('goblin', () => false)).toEqual({
      textureKey: ENEMY_WORLD_ATLAS_KEY,
      frame: 'enemy-goblin-0',
    });
  });

  it('does not prefer single-facing ComfyUI art for world sprites', () => {
    const art = enemyArtTextureKey('goblin');
    expect(pickEnemySpriteSource('goblin', (k) => k === art)).toEqual({
      textureKey: ENEMY_WORLD_ATLAS_KEY,
      frame: 'enemy-goblin-0',
    });
  });
});
