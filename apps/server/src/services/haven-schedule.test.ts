import { describe, expect, it } from 'vitest';
import {
  computeHavenSchedule,
  HAVEN_NIGHT_GUARD_COUNT,
  gameMsAtHour,
  havenScheduleEntryById,
  havenScheduleRefreshDue,
  HAVEN_NPC_POSTS,
  HAVEN_NPC_SLEEP_ORDER,
  HAVEN_STAGE_ACTOR_COUNT,
  GUARD_PATROL_LAP_MS,
  HAVEN_SCHEDULE_IDLE_REFRESH_MS,
  resolveNpcSleepHome,
  SCHEDULE_STAGGER_MS,
} from '@empery/shared';

const CONFIG = { cycleMs: 40 * 60_000, epochMs: Date.UTC(2026, 0, 1) };

function post(id: string): { postX: number; postY: number } {
  const found = HAVEN_NPC_POSTS.find((p) => p.id === id);
  if (!found) throw new Error(`missing post ${id}`);
  return found;
}

function msAtHour(hour: number, now: number): number {
  return gameMsAtHour(hour, now, CONFIG.cycleMs, CONFIG.epochMs);
}

describe('computeHavenSchedule', () => {
  it('starts the night shift with staggered exits and walks to patrol posts', () => {
    const evening = msAtHour(21, Date.now());
    const start = computeHavenSchedule(evening + 1, CONFIG);
    expect(start.ambient.at(-HAVEN_NIGHT_GUARD_COUNT)?.phase).toBe('walking_to_post');
    expect(start.ambient.at(-1)?.phase).toBe('at_home');
    expect(start.transitionActive).toBe(true);
    expect(computeHavenSchedule(evening + 160_000, CONFIG).ambient.slice(-HAVEN_NIGHT_GUARD_COUNT)
      .every(actor => actor.phase === 'patrol' && !actor.asleep)).toBe(true);
  });

  it('returns the night watch home at dawn instead of hiding the entire shift', () => {
    const dawn = msAtHour(7, Date.now());
    const before = computeHavenSchedule(dawn - 1, CONFIG).ambient.slice(-HAVEN_NIGHT_GUARD_COUNT);
    expect(before.every((guard) => guard.phase === 'patrol')).toBe(true);
    const departing = computeHavenSchedule(dawn + 1, CONFIG);
    expect(departing.ambient.at(-HAVEN_NIGHT_GUARD_COUNT)?.phase).toBe('walking_home');
    expect(departing.ambient.at(-1)?.phase).toBe('patrol');
    expect(departing.transitionActive).toBe(true);
    const returning = computeHavenSchedule(dawn + 20_000, CONFIG).ambient.slice(-HAVEN_NIGHT_GUARD_COUNT);
    expect(returning.every((guard) => guard.phase === 'walking_home' && !guard.asleep)).toBe(true);
    const resting = computeHavenSchedule(dawn + 160_000, CONFIG).ambient.slice(-HAVEN_NIGHT_GUARD_COUNT);
    expect(resting.every((guard) => guard.phase === 'at_home' && guard.asleep)).toBe(true);
  });

  it('mid-night join: merchants already asleep at home, not walking', () => {
    const now = msAtHour(2, Date.now());
    const snap = computeHavenSchedule(now, CONFIG);
    expect(snap.restActive).toBe(true);
    expect(snap.transitionActive).toBe(false);

    const merchant = snap.npcs.find((n) => n.id === 'town_merchant');
    expect(merchant?.phase).toBe('at_home');
    expect(merchant?.asleep).toBe(true);

    const bard = snap.stage.find((a) => a.id === 'stage_bard');
    expect(bard?.asleep).toBe(true);
  });

  it('just after 21:00: staggered walk home in progress with street interaction enabled', () => {
    const restStart = msAtHour(21, Date.now());
    const early = computeHavenSchedule(restStart + 1_000, CONFIG);
    expect(early.transitionActive).toBe(true);
    const firstWalking = early.npcs.find((n) => n.id === HAVEN_NPC_SLEEP_ORDER[0]);
    expect(firstWalking?.phase).toBe('walking_home');
    expect(firstWalking?.interactable).toBe(true);

    const secondDeparting = computeHavenSchedule(restStart + SCHEDULE_STAGGER_MS + 1_000, CONFIG);
    expect(secondDeparting.npcs.find((n) => n.id === HAVEN_NPC_SLEEP_ORDER[1])?.phase).toBe(
      'walking_home',
    );
  });

  it('dawn: NPCs still at home stay at_home until their walk starts', () => {
    const dayStart = msAtHour(7, Date.now());
    const snap = computeHavenSchedule(dayStart + 200, CONFIG);
    expect(snap.restActive).toBe(false);
    const late = snap.npcs.find((n) => n.id === HAVEN_NPC_SLEEP_ORDER[HAVEN_NPC_SLEEP_ORDER.length - 1]);
    expect(late?.phase).toBe('at_home');
    expect(late?.asleep).toBe(true);
    const first = snap.npcs.find((n) => n.id === HAVEN_NPC_SLEEP_ORDER[0]);
    expect(first?.phase).toBe('walking_to_post');
    expect(first?.interactable).toBe(true);
  });

  it('priest and informant stay at post at night', () => {
    const night = msAtHour(23, Date.now());
    const snap = computeHavenSchedule(night, CONFIG);
    const priest = snap.npcs.find((n) => n.id === 'town_priest');
    const informant = snap.npcs.find((n) => n.id === 'town_informant');
    expect(priest?.phase).toBe('open');
    expect(informant?.phase).toBe('open');
    expect(priest?.interactable).toBe(true);
    expect(informant?.interactable).toBe(true);
    expect(priest?.x).toBe(post('town_priest').postX);
    expect(informant?.x).toBe(post('town_informant').postX);
  });

  it('innkeeper and healer stay at post at night; day innkeeper works by day', () => {
    const night = msAtHour(23, Date.now());
    const nightSnap = computeHavenSchedule(night, CONFIG);
    const inn = nightSnap.npcs.find((n) => n.id === 'town_innkeeper');
    const healer = nightSnap.npcs.find((n) => n.id === 'town_healer');
    expect(inn?.phase).toBe('open');
    expect(healer?.phase).toBe('open');
    expect(inn?.x).toBe(post('town_innkeeper').postX);
    expect(inn?.y).toBe(post('town_innkeeper').postY);
    expect(healer?.x).toBe(post('town_healer').postX);

    const day = msAtHour(12, Date.now());
    const daySnap = computeHavenSchedule(day, CONFIG);
    const dayInn = daySnap.npcs.find((n) => n.id === 'town_innkeeper_day');
    const nightInn = daySnap.npcs.find((n) => n.id === 'town_innkeeper');
    expect(dayInn?.phase).toBe('at_post');
    expect(dayInn?.interactable).toBe(true);
    expect(nightInn?.phase).toBe('at_home');
    expect(nightInn?.interactable).toBe(false);
  });

  it('guard patrols at night', () => {
    const now = msAtHour(1, Date.now());
    const snap = computeHavenSchedule(now, CONFIG);
    const guard = snap.npcs.find((n) => n.id === 'town_guard');
    expect(guard?.phase).toBe('patrol');
    expect(guard?.x).not.toBe(post('town_guard').postX);
  });

  it('keeps the guard moving for the whole night instead of stopping after two laps', () => {
    const restStart = msAtHour(21, Date.now());
    const offset = GUARD_PATROL_LAP_MS * 0.37;
    const first = computeHavenSchedule(restStart + offset, CONFIG);
    const afterThreeLaps = computeHavenSchedule(
      restStart + GUARD_PATROL_LAP_MS * 3 + offset,
      CONFIG,
    );
    const firstGuard = havenScheduleEntryById(first, 'town_guard');
    const laterGuard = havenScheduleEntryById(afterThreeLaps, 'town_guard');

    expect(GUARD_PATROL_LAP_MS).toBeGreaterThan(0);
    expect(laterGuard?.phase).toBe('patrol');
    expect(laterGuard?.x).toBeCloseTo(firstGuard!.x, 5);
    expect(laterGuard?.y).toBeCloseTo(firstGuard!.y, 5);
  });

  it('emits continuous stage actor ids matching shared actor count', () => {
    const snap = computeHavenSchedule(msAtHour(12, Date.now()), CONFIG);
    expect(snap.stage).toHaveLength(HAVEN_STAGE_ACTOR_COUNT);
    expect(snap.stage[0]?.id).toBe('stage_bard');
    for (let i = 1; i < HAVEN_STAGE_ACTOR_COUNT; i++) {
      expect(snap.stage[i]?.id).toBe(`stage_audience_${i - 1}`);
    }
  });

  it('indexes NPC entries without a linear scan per lookup', () => {
    const snap = computeHavenSchedule(msAtHour(12, Date.now()), CONFIG);
    expect(havenScheduleEntryById(snap, 'town_merchant')?.id).toBe('town_merchant');
    expect(havenScheduleEntryById(snap, 'missing_npc')).toBeUndefined();
  });

  it('refreshes idle snapshots on the idle interval, walking ones every call', () => {
    const idle = computeHavenSchedule(msAtHour(12, Date.now()), CONFIG);
    expect(idle.transitionActive).toBe(false);
    expect(havenScheduleRefreshDue(idle, 0, HAVEN_SCHEDULE_IDLE_REFRESH_MS - 1)).toBe(false);
    expect(havenScheduleRefreshDue(idle, 0, HAVEN_SCHEDULE_IDLE_REFRESH_MS)).toBe(true);

    const dusk = computeHavenSchedule(msAtHour(21, Date.now()) + 1_000, CONFIG);
    expect(dusk.transitionActive).toBe(true);
    expect(havenScheduleRefreshDue(dusk, 0, 16)).toBe(true);
  });

  it('resolves district-appropriate sleep homes across Haven', () => {
    // Fisher & dockhand sleep near the harbor
    const fisherHome = resolveNpcSleepHome('town_fisher', 4320, 3120);
    expect(fisherHome.x).toBe(62 * 64 + 32);
    expect(fisherHome.y).toBe(44 * 64 + 32);

    const dockhandHome = resolveNpcSleepHome('town_dockhand', 3744, 3000);
    expect(dockhandHome.x).toBe(58 * 64 + 32);
    expect(dockhandHome.y).toBe(45 * 64 + 32);

    // Stablemaster sleeps near the stable yard, clear of the terraced quarter
    const stableHome = resolveNpcSleepHome('town_stable', 1888, 2680);
    expect(stableHome.x).toBe(32 * 64 + 32);
    expect(stableHome.y).toBe(39 * 64 + 32);

    // Bathkeeper & brewer sleep near eastern inn/baths wing
    const bathHome = resolveNpcSleepHome('town_bathkeeper', 3360, 1552);
    expect(bathHome.x).toBe(54 * 64 + 32);
    expect(bathHome.y).toBe(21 * 64 + 32);

    const brewerHome = resolveNpcSleepHome('town_brewer', 4096, 1560);
    expect(brewerHome.x).toBe(62 * 64 + 32);
    expect(brewerHome.y).toBe(21 * 64 + 32);
  });
});
