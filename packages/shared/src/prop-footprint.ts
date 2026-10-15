/**
 * Pure footprint policy for world props — no Phaser (safe for unit tests).
 *
 * Collision vs walk-behind are separate: see prop-layer.ts.
 * Prefer alpha silhouette in prop-colliders; these fractions are fallbacks
 * only when the texture cannot be sampled.
 */
import { isHavenShipHullAsset } from './haven-harbor.js';
import { propColliderMode } from './prop-layer.js';

export interface PropFootprint {
  /** Body width as fraction of display size. */
  w: number;
  /** Body height as fraction of display size. */
  h: number;
  /**
   * Shift body center from sprite anchor (placeProp origin).
   * Negative = north (into the building) so a walkable apron remains under the south facade.
   */
  oy: number;
}

/** Decorative / pass-through — no body. */
export const PROP_PASS: ReadonlySet<string> = new Set([
  'prop_street_lamp',
  'prop_banner_pole',
  'prop_clothesline',
  'prop_steam_vent',
  'prop_chimney_smoke',
  'prop_signpost',
  'prop_tavern_sign',
  'prop_notice_board',
  'prop_candle_stand',
  'prop_quay_bollard',
  'prop_dock_crates',
  'prop_dock_nets',
  'prop_dock_barrels',
  'prop_dock_rope',
  'prop_dock_fishboxes',
  'prop_fish_stall',
  'prop_wall_brazier',
  'prop_apt_rug',
  'prop_apt_lantern',
  // Curtain walls: tile layer (GID 4) already blocks. City gates use arch pillars instead.
  'prop_city_wall_n',
  'prop_city_wall_s',
  'prop_city_wall_w',
  'prop_city_wall_e',
  'prop_city_wall',
  'prop_wall_tower',
  // Walkable quay / water craft (water tiles block swimming)
  'prop_pier',
  'prop_pier_long',
  'prop_ship_cog',
  'prop_ship_caravel',
  'prop_ship_fishing',
  'prop_ship_brig',
  'prop_ship_barge',
  'prop_ship_ferry',
  'prop_ship_skiff',
  'prop_basketball_court',
  'prop_playground_sandbox',
  'prop_hopscotch',
  'prop_yard_fountain',
  'prop_string_lights',
  'prop_hq_pad',
  'prop_shop_awning',
  'prop_window_box',
]);

/**
 * Indoor / solid furniture — no walk-behind; skip silhouette and use a pad AABB.
 * Buildings, stalls, arches must NOT be here (they use mode silhouette).
 */
export const PROP_FORCE_AABB: ReadonlySet<string> = new Set([
  'prop_russian_stove',
  'prop_apt_bed',
  'prop_apt_table',
  'prop_hq_reception_desk',
  'prop_hq_design_table',
  'prop_hq_engineering_console',
  'prop_storage_chest',
  'prop_icebox',
]);

const LIGHT: ReadonlySet<string> = new Set([
  'prop_bench',
  'prop_planter',
  'prop_barrels',
  'prop_crate_stack',
  'prop_dock_crates',
  'prop_dock_nets',
  'prop_dock_barrels',
  'prop_dock_rope',
  'prop_dock_fishboxes',
  'prop_firewood',
  'prop_rain_barrel',
  'prop_rope_coil',
  'prop_amphora_stack',
  'prop_flour_sacks',
  'prop_lobster_pots',
  'prop_drying_nets',
  'prop_anvil',
  'prop_coal_pile',
  'prop_shield_stack',
  'prop_weapon_rack',
  'prop_training_dummy',
  'prop_hitching_post',
  'prop_sundial',
  'prop_memorial_stone',
  'prop_chicken_coop',
  'prop_scarecrow',
  'prop_wheat_sheaf',
  'prop_stocks',
  'prop_book_cart',
  'prop_flower_cart',
  'prop_produce_cart',
  'prop_keg_rack',
  'prop_outdoor_table',
  'prop_guard_post',
  'prop_haystack',
  'prop_bush_garden',
  'prop_herb_garden',
  'prop_beehive',
  'prop_water_pump',
  'prop_laundry_tub',
  'prop_street_shrine',
  'prop_gate_shrine',
  'prop_town_milestone',
  'prop_herb_drying_rack',
  'prop_tombstone',
  'prop_harbor_bell',
  'prop_neighborhood_well',
  'prop_millstone',
  'prop_flower_bed',
  'prop_salt_stacks',
  'prop_crier_stand',
  'prop_perfume_stall',
]);

const MEDIUM: ReadonlySet<string> = new Set([
  'prop_market_stall',
  'prop_market_canopy',
  'prop_spice_stall',
  'prop_fish_stall',
  'prop_merchant_cart',
  'prop_wagon',
  'prop_covered_wagon',
  'prop_hay_cart',
  'prop_water_trough',
  'prop_tree_oak',
  'prop_tree_silver',
  'prop_orchard_tree',
  'prop_statue_lion',
  'prop_statue_imperial',
  'prop_fountain',
  'prop_garden_fountain',
  'prop_well',
  'prop_hearth',
  'prop_washbasin',
  'prop_cookpot',
  'prop_campfire',
  'prop_cistern',
  'prop_obelisk',
  'prop_rose_arch',
  'prop_grape_arbor',
  'prop_colonnade',
  'prop_forum_arch',
  'prop_scaffold',
  'prop_sail_rack',
  'prop_pottery_kiln',
  'prop_weaver_loom',
  'prop_ballista',
  'prop_carriage',
  'prop_garden_pergola',
  'prop_aqueduct_arch',
  'prop_catapult',
  'prop_pigeon_coop',
  'prop_public_oven',
  'prop_basket_stall',
  'prop_dye_vat',
  'prop_grave_angel',
  'prop_victory_monument',
  'prop_sparring_ring',
  'prop_traveler_camp',
  'prop_anchor_monument',
  'prop_east_garden_pool',
  'prop_weapon_rack',
]);

const LIGHT_FP: PropFootprint = { w: 0.32, h: 0.22, oy: -0.08 };
const MEDIUM_FP: PropFootprint = { w: 0.42, h: 0.26, oy: -0.16 };
const HEAVY_FP: PropFootprint = { w: 0.55, h: 0.34, oy: -0.18 };
const STOVE_FP: PropFootprint = { w: 0.55, h: 0.4, oy: -0.12 };
const TRUNK_FP: PropFootprint = { w: 0.16, h: 0.14, oy: -0.1 };
const ARCH_PILLAR_FP: PropFootprint = { w: 0.14, h: 0.24, oy: -0.22 };
/** Wall mass — thin south eaves apron; body sits lower so you can't walk under. */
const BEHIND_FP: PropFootprint = { w: 0.72, h: 0.38, oy: -0.26 };
/** Counter mass north of a deep stall apron. */
const STALL_FP: PropFootprint = { w: 0.62, h: 0.24, oy: -0.34 };
const FLAT_FP: PropFootprint = { w: 0.7, h: 0.55, oy: -0.12 };

/** Only indoor furniture skips silhouette (no walk-behind). */
export function shouldForcePropAabb(assetId: string, _size?: number): boolean {
  return PROP_FORCE_AABB.has(assetId);
}

export function isPropPassThrough(assetId: string): boolean {
  return PROP_PASS.has(assetId) || isHavenShipHullAsset(assetId);
}

export function footprintForProp(assetId: string, size: number): PropFootprint | null {
  if (assetId === 'prop_garrison_fence_h') return { w: 1, h: 16 / size, oy: 0 };
  if (assetId === 'prop_garrison_fence_v') return { w: 16 / size, h: 1, oy: 0 };
  if (isPropPassThrough(assetId)) return null;
  if (['prop_hq_reception_desk','prop_hq_design_table','prop_hq_engineering_console'].includes(assetId)) return {w: 0.84, h: 0.32, oy: -0.08};
  if (assetId === 'prop_russian_stove') return STOVE_FP;
  if (PROP_FORCE_AABB.has(assetId)) return HEAVY_FP;

  const mode = propColliderMode(assetId);
  if (mode === 'trunk') return TRUNK_FP;
  if (mode === 'arch') return ARCH_PILLAR_FP;
  if (mode === 'stall') return STALL_FP;
  if (mode === 'behind') return BEHIND_FP;
  if (mode === 'flat') {
    if (LIGHT.has(assetId) && size < 90) return LIGHT_FP;
    if (MEDIUM.has(assetId) || size >= 90) return size >= 100 ? FLAT_FP : MEDIUM_FP;
    return LIGHT_FP;
  }

  if (LIGHT.has(assetId)) return LIGHT_FP;
  if (MEDIUM.has(assetId)) return MEDIUM_FP;
  if (assetId.startsWith('prop_')) {
    if (size < 58) return null;
    return size < 100 ? MEDIUM_FP : BEHIND_FP;
  }
  return null;
}
