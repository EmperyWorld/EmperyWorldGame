/** Haven NPC day/night schedule — who sleeps, stays open, or patrols. */

export const NPC_REST_FROM_HOUR = 21;
export const NPC_REST_TO_HOUR = 7;

/** Tavern, healer, vigil, and the whisper alley stay available overnight. HQ sentry never leaves the gate. */
export const NPC_NIGHT_OPEN = new Set([
  'town_innkeeper',
  'town_healer',
  'town_hq_sentry',
  'town_notice_board',
  'town_priest',
  'town_informant',
]);

/** Fixed infrastructure actors intentionally absent from HAVEN_NPC_POSTS. */
export const HAVEN_STATIC_NPCS = new Set([
  'town_hq_sentry',
  'town_notice_board',
  'harbor_skipper_barge',
  'harbor_skipper_cog',
  'harbor_skipper_fishing',
  'harbor_skipper_caravel',
  'harbor_skipper_ferry',
  'harbor_skipper_skiff',
  'harbor_skipper_brig',
]);

export function isHavenStaticNpc(npcId: string): boolean {
  return HAVEN_STATIC_NPCS.has(npcId);
}

/** Night shift only — sleep at home during the day. */
export const NPC_NIGHT_ONLY = new Set(['town_innkeeper']);

/** Day shift only — sleep at home overnight. */
export const NPC_DAY_ONLY = new Set(['town_innkeeper_day']);

/** City guard patrols the streets at night. */
export const NPC_NIGHT_PATROL = new Set(['town_guard']);

export const NPC_NIGHT_PATROL_RADIUS_MULT = 2.4;

export type NpcScheduleMode = 'day' | 'sleep' | 'open' | 'patrol';

export function isNpcRestHour(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= NPC_REST_FROM_HOUR || h < NPC_REST_TO_HOUR;
}

/** Schedule applies only in the main town hub for now. */
export function npcScheduleLocationEnabled(locationId?: string): boolean {
  return locationId === 'empery_haven';
}

export function resolveNpcScheduleMode(
  npcId: string,
  hour: number,
  opts?: { locationId?: string },
): NpcScheduleMode {
  if (npcId.startsWith('haven_citizen_')) {
    return npcId === 'haven_citizen_guard' && isNpcRestHour(hour) ? 'patrol' : 'day';
  }
  if (!npcScheduleLocationEnabled(opts?.locationId)) return 'day';
  if (!isNpcRestHour(hour)) {
    if (NPC_NIGHT_ONLY.has(npcId)) return 'sleep';
    return 'day';
  }
  if (NPC_DAY_ONLY.has(npcId)) return 'sleep';
  if (NPC_NIGHT_OPEN.has(npcId)) return 'open';
  if (NPC_NIGHT_PATROL.has(npcId)) return 'patrol';
  return 'sleep';
}

export function isNpcInteractable(
  npcId: string,
  hour: number,
  opts?: { locationId?: string; phase?: string },
): boolean {
  if (npcId.startsWith('haven_citizen_')) return true;
  if (npcId.startsWith('harbor_skipper_')) return true;
  if (opts?.phase === 'walking_home' || opts?.phase === 'walking_to_post') return true;
  return resolveNpcScheduleMode(npcId, hour, opts) !== 'sleep';
}
