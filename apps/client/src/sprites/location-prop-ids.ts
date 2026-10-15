/**
 * Prop asset IDs actually placed on a location.
 * BootScene preloads this set instead of every `prop_*` in the media manifest.
 */

import { EMPERY_HQ_LOBBY_PROPS, havenShipVisualAssetIds } from '@empery/shared';
import { EMPERY_HQ_PROPS } from './empery-hq-data.js';
import { HAVEN_CITY_PROPS } from './haven-city-data.js';
import { HAVEN_NPC_BUILDINGS } from './haven-npc-buildings.js';

const STATION_PROPS = [
  'prop_well',
  'prop_campfire',
  'prop_hearth',
  'prop_cookpot',
  'prop_washbasin',
] as const;

/** Placed by Haven runtime modules, not only HAVEN_CITY_PROPS. */
const HAVEN_RUNTIME_PROPS = [
  'prop_tenement_block',
  'prop_basketball_court',
  'prop_windmill',
  'prop_training_dummy',
  'prop_coal_pile',
  'prop_flour_sacks',
  // Day/night gate swaps — not placed in layout, swapped at runtime.
  'prop_city_gate_open',
  'prop_city_gate_s_open',
  'prop_city_gate_e_open',
  'tile_haven_dock_a',
  'tile_haven_dock_b',
  'tile_haven_dock_c',
  'tile_haven_dock_d',
  'tile_haven_dock_e',
  'prop_dock_crates',
  'prop_dock_nets',
  'prop_dock_barrels',
  'prop_dock_rope',
  'prop_dock_fishboxes',
] as const;

const GROVE_PROPS = ['prop_tree_oak', 'prop_hut', 'prop_campfire'] as const;

const APARTMENT_PROPS = [
  'prop_apt_rug',
  'prop_apt_table',
  'prop_apt_lantern',
  'prop_apt_bed',
  'prop_russian_stove',
  'prop_storage_chest',
  'prop_weapon_rack',
  'prop_icebox',
  'prop_bench',
] as const;

const SILVERWOOD_PROPS = ['prop_tree_silver', 'prop_shrine'] as const;

const ASH_PROPS = ['prop_rock_volcanic', 'prop_totem'] as const;

const PARK_PROPS = [
  'prop_fountain',
  'prop_bench',
  'prop_planter',
  'prop_signpost',
  'prop_street_lamp',
  'prop_bush_garden',
  'prop_tree_oak',
] as const;

const YARD_PROPS = [
  'prop_warehouse',
  'prop_crate_stack',
  'prop_barrels',
  'prop_merchant_cart',
  'prop_signpost',
  'prop_guard_tower',
  'prop_city_gate',
] as const;

/** Shared set for Act 2+ outdoor maps that reuse the same shrine / tower kit. */
const ANOMALY_PROPS = [
  'prop_shrine',
  'prop_banner_pole',
  'prop_street_lamp',
  'prop_crate_stack',
  'prop_barrels',
  'prop_signpost',
  'prop_guard_tower',
  'prop_totem',
  'prop_rock_volcanic',
  'prop_campfire',
] as const;

const ANOMALY_LOCATIONS = new Set([
  'intersection_district',
  'signal_block',
  'relay_spire',
  'static_core',
  'chaos_sector',
  'fracture_ridge',
  'void_scar',
  'collapse_fringe',
  'citadel_approach',
  'singularity_citadel',
  'gods_rift',
  'pantheon_ascent',
  'godfall_throne',
]);

const EXTRA_BY_LOCATION: Record<string, readonly string[]> = {
  starter_grove: GROVE_PROPS,
  haven_apartment: APARTMENT_PROPS,
  silverwood: SILVERWOOD_PROPS,
  ash_highlands: ASH_PROPS,
  suburban_park: PARK_PROPS,
  abandoned_yard: YARD_PROPS,
};

let havenUnique: Set<string> | null = null;
let hqUnique: Set<string> | null = null;

function uniqueFromRows(rows: ReadonlyArray<readonly [string, ...unknown[]]>): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) ids.add(row[0]);
  return ids;
}

function havenPropIds(): Set<string> {
  if (!havenUnique) {
    havenUnique = uniqueFromRows(HAVEN_CITY_PROPS);
    for (const id of HAVEN_RUNTIME_PROPS) havenUnique.add(id);
    // Colossi live in HAVEN_NPC_BUILDINGS, not HAVEN_CITY_PROPS (those rows are skipped).
    // Without this, placeWorldProp gets no texture → brown house fallback.
    for (const b of HAVEN_NPC_BUILDINGS) havenUnique.add(b.prop);
    for (const id of havenShipVisualAssetIds()) havenUnique.add(id);
  }
  return havenUnique;
}

function hqPropIds(): Set<string> {
  if (!hqUnique) hqUnique = uniqueFromRows(EMPERY_HQ_PROPS);
  return hqUnique;
}

/** Prop asset ids that this location actually draws. */
export function locationPropIds(locationId: string): Set<string> {
  const ids = new Set<string>(STATION_PROPS);
  if (locationId === 'empery_haven') {
    for (const id of havenPropIds()) ids.add(id);
  } else if (locationId === 'empery_hq_lobby') {
    for(const [id] of EMPERY_HQ_LOBBY_PROPS)ids.add(id);
  } else if (locationId === 'empery_hq') {
    for (const id of hqPropIds()) ids.add(id);
  }
  const extra = EXTRA_BY_LOCATION[locationId];
  if (extra) {
    for (const id of extra) ids.add(id);
  }
  if (ANOMALY_LOCATIONS.has(locationId)) {
    for (const id of ANOMALY_PROPS) ids.add(id);
  }
  return ids;
}
