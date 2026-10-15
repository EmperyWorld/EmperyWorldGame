export function shouldReseedAmbientJoinFromSchedule(
  pending: boolean,
  joinSeedServerAt: number | null,
  scheduleServerAt: number,
): boolean {
  if (!pending) return false;
  return joinSeedServerAt == null || scheduleServerAt !== joinSeedServerAt;
}
