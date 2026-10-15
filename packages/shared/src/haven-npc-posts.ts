/** Work positions for Haven interactive NPCs (matches content/locations/empery_haven.yaml). */

export interface HavenNpcPostDef {
  id: string;
  postX: number;
  postY: number;
}

export const HAVEN_NPC_POSTS: readonly HavenNpcPostDef[] = [
  { id: 'town_captain', postX: 864, postY: 736 },
  { id: 'town_merchant', postX: 800, postY: 1504 },
  { id: 'town_butcher', postX: 480, postY: 1504 },
  { id: 'town_radio', postX: 1184, postY: 1760 },
  { id: 'town_innkeeper', postX: 3744, postY: 1376 },
  { id: 'town_innkeeper_day', postX: 3808, postY: 1376 },
  { id: 'town_blacksmith', postX: 800, postY: 2272 },
  { id: 'town_stable', postX: 2016, postY: 2592 },
  { id: 'town_priest', postX: 3488, postY: 800 },
  { id: 'town_scribe', postX: 3872, postY: 608 },
  { id: 'town_guard', postX: 992, postY: 736 },
  { id: 'town_fisher', postX: 4256, postY: 2912 },
  { id: 'town_dockhand', postX: 3744, postY: 2912 },
  { id: 'town_bathkeeper', postX: 3488, postY: 1632 },
  { id: 'town_brewer', postX: 4128, postY: 1632 },
  { id: 'town_miller', postX: 1312, postY: 2336 },
  { id: 'town_healer', postX: 3104, postY: 1120 },
  { id: 'town_teacher', postX: 2848, postY: 2528 },
  { id: 'town_steward', postX: 608, postY: 2592 },
  { id: 'town_gardener', postX: 928, postY: 2464 },
  { id: 'town_informant', postX: 3872, postY: 1824 },
];

/** Order in which NPCs leave for home when night falls (and return at dawn). */
export const HAVEN_NPC_SLEEP_ORDER: readonly string[] = [
  'town_merchant',
  'town_butcher',
  'town_radio',
  'town_blacksmith',
  'town_miller',
  'town_stable',
  'town_fisher',
  'town_dockhand',
  'town_bathkeeper',
  'town_brewer',
  'town_priest',
  'town_scribe',
  'town_captain',
  'town_teacher',
  'town_steward',
  'town_gardener',
  'town_informant',
  'town_innkeeper_day',
];

/** Stage bard + audience count for schedule slots after shop NPCs. */
export const HAVEN_STAGE_ACTOR_COUNT = 12;

/** Night-only ambient: patrons at open venues + street patrols (tail of ambient array). */
export const HAVEN_NIGHT_VENUE_COUNT = 14;
export const HAVEN_NIGHT_PATROL_COUNT = 11;
/** @deprecated alias — venue + patrol night-only slots */
export const HAVEN_NIGHT_GUARD_COUNT = HAVEN_NIGHT_VENUE_COUNT + HAVEN_NIGHT_PATROL_COUNT;
/** Day citizens (122) + court families (7) + night venue (14) + night patrols (11). */
export const HAVEN_AMBIENT_ACTOR_COUNT = 154;
