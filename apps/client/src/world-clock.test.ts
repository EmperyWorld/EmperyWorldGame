import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HavenScheduleSnapshot } from '@empery/shared';
import { applyWorldClock, getHavenSchedule, setHavenSchedule } from './world-clock.js';

function schedule(serverAt: number): HavenScheduleSnapshot {
  return {
    locationId: 'empery_haven',
    serverAt,
    hour: 12,
    restActive: false,
    transitionActive: false,
    performancePaused: false,
    npcs: [],
    stage: [],
    ambient: [],
  } as HavenScheduleSnapshot;
}

describe('world-clock authoritative schedule', () => {
  afterEach(() => {
    setHavenSchedule(null);
    vi.useRealTimers();
  });

  it('keeps last server schedule unchanged between ticks', () => {
    vi.useFakeTimers();
    const snap = schedule(1000);
    setHavenSchedule(snap);
    vi.advanceTimersByTime(30_000);
    expect(getHavenSchedule()).toBe(snap);
  });

  it('applyWorldClock replaces schedule only with incoming server payload', () => {
    const a = schedule(1000);
    const b = schedule(5000);
    setHavenSchedule(a);
    applyWorldClock({ hour: 9, dayProgress: 0.3, phaseName: 'Утро', overlayColor: 0, overlayAlpha: 0, darkness: 0, sunHeight: 0.4, cycleMs: 600000, epochMs: 0, serverAt: 5000 }, b);
    expect(getHavenSchedule()).toBe(b);
  });

  it('does not keep compatibility refresh API for schedule simulation', () => {
    const src = readFileSync(new URL('./world-clock.ts', import.meta.url), 'utf8');
    expect(src.includes('refreshHavenSchedule')).toBe(false);
  });
});
