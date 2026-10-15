export function havenNightlifeActive(
  scheduleRestActive: boolean | undefined,
  worldHour: number | undefined,
): boolean {
  if (scheduleRestActive != null) return scheduleRestActive;
  return worldHour != null && (worldHour >= 21 || worldHour < 7);
}
