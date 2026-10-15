/** Lightweight anonymous counters for Survival-Life rollout (no PII). */
const counters = {
  ticks: 0,
  deficits: 0,
  criticals: 0,
  collapses: 0,
  dooms: 0,
  consumes: 0,
  treatments: 0,
  processes: 0,
  npcCare: 0,
};

export type SurvivalTelemetryKey = keyof typeof counters;

export function recordSurvival(key: SurvivalTelemetryKey, amount = 1): void {
  counters[key] += amount;
}

export function survivalTelemetrySnapshot() {
  return { ...counters, at: new Date().toISOString() };
}
