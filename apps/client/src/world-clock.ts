/** Client-side world clock + Haven schedule synced from server (authoritative). */

import {
  absoluteGameHours,
  type DayNightSnapshot,
  type HavenScheduleSnapshot,
} from '@empery/shared';

let worldGameHour: number | undefined;
let worldClock: DayNightSnapshot | null = null;
let havenSchedule: HavenScheduleSnapshot | null = null;

type ScheduleListener = () => void;
const scheduleListeners = new Set<ScheduleListener>();

export function subscribeHavenSchedule(listener: ScheduleListener): () => void {
  scheduleListeners.add(listener);
  return () => scheduleListeners.delete(listener);
}

function emitHavenScheduleListeners(): void {
  for (const listener of scheduleListeners) listener();
}

export function setWorldGameHour(hour: number | undefined): void {
  worldGameHour = hour;
}

export function getWorldGameHour(): number | undefined {
  return worldGameHour;
}

export function setHavenSchedule(snap: HavenScheduleSnapshot | null): void {
  havenSchedule = snap;
  emitHavenScheduleListeners();
}

export function getHavenSchedule(): HavenScheduleSnapshot | null {
  return havenSchedule;
}

/** Apply authoritative server world time / schedule snapshot. */
export function applyWorldClock(
  snapshot: DayNightSnapshot,
  schedule?: HavenScheduleSnapshot,
): void {
  worldClock = snapshot;
  worldGameHour = snapshot.hour;
  if (schedule) havenSchedule = schedule;
  emitHavenScheduleListeners();
}

export function getWorldClock(): DayNightSnapshot | null {
  return worldClock;
}

export function getAbsoluteGameHours(): number {
  if (!worldClock) return worldGameHour ?? 12;
  return absoluteGameHours(worldClock.serverAt, worldClock.cycleMs, worldClock.epochMs);
}
