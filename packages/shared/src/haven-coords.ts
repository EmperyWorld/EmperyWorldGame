/**
 * Haven world coordinates — verified against layout `c()`, YAML pixels,
 * Tiled JSON, Phaser tilemap at (0,0), and sprite origins.
 *
 * Do not invent a second transform. YAML x/y are already world pixels
 * (tile centers). Tiles are only used at authoring (`c(tx,ty)`) and inverse
 * (`worldToHavenTile`).
 */
import { HAVEN_TILE_SIZE, havenTileCenter } from './haven-npc-homes.js';

/** empery_haven Tiled size (scripts/layouts/empery_haven.mjs W/H). */
export const HAVEN_MAP_TILES_W = 120;
export const HAVEN_MAP_TILES_H = 84;

/** Phaser Image origin for world props (texture-loader placeProp). */
export const HAVEN_PROP_ORIGIN_X = 0.5;
export const HAVEN_PROP_ORIGIN_Y = 0.72;

/** Phaser Sprite origin for characters (sprite-loader setupSpriteDisplay). */
export const HAVEN_CHAR_ORIGIN_X = 0.5;
export const HAVEN_CHAR_ORIGIN_Y = 0.55;

/** Base character display size before scale (sprite-factory DISPLAY_SIZE). */
export const HAVEN_CHAR_DISPLAY_SIZE = 48;

/** Residential court, shared by scenery and scheduled families. */
export const HAVEN_RESIDENTIAL_COURT = { tx: 20, ty: 40, x: 1344, y: 2608, size: 180 } as const;

export type HavenAabb = { L: number; R: number; T: number; B: number };

export function havenMapWorldSize(tileSize = HAVEN_TILE_SIZE): { w: number; h: number } {
  return { w: HAVEN_MAP_TILES_W * tileSize, h: HAVEN_MAP_TILES_H * tileSize };
}

/**
 * Authoring: tile index → world pixel of the tile CENTER.
 * Same algebra as `c()` in empery_haven.mjs.
 */
export function havenWorldFromTile(
  tx: number,
  ty: number,
  tileSize = HAVEN_TILE_SIZE,
): { x: number; y: number } {
  return havenTileCenter(tx, ty, tileSize);
}

/** Tenement origin (location-decor / layout). South-facing art, origin 0.72. */
export const HAVEN_TENEMENT = { x: 1056, y: 2720, size: 400 } as const;

/** Front door pad — south of tenement footprint. Layout `c(16, 45)`. */
export const HAVEN_APARTMENT_DOOR = havenWorldFromTile(16, 45);

/** Clear street anchor southeast of the apartment pad, outside the houses below it. */
export const HAVEN_APARTMENT_STREET = havenWorldFromTile(17, 46);

/** HQ south gate on Haven. Layout `c(64, 39)`. */
export const HAVEN_HQ_GATE = havenWorldFromTile(64, 39);

/**
 * Street south of HQ after leaving the interior.
 * `c(63, 42)` — west of the occupied harbor props, south of the r=120 gate pad.
 */
export const HAVEN_HQ_STREET = havenWorldFromTile(63, 42);

/** Indoor apartment spawn / street-exit (24×24 map). Valid on Haven ≈ garrison. */
const APARTMENT_INDOOR_SPAWNS: ReadonlyArray<readonly [number, number]> = [
  [640, 580],
  [640, 780],
];

/** Indoor HQ spawn / street-exit (40×32 map). Valid on Haven ≈ west crafts. */
const HQ_INDOOR_SPAWNS: ReadonlyArray<readonly [number, number]> = [
  [1312, 1696],
  [1312, 1824],
];

function nearAny(x: number, y: number, pts: ReadonlyArray<readonly [number, number]>): boolean {
  return pts.some(([ax, ay]) => Math.hypot(x - ax, y - ay) < 140);
}

/** True when Haven pose is leftover indoor apartment coords (exit used to dump you by the garrison). */
export function isLeakedApartmentPoseOnHaven(x: number, y: number): boolean {
  return nearAny(x, y, APARTMENT_INDOOR_SPAWNS);
}

/** True when Haven pose is leftover HQ interior coords (exit used to dump you in the west city). */
export function isLeakedHqPoseOnHaven(x: number, y: number): boolean {
  return nearAny(x, y, HQ_INDOOR_SPAWNS);
}

/** Snap target if a Haven pose is leftover indoor coords; otherwise null. */
export function havenSnapLeakedIndoorPose(
  x: number,
  y: number,
): { x: number; y: number } | null {
  if (isLeakedApartmentPoseOnHaven(x, y)) {
    return { x: HAVEN_APARTMENT_STREET.x, y: HAVEN_APARTMENT_STREET.y };
  }
  if (isLeakedHqPoseOnHaven(x, y)) {
    return { x: HAVEN_HQ_STREET.x, y: HAVEN_HQ_STREET.y };
  }
  return null;
}

/** Tile AABB in world px (NW inclusive, SE exclusive). */
export function havenTileAabb(
  tx: number,
  ty: number,
  tileSize = HAVEN_TILE_SIZE,
): HavenAabb {
  return {
    L: tx * tileSize,
    R: (tx + 1) * tileSize,
    T: ty * tileSize,
    B: (ty + 1) * tileSize,
  };
}

/**
 * Visual sprite quad for a world prop. Stored (x,y) is origin (0.5, 0.72),
 * so the facade sits north of the point and feet hang south.
 */
export function havenPropSpriteAabb(x: number, y: number, size: number): HavenAabb {
  return {
    L: x - size * HAVEN_PROP_ORIGIN_X,
    R: x + size * (1 - HAVEN_PROP_ORIGIN_X),
    T: y - size * HAVEN_PROP_ORIGIN_Y,
    B: y + size * (1 - HAVEN_PROP_ORIGIN_Y),
  };
}

/** Phaser Graphics.fillEllipse — (cx,cy) is the center; w/h are full diameters. */
export function havenEllipseAabb(cx: number, cy: number, w: number, h: number): HavenAabb {
  return {
    L: cx - w / 2,
    R: cx + w / 2,
    T: cy - h / 2,
    B: cy + h / 2,
  };
}

export function havenCharSpriteAabb(x: number, y: number, scale = 1): HavenAabb {
  const d = HAVEN_CHAR_DISPLAY_SIZE * scale;
  return {
    L: x - d * HAVEN_CHAR_ORIGIN_X,
    R: x + d * (1 - HAVEN_CHAR_ORIGIN_X),
    T: y - d * HAVEN_CHAR_ORIGIN_Y,
    B: y + d * (1 - HAVEN_CHAR_ORIGIN_Y),
  };
}

/** Phaser Rectangle default origin 0.5 — PortalSystem pad at (zone.x, zone.y+40). */
export const HAVEN_TRAVEL_PAD_Y_OFFSET = 40;
export const HAVEN_TRAVEL_PAD_DEFAULT_RADIUS = 56;

export function havenTravelPadAabb(
  zoneX: number,
  zoneY: number,
  radius = HAVEN_TRAVEL_PAD_DEFAULT_RADIUS,
): HavenAabb {
  const w = radius * 1.6;
  const h = radius * 1.1;
  const cy = zoneY + HAVEN_TRAVEL_PAD_Y_OFFSET;
  return {
    L: zoneX - w / 2,
    R: zoneX + w / 2,
    T: cy - h / 2,
    B: cy + h / 2,
  };
}
