import { computeHavenSchedule, type HavenScheduleSnapshot } from '@empery/shared';
import type { DayNightService } from './day-night.js';

export function havenScheduleSnapshot(
  dayNight: DayNightService,
  now = Date.now(),
): HavenScheduleSnapshot {
  return computeHavenSchedule(now, dayNight.configSnapshot());
}
