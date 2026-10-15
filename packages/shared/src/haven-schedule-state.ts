import { HAVEN_STAGE_SEAT_OFFSETS, havenStageSeat } from './haven-stage-layout.js';
import {
  gameHourFromMs,
  type DayNightConfig,
} from './day-night.js';
import {
  guardPatrolWorldPoints,
  havenTileCenter,
  resolveNpcSleepHome,
} from './haven-npc-homes.js';
import { havenStreetPathLength, pointAlongHavenStreet } from './haven-street-path.js';
import {
  HAVEN_AMBIENT_ACTOR_COUNT,
  HAVEN_NIGHT_GUARD_COUNT,
  HAVEN_NPC_POSTS,
  HAVEN_NPC_SLEEP_ORDER,
  HAVEN_STAGE_ACTOR_COUNT,
} from './haven-npc-posts.js';
import {
  isNpcInteractable,
  isNpcRestHour,
  NPC_DAY_ONLY,
  NPC_NIGHT_ONLY,
  resolveNpcScheduleMode,
  type NpcScheduleMode,
} from './npc-schedule.js';

export const SCHEDULE_STAGGER_MS = 3_500;
/** Fallback / minimum when path length is tiny (tests, degenerate). */
export const SCHEDULE_WALK_MS = 32_000;
/** Hurried street walk — duration scales with path length. */
export const SCHEDULE_WALK_SPEED = 56;
export const SCHEDULE_WALK_MS_MIN = 16_000;
export const SCHEDULE_WALK_MS_MAX = 120_000;
/**
 * Ambient only samples walkT (no real from/to in schedule) — must cover
 * cross-town distance at ~36–48 px/s after client frame-skip.
 * ~2200px / 36 ≈ 61s; stagger waves need headroom → 140s.
 */
export const AMBIENT_WALK_MS = 140_000;
export const SCHEDULE_PATROL_SPEED = 42;
const GUARD_PATROL_PATH = guardPatrolWorldPoints();
const GUARD_PATROL_SEGMENT_LENGTHS = GUARD_PATROL_PATH.map((point, index) => {
  const next = GUARD_PATROL_PATH[(index + 1) % GUARD_PATROL_PATH.length] ?? point;
  return Math.hypot(next.x - point.x, next.y - point.y);
});
const GUARD_PATROL_PATH_LENGTH = GUARD_PATROL_SEGMENT_LENGTHS.reduce(
  (total, length) => total + length,
  0,
);
export const GUARD_PATROL_LAP_MS =
  GUARD_PATROL_PATH_LENGTH > 0
    ? (GUARD_PATROL_PATH_LENGTH / SCHEDULE_PATROL_SPEED) * 1000
    : 0;
/** Crowd home/work waves — keep ambient clear within ~1 game hour. */
export const AMBIENT_STAGGER_MS = 450;

export type NpcSchedulePhase =
  | 'at_post'
  | 'walking_home'
  | 'at_home'
  | 'walking_to_post'
  | 'patrol'
  | 'open';

export interface HavenNpcScheduleEntry {
  id: string;
  mode: NpcScheduleMode;
  phase: NpcSchedulePhase;
  x: number;
  y: number;
  asleep: boolean;
  interactable: boolean;
  /** Commute progress for collision-safe client bootstrap; absent in older snapshots. */
  walkT?: number;
}

export interface HavenStageActorSchedule {
  id: string;
  x: number;
  y: number;
  asleep: boolean;
  atSeat: boolean;
  walkT?: number;
}

export interface HavenAmbientScheduleEntry {
  phase: NpcSchedulePhase | 'hidden';
  asleep: boolean;
  /** 0–1 along walk segment when phase is walking_home / walking_to_post. */
  walkT: number;
  /** Patrol world position for night-only guards. */
  x?: number;
  y?: number;
}

export interface HavenScheduleSnapshot {
  locationId: 'empery_haven';
  serverAt: number;
  hour: number;
  restActive: boolean;
  /** True while any actor is still walking home / to post. */
  transitionActive: boolean;
  performancePaused: boolean;
  npcs: HavenNpcScheduleEntry[];
  stage: HavenStageActorSchedule[];
  ambient: HavenAmbientScheduleEntry[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** Real ms when the in-game clock last reached `targetHour` at or before `now`. */
export function gameMsAtHour(
  targetHour: number,
  now: number,
  cycleMs: number,
  epochMs: number,
): number {
  const hour = gameHourFromMs(now, cycleMs, epochMs);
  let dh = hour - targetHour;
  if (dh < 0) dh += 24;
  return now - (dh * cycleMs) / 24;
}

function restPeriodStartMs(now: number, config: DayNightConfig): number {
  return gameMsAtHour(21, now, config.cycleMs, config.epochMs);
}

function dayPeriodStartMs(now: number, config: DayNightConfig): number {
  return gameMsAtHour(7, now, config.cycleMs, config.epochMs);
}

function sleepOrderIndex(actorId: string): number {
  const npcIdx = HAVEN_NPC_SLEEP_ORDER.indexOf(actorId);
  if (npcIdx >= 0) return npcIdx;
  if (actorId === 'stage_bard') return HAVEN_NPC_SLEEP_ORDER.length;
  if (actorId.startsWith('stage_audience_')) {
    return HAVEN_NPC_SLEEP_ORDER.length + 1 + Number(actorId.replace('stage_audience_', ''));
  }
  if (actorId.startsWith('ambient_')) {
    return HAVEN_NPC_SLEEP_ORDER.length + HAVEN_STAGE_ACTOR_COUNT + Number(actorId.replace('ambient_', ''));
  }
  return 999;
}

function streetPathLength(fromX: number, fromY: number, toX: number, toY: number): number {
  return havenStreetPathLength(fromX, fromY, toX, toY);
}

/** Walk ms for a real street route (NPCs / stage). */
export function scheduleWalkMsForRoute(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fallbackMs = SCHEDULE_WALK_MS,
): number {
  const len = streetPathLength(fromX, fromY, toX, toY);
  if (len < 8) return fallbackMs;
  return Math.round(
    Math.min(
      SCHEDULE_WALK_MS_MAX,
      Math.max(SCHEDULE_WALK_MS_MIN, (len / SCHEDULE_WALK_SPEED) * 1000),
    ),
  );
}

function walkTransition(
  now: number,
  periodStartMs: number,
  orderIndex: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  towardHome: boolean,
  staggerMs = SCHEDULE_STAGGER_MS,
  walkMs?: number,
): { x: number; y: number; phase: NpcSchedulePhase; asleep: boolean; walkT: number } {
  const departAt = periodStartMs + orderIndex * staggerMs;
  if (now < departAt) {
    if (towardHome) {
      return { x: fromX, y: fromY, phase: 'at_post', asleep: false, walkT: 0 };
    }
    return { x: toX, y: toY, phase: 'at_home', asleep: true, walkT: 0 };
  }
  const duration =
    walkMs ??
    scheduleWalkMsForRoute(
      towardHome ? fromX : toX,
      towardHome ? fromY : toY,
      towardHome ? toX : fromX,
      towardHome ? toY : fromY,
    );
  const arriveAt = departAt + duration;

  if (now < arriveAt) {
    const t = (now - departAt) / duration;
    if (towardHome) {
      const pos = pointAlongHavenStreet(fromX, fromY, toX, toY, t);
      return {
        x: pos.x,
        y: pos.y,
        phase: 'walking_home',
        asleep: false,
        walkT: t,
      };
    }
    const pos = pointAlongHavenStreet(toX, toY, fromX, fromY, t);
    return {
      x: pos.x,
      y: pos.y,
      phase: 'walking_to_post',
      asleep: false,
      walkT: t,
    };
  }
  if (towardHome) {
    return { x: toX, y: toY, phase: 'at_home', asleep: true, walkT: 1 };
  }
  return { x: fromX, y: fromY, phase: 'at_post', asleep: false, walkT: 1 };
}

/** Transition phase for a scheduled actor (no world coords — client uses own anchors). */
export function resolveScheduleTransition(
  now: number,
  config: DayNightConfig,
  orderIndex: number,
  towardHome: boolean,
): Pick<HavenAmbientScheduleEntry, 'phase' | 'asleep' | 'walkT'> {
  const hour = gameHourFromMs(now, config.cycleMs, config.epochMs);
  const restActive = isNpcRestHour(hour);
  const periodStart = towardHome || restActive ? restPeriodStartMs(now, config) : dayPeriodStartMs(now, config);
  const tr = walkTransition(now, periodStart, orderIndex, 0, 0, 1, 1, towardHome);
  return { phase: tr.phase, asleep: tr.asleep, walkT: tr.walkT };
}

function patrolPosition(now: number, restStartMs: number): { x: number; y: number } {
  const path = GUARD_PATROL_PATH;
  if (path.length === 0) return { x: 0, y: 0 };
  const elapsed = Math.max(0, now - restStartMs);
  if (GUARD_PATROL_PATH_LENGTH < 1) return { ...path[0]! };
  let dist = ((elapsed / 1000) * SCHEDULE_PATROL_SPEED) % GUARD_PATROL_PATH_LENGTH;
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    const segLen = GUARD_PATROL_SEGMENT_LENGTHS[i] ?? 0;
    if (dist <= segLen) {
      const t = segLen > 0 ? dist / segLen : 0;
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    }
    dist -= segLen;
  }
  return { ...path[0]! };
}

/** Stage geometry — matches placeHavenStage defaults. */


/** Residential doors for bard + audience (64px tiles → world). */
const STAGE_HOME_TILES: readonly (readonly [number, number])[] = [
  [32, 18], // tenement
  [33, 19],
  [30, 17],
  [54, 22], // inn / baths side
  [56, 20],
  [48, 14], // cathedral road
  [50, 15],
  [12, 24], // market yards
  [10, 25],
  [28, 42], // south
  [62, 44], // harbor
  [14, 8], // garrison
];

export function stageHomeWorld(index: number): { x: number; y: number } {
  const tile = STAGE_HOME_TILES[index % STAGE_HOME_TILES.length]!;
  return havenTileCenter(tile[0], tile[1]);
}

const STAGE_BARD = {
  seatX: havenStageSeat(0).x,
  seatY: havenStageSeat(0).y,
  ...(() => {
    const h = stageHomeWorld(0);
    return { homeX: h.x, homeY: h.y };
  })(),
};

const STAGE_AUDIENCE_SEATS = HAVEN_STAGE_SEAT_OFFSETS.map((_, i) => {
  const seat = havenStageSeat(i + 1), home = stageHomeWorld(i + 1);
  return { ...seat, homeX: home.x, homeY: home.y };
});

/** Deterministic ambient slot order index (matches client ALL_CITIZEN_DEFS order). */
export function ambientScheduleOrderIndex(index: number): number {
  return HAVEN_NPC_SLEEP_ORDER.length + HAVEN_STAGE_ACTOR_COUNT + index;
}

export function computeHavenSchedule(now: number, config: DayNightConfig): HavenScheduleSnapshot {
  const hour = gameHourFromMs(now, config.cycleMs, config.epochMs);
  const restActive = isNpcRestHour(hour);
  const restStart = restPeriodStartMs(now, config);
  const dayStart = dayPeriodStartMs(now, config);
  const npcs: HavenNpcScheduleEntry[] = [];
  let transitionActive = false;

  for (const post of HAVEN_NPC_POSTS) {
    const sleep = resolveNpcSleepHome(post.id, post.postX, post.postY);
    const mode = resolveNpcScheduleMode(post.id, hour, { locationId: 'empery_haven' });

    if (mode === 'open') {
      npcs.push({
        id: post.id,
        mode,
        phase: 'open',
        x: post.postX,
        y: post.postY,
        asleep: false,
        interactable: true,
      });
      continue;
    }

    if (mode === 'patrol') {
      const pos = patrolPosition(now, restStart);
      npcs.push({
        id: post.id,
        mode,
        phase: 'patrol',
        x: pos.x,
        y: pos.y,
        asleep: false,
        interactable: true,
      });
      continue;
    }

    if (!restActive && NPC_NIGHT_ONLY.has(post.id)) {
      npcs.push({
        id: post.id,
        mode: 'sleep',
        phase: 'at_home',
        x: sleep.x,
        y: sleep.y,
        asleep: true,
        interactable: false,
      });
      continue;
    }
    if (restActive && NPC_DAY_ONLY.has(post.id)) {
      npcs.push({
        id: post.id,
        mode: 'sleep',
        phase: 'at_home',
        x: sleep.x,
        y: sleep.y,
        asleep: true,
        interactable: false,
      });
      continue;
    }

    const orderIndex = sleepOrderIndex(post.id);
    if (restActive) {
      const tr = walkTransition(
        now,
        restStart,
        orderIndex,
        post.postX,
        post.postY,
        sleep.x,
        sleep.y,
        true,
      );
      if (tr.phase === 'walking_home') transitionActive = true;
      npcs.push({
        id: post.id,
        mode: 'sleep',
        phase: tr.phase,
        x: tr.x,
        y: tr.y,
        asleep: tr.asleep,
        walkT: tr.walkT,
        interactable: tr.phase === 'walking_home',
      });
    } else {
      const tr = walkTransition(
        now,
        dayStart,
        orderIndex,
        post.postX,
        post.postY,
        sleep.x,
        sleep.y,
        false,
      );
      if (tr.phase === 'walking_to_post') transitionActive = true;
      npcs.push({
        id: post.id,
        mode: 'day',
        phase: tr.phase,
        x: tr.x,
        y: tr.y,
        asleep: tr.asleep,
        walkT: tr.walkT,
        interactable:
          tr.phase === 'walking_to_post' ||
          (tr.phase === 'at_post' &&
            isNpcInteractable(post.id, hour, { locationId: 'empery_haven' })),
      });
    }
  }

  const stage: HavenStageActorSchedule[] = [];
  {
    const tr = walkTransition(
      now,
      restActive ? restStart : dayStart,
      sleepOrderIndex('stage_bard'),
      STAGE_BARD.seatX,
      STAGE_BARD.seatY,
      STAGE_BARD.homeX,
      STAGE_BARD.homeY,
      restActive,
    );
    if (tr.phase === 'walking_home' || tr.phase === 'walking_to_post') transitionActive = true;
    const atSeat = tr.phase === 'at_post' && !restActive;
    stage.push({
      id: 'stage_bard',
      x: tr.x,
      y: tr.y,
      asleep: tr.asleep,
      walkT: tr.walkT,
      atSeat,
    });
    npcs.push({
      id: 'stage_bard',
      mode: restActive ? 'sleep' : 'day',
      phase: tr.phase,
      x: tr.x,
      y: tr.y,
      asleep: tr.asleep,
      walkT: tr.walkT,
      interactable:
        tr.phase === 'walking_home' ||
        tr.phase === 'walking_to_post' ||
        atSeat,
    });
  }
  for (let i = 0; i < STAGE_AUDIENCE_SEATS.length; i++) {
    const seat = STAGE_AUDIENCE_SEATS[i]!;
    const tr = walkTransition(
      now,
      restActive ? restStart : dayStart,
      sleepOrderIndex(`stage_audience_${i}`),
      seat.x,
      seat.y,
      seat.homeX,
      seat.homeY,
      restActive,
    );
    if (tr.phase === 'walking_home' || tr.phase === 'walking_to_post') transitionActive = true;
    stage.push({
      id: `stage_audience_${i}`,
      x: tr.x,
      y: tr.y,
      asleep: tr.asleep,
      walkT: tr.walkT,
      atSeat: tr.phase === 'at_post' && !restActive,
    });
  }

  const ambient: HavenScheduleSnapshot['ambient'] = [];
  for (let i = 0; i < HAVEN_AMBIENT_ACTOR_COUNT; i++) {
    const isNightPatrol = i >= HAVEN_AMBIENT_ACTOR_COUNT - HAVEN_NIGHT_GUARD_COUNT;
    if (isNightPatrol) {
      if (!restActive) {
        const tr = walkTransition(
          now, dayStart, i - (HAVEN_AMBIENT_ACTOR_COUNT - HAVEN_NIGHT_GUARD_COUNT),
          0, 0, 1, 1, true, AMBIENT_STAGGER_MS, AMBIENT_WALK_MS,
        );
        if (tr.phase === 'walking_home') transitionActive = true;
        // A live guard must finish the street route even after the scheduled arrival.
        ambient.push({ phase: tr.phase === 'at_post' ? 'patrol' : tr.phase, asleep: tr.asleep, walkT: tr.walkT });
        continue;
      }
      const tr = walkTransition(
        now, restStart, i - (HAVEN_AMBIENT_ACTOR_COUNT - HAVEN_NIGHT_GUARD_COUNT),
        0, 0, 1, 1, false, AMBIENT_STAGGER_MS, AMBIENT_WALK_MS,
      );
      if (tr.phase === 'walking_to_post') transitionActive = true;
      // After physically reaching the post, clients follow their authored patrol loops.
      ambient.push({ phase: tr.phase === 'at_post' ? 'patrol' : tr.phase, asleep: tr.asleep, walkT: tr.walkT });
      continue;
    }
    const orderIndex = i;
    if (restActive) {
      const tr = walkTransition(
        now,
        restStart,
        orderIndex,
        0,
        0,
        1,
        1,
        true,
        AMBIENT_STAGGER_MS,
        AMBIENT_WALK_MS,
      );
      if (tr.phase === 'walking_home') transitionActive = true;
      ambient.push({ phase: tr.phase, asleep: tr.asleep, walkT: tr.walkT });
    } else {
      const tr = walkTransition(
        now,
        dayStart,
        orderIndex,
        0,
        0,
        1,
        1,
        false,
        AMBIENT_STAGGER_MS,
        AMBIENT_WALK_MS,
      );
      if (tr.phase === 'walking_to_post') transitionActive = true;
      ambient.push({ phase: tr.phase, asleep: tr.asleep, walkT: tr.walkT });
    }
  }

  const performancePaused =
    restActive &&
    (transitionActive || stage.some((a) => a.asleep) || stage.every((a) => !a.atSeat));

  return {
    locationId: 'empery_haven',
    serverAt: now,
    hour,
    restActive,
    transitionActive,
    performancePaused,
    npcs,
    stage,
    ambient,
  };
}

export const HAVEN_SCHEDULE_IDLE_REFRESH_MS = 400;

export function havenScheduleNeedsRealtime(snap: HavenScheduleSnapshot): boolean {
  if (snap.transitionActive) return true;
  for (const n of snap.npcs) {
    if (n.phase === 'patrol' || n.phase === 'walking_home' || n.phase === 'walking_to_post') {
      return true;
    }
  }
  return false;
}

/** Idle snapshots can be reused; walking/patrol still recomputes every call. */
export function havenScheduleRefreshDue(
  prev: HavenScheduleSnapshot | null,
  lastRefreshAt: number,
  now: number,
): boolean {
  if (!prev) return true;
  if (havenScheduleNeedsRealtime(prev)) return true;
  return now - lastRefreshAt >= HAVEN_SCHEDULE_IDLE_REFRESH_MS;
}

const ENTRY_INDEX = new WeakMap<HavenScheduleSnapshot, Map<string, HavenNpcScheduleEntry>>();

export function havenScheduleEntryById(
  snap: HavenScheduleSnapshot,
  id: string,
): HavenNpcScheduleEntry | undefined {
  let idx = ENTRY_INDEX.get(snap);
  if (!idx) {
    idx = new Map();
    for (const n of snap.npcs) idx.set(n.id, n);
    ENTRY_INDEX.set(snap, idx);
  }
  return idx.get(id);
}
