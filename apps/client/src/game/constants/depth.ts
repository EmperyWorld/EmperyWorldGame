/** Z-order контракт сцены — не размазывать magic numbers по файлам. */
export enum Depth {
  Ground = 0,
  Background = 2,
  Decor = 5,
  Portal = 6,
  Ambient = 8,
  EntityBase = 10,
  EntityLabel = 11,
  EntityHud = 12,
  EntityMark = 14,
  CombatFx = 15,
  QuestBanner = 20,
  ArrowLine = 21,
  VfxSpark = 22,
  FloatText = 25,
  /** Viewport tint for day/night (scrollFactor 0). */
  DayNightOverlay = 900,
  Minimap = 1000,
  MinimapMarkers = 1001,
  MinimapLabel = 1002,
}

export const ENTITY_Y_SCALE = 0.001;

/** Matches `placeProp` / haven props `setOrigin(0.5, PROP_SPRITE_ORIGIN_Y)`. */
export const PROP_SPRITE_ORIGIN_Y = 0.72;

/** Top-down Y-sort: больший Y рисуется поверх. */
export function entityDepth(y: number, offset = 0): number {
  return Depth.EntityBase + y * ENTITY_Y_SCALE + offset;
}

/**
 * Occlusion line for a prop — toward the visual south edge, but paired with a
 * north-shifted collider so the player can walk a deep strip *under* the facade
 * while sorted behind (not a 1px flicker at the foot tip).
 */
export function propSortY(
  anchorY: number,
  displaySize: number,
  originY = PROP_SPRITE_ORIGIN_Y,
): number {
  const toBottom = Math.max(0, displaySize) * (1 - originY);
  // Near the south tip — paired with a deeply north-shifted collider (≥40px apron).
  return anchorY + toBottom * 0.92;
}

/** World props share the entity Y-band so the player walks behind/in front correctly. */
export function propDepth(anchorY: number, displaySize = 80, bias = -0.0008): number {
  return Depth.EntityBase + propSortY(anchorY, displaySize) * ENTITY_Y_SCALE + bias;
}

/** Prefer opaque south edge when silhouette is known (matches collider apron). */
export function propDepthFromSortY(sortY: number, bias = -0.0008): number {
  return Depth.EntityBase + sortY * ENTITY_Y_SCALE + bias;
}
