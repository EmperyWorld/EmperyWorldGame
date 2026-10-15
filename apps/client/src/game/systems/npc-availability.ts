import {
  havenShipSkipperPresent,
  isHavenShipSkipperNpc,
  isHavenStaticNpc,
  isNpcInteractable,
  type HavenNpcScheduleEntry,
} from '@empery/shared';

/**
 * Haven moving actors require an authoritative schedule entry. Fixed
 * infrastructure actors use the shared static allowlist instead.
 */
export function npcAvailableForInteraction(
  npcId: string,
  locationId: string,
  hour: number | undefined,
  scheduleEntry: HavenNpcScheduleEntry | undefined,
  actorAvailable = true,
  absHours?: number,
): boolean {
  if (isHavenShipSkipperNpc(npcId)) {
    return actorAvailable && havenShipSkipperPresent(npcId, absHours ?? hour ?? 12);
  }
  if (scheduleEntry) return actorAvailable && scheduleEntry.interactable && !scheduleEntry.asleep;
  if (locationId === 'empery_haven' && !isHavenStaticNpc(npcId)) return false;
  return (
    actorAvailable &&
    (hour == null || isNpcInteractable(npcId, hour, { locationId }))
  );
}
