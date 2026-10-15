import { isHavenShipHullAsset } from './haven-harbor.js';

/**
 * Prop layering: collision vs walk-behind are separate concerns.
 *
 * - flat: top-down pad — solid, always under the player
 * - behind: facade / building — y-sort + south apron
 * - trunk: trees — y-sort + narrow trunk (walk under canopy)
 * - arch: colonnade / arches — y-sort + side pillars only (walk through)
 * - stall: market front — deep open south apron at the counter
 */

export type PropLayerKind = 'flat' | 'behind' | 'trunk' | 'arch' | 'stall';

export type PropColliderMode = PropLayerKind;

/** Pure top-down / ground pads — walk-behind looks absurd. */
const FLAT: ReadonlySet<string> = new Set([
  'prop_fountain',
  'prop_garden_fountain',
  'prop_east_garden_pool',
  'prop_flower_bed',
  'prop_herb_garden',
  'prop_bush_garden',
  'prop_villa_garden',
  'prop_garden_plot',
  'prop_watering_can',
  'prop_planter',
  'prop_well',
  'prop_neighborhood_well',
  'prop_hearth',
  'prop_cookpot',
  'prop_washbasin',
  'prop_campfire',
  'prop_cistern',
  'prop_water_trough',
  'prop_millstone',
  'prop_sparring_ring',
  'prop_basketball_court',
  'prop_playground_sandbox',
  'prop_hopscotch',
  'prop_yard_fountain',
  'prop_string_lights',
  'prop_open_stage',
  'prop_salt_stacks',
  'prop_coal_pile',
  'prop_flour_sacks',
  'prop_plank_stack',
  'prop_amphora_stack',
  'prop_barrels',
  'prop_crate_stack',
  'prop_firewood',
  'prop_rope_coil',
  'prop_lobster_pots',
  'prop_drying_nets',
  'prop_haystack',
  'prop_wheat_sheaf',
  'prop_dye_vat',
  'prop_bench',
  'prop_hidden_bench',
  'prop_outdoor_table',
  'prop_laundry_tub',
  'prop_rain_barrel',
  'prop_beehive',
  'prop_chicken_coop',
  'prop_anvil',
  'prop_sundial',
  'prop_memorial_stone',
  'prop_tombstone',
  'prop_stocks',
  'prop_water_pump',
  'prop_shield_stack',
  'prop_keg_rack',
  'prop_storage_chest',
  'prop_icebox',
  'prop_apt_rug',
  'prop_shadow_lamp',
  'prop_hq_fence',
  'prop_hq_fence_corner',
  'prop_hq_barrier',
  'prop_hq_pad',
  'prop_hq_panel',
  'prop_pier',
  'prop_pier_long',
  'prop_dock_crates',
  'prop_dock_nets',
  'prop_dock_barrels',
  'prop_dock_rope',
  'prop_dock_fishboxes',
  'prop_ship_cog',
  'prop_ship_caravel',
  'prop_ship_fishing',
  'prop_ship_brig',
  'prop_ship_barge',
  'prop_ship_ferry',
  'prop_ship_skiff',
]);

const TRUNK: ReadonlySet<string> = new Set([
  'prop_tree_oak',
  'prop_tree_silver',
  'prop_orchard_tree',
]);

/** Walk-through openings — pillars collide, center does not. */
const ARCH: ReadonlySet<string> = new Set([
  'prop_forum_arch',
  'prop_aqueduct_arch',
  'prop_neighborhood_gate',
  'prop_rose_arch',
  'prop_secret_arch',
  'prop_hq_gate_open',
  'prop_city_gate_open',
  'prop_city_gate_s_open',
  'prop_city_gate_e_open',
  'prop_harbor_guard_arch',
  // City gates closed: solid door art — colliders via cityGatePillarBoxes.
  'prop_colonnade',
  'prop_grape_arbor',
  'prop_garden_pergola',
]);

/** Market fronts & carts — stand at the counter / open south side. */
const STALL: ReadonlySet<string> = new Set([
  'prop_market_canopy',
  'prop_market_stall',
  'prop_spice_stall',
  'prop_fish_stall',
  'prop_basket_stall',
  'prop_perfume_stall',
  'prop_crier_stand',
  'prop_shop_front',
  'prop_merchant_cart',
  'prop_flower_cart',
  'prop_produce_cart',
  'prop_book_cart',
  'prop_hay_cart',
  'prop_shop_awning',
  'prop_wheelbarrow',
]);

/**
 * Explicit tall / facade props (also matched by heuristics below).
 */
const BEHIND: ReadonlySet<string> = new Set([
  'prop_hq_reception_desk',
  'prop_hq_lounge_sofa',
  'prop_hq_reception_backdrop',
  'prop_hq_design_table',
  'prop_hq_engineering_console',
  'prop_governor_palace',
  'prop_palace_kitchen',
  'prop_cathedral',
  'prop_chapel',
  'prop_inn',
  'prop_tea_house',
  'prop_bathhouse',
  'prop_brewery',
  'prop_barracks',
  'prop_keep_wing',
  'prop_armory',
  'prop_guildhall',
  'prop_trade_hall',
  'prop_bakery',
  'prop_apothecary',
  'prop_jeweler',
  'prop_butcher',
  'prop_radio_booth',
  'prop_hq_building',
  'prop_hq_lab',
  'prop_hq_sniper_tower',
  'prop_hq_antenna',
  'prop_hq_checkpoint',
  'prop_hq_server_rack',
  'prop_hq_holo_sign',
  'prop_hq_gate_closed',
  'prop_fishmonger',
  'prop_shop_front',
  'prop_moneylender',
  'prop_tailor',
  'prop_barber',
  'prop_weigh_house',
  'prop_fire_brigade',
  'prop_schoolhouse',
  'prop_library',
  'prop_imperial_archive',
  'prop_scriptorium',
  'prop_healer_hall',
  'prop_jail',
  'prop_watch_house',
  'prop_customs_house',
  'prop_warehouse',
  'prop_granary',
  'prop_stable',
  'prop_farmhouse',
  'prop_blacksmith',
  'prop_carpenter',
  'prop_cobbler',
  'prop_leatherworker',
  'prop_glassblower',
  'prop_candle_shop',
  'prop_cheese_shop',
  'prop_map_shop',
  'prop_ship_chandler',
  'prop_dock_tavern',
  'prop_captain_hut',
  'prop_mason_shed',
  'prop_wagon_workshop',
  'prop_ropewalk',
  'prop_public_oven',
  'prop_pottery_kiln',
  'prop_weaver_loom',
  'prop_gazebo',
  'prop_windmill',
  'prop_lighthouse',
  'prop_pilot_lookout',
  'prop_harbor_crane',
  'prop_clock_tower',
  'prop_guard_tower',
  'prop_wall_tower',
  'prop_city_wall_n',
  'prop_city_wall_s',
  'prop_city_wall_w',
  'prop_city_wall_e',
  'prop_city_wall',
  'prop_city_gate',
  'prop_city_gate_s',
  'prop_city_gate_e',
  'prop_city_gate_open',
  'prop_city_gate_s_open',
  'prop_city_gate_e_open',
  'prop_harbor_guard_arch',
  'prop_scaffold',
  'prop_statue_lion',
  'prop_statue_imperial',
  'prop_obelisk',
  'prop_victory_monument',
  'prop_anchor_monument',
  'prop_grave_angel',
  'prop_street_shrine',
  'prop_gate_shrine',
  'prop_pigeon_coop',
  'prop_sail_rack',
  'prop_covered_wagon',
  'prop_carriage',
  'prop_wagon',
  'prop_catapult',
  'prop_ballista',
  'prop_traveler_camp',
  'prop_guard_post',
  'prop_training_dummy',
  'prop_scarecrow',
  'prop_hitching_post',
  'prop_weapon_rack',
  'prop_herb_drying_rack',
  'prop_harbor_bell',
  'prop_town_milestone',
  'prop_tenement_block',
  'prop_russian_stove',
  'prop_apt_bed',
  'prop_apt_table',
  'prop_apt_lantern',
]);

const BEHIND_RE =
  /prop_(house_|inn|tavern|chapel|cathedral|palace|hut|totem|.*tower|.*_hall|warehouse|granary|barracks|armory|bakery|brewery|bathhouse|lighthouse|windmill|gazebo|stable|farmhouse|jail|keep_|guild|archive|scriptorium|library|school|customs|dock_|captain_|mason_|wagon_workshop|ropewalk|chandler|fishmonger|glassblower|leatherworker|cobbler|carpenter|blacksmith|apothecary|jeweler|butcher|moneylender|tailor|barber|weigh_|fire_brigade|tea_house|healer_|watch_house|candle_shop|cheese_shop|map_shop|scaffold|statue_|obelisk|.*monument|grave_angel|.*shrine|covered_wagon|carriage|wagon$|catapult|ballista|harbor_crane|pilot_lookout|public_oven|pottery_kiln|weaver_loom|pigeon_coop|sail_rack)/;

const TRUNK_RE = /prop_(tree_|orchard_)/;
const ARCH_RE = /prop_(.*_arch|colonnade|grape_arbor|garden_pergola)/;
const STALL_RE = /prop_(market_|.*_stall|crier_stand|perfume_stall|shop_front|.*_cart)/;

/** Player may sort under the south facade / canopy / arch span / stall awning. */
export function propAllowsWalkBehind(assetId: string): boolean {
  const k = propLayerKind(assetId);
  return k === 'behind' || k === 'trunk' || k === 'arch' || k === 'stall';
}

export function propColliderMode(assetId: string): PropColliderMode {
  return propLayerKind(assetId);
}

export function propLayerKind(assetId: string): PropLayerKind {
  if (FLAT.has(assetId) || isHavenShipHullAsset(assetId)) return 'flat';
  if (STALL.has(assetId) || STALL_RE.test(assetId)) return 'stall';
  if (ARCH.has(assetId) || ARCH_RE.test(assetId)) return 'arch';
  if (TRUNK.has(assetId) || TRUNK_RE.test(assetId)) return 'trunk';
  if (BEHIND.has(assetId) || BEHIND_RE.test(assetId)) return 'behind';
  return 'flat';
}
