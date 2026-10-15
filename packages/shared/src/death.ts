export type DeathKind = 'combat' | 'faint' | 'doom';

export const DEATH_KINDS: readonly DeathKind[] = ['combat', 'faint', 'doom'];

export const DEATH_XP_PENALTY_BY_KIND: Record<DeathKind, number> = {
  combat: 0.25,
  faint: 0.25,
  doom: 0.4,
};

export const SURVIVAL_COLLAPSE_CAUSE_PREFIX = 'Потерял сознание';
export const SURVIVAL_DOOM_CAUSE_PREFIX = 'Гибель';
export const DOOM_ADENA_PENALTY_RATIO = 0.1;

export function deathXpPercent(kind: DeathKind): number {
  return Math.round(DEATH_XP_PENALTY_BY_KIND[kind] * 100);
}

export function hasSurvivalInjury(
  conditions?: ReadonlyArray<{ kind: string }> | null,
): boolean {
  return Boolean(conditions?.some((condition) => condition.kind === 'injury'));
}

export function isDeathKind(value: unknown): value is DeathKind {
  return value === 'combat' || value === 'faint' || value === 'doom';
}

export function inferDeathKind(cause?: string | null, kind?: DeathKind | null): DeathKind {
  if (isDeathKind(kind)) return kind;
  if (cause?.includes(SURVIVAL_DOOM_CAUSE_PREFIX)) return 'doom';
  if (cause?.includes(SURVIVAL_COLLAPSE_CAUSE_PREFIX)) return 'faint';
  return 'combat';
}
