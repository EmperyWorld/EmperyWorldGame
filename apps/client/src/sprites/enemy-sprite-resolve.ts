/** Pure helpers for enemy texture selection (no Phaser import — unit-test friendly). */

/** Must match {@link COMBAT_ATLAS_KEY} in sprite-factory (8-way procedural atlas). */
export const ENEMY_WORLD_ATLAS_KEY = 'combat-atlas-v8';

export function enemyArtTextureKey(kind: string): string {
  return `enemy-art-${kind}`;
}

/**
 * World sprites use the procedural combat atlas (4-dir walk).
 * ComfyUI `enemy-art-*` sheets are single-facing for now — keep them loaded for
 * future multi-row art, but do not prefer them for in-world enemies.
 */
export function pickEnemySpriteSource(
  kind: string,
  _hasTexture: (key: string) => boolean,
): { textureKey: string; frame: string | number } {
  void _hasTexture;
  return { textureKey: ENEMY_WORLD_ATLAS_KEY, frame: `enemy-${kind}-0` };
}
