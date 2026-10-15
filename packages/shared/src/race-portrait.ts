import type { PlayerGender } from './types.js';
import { normalizeGender } from './gender.js';

function normalizeProfession(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const id = value.trim().toLowerCase();
  return id || undefined;
}

/**
 * Resolve portrait asset:
 * race_{race}_{gender}_{profession} → race_{race}_{gender} → fallback → race_{race}
 */
export function pickRacePortraitAssetId(
  raceId: string,
  gender: PlayerGender | string | null | undefined,
  hasAsset: (id: string) => boolean,
  fallbackAssetId?: string | null,
  professionId?: string | null,
): string | undefined {
  const race = (raceId || 'human').trim() || 'human';
  const g = normalizeGender(gender);
  const profession = normalizeProfession(professionId);
  const candidates = [
    profession ? `race_${race}_${g}_${profession}` : undefined,
    `race_${race}_${g}`,
    fallbackAssetId ?? undefined,
    `race_${race}`,
  ].filter((id): id is string => Boolean(id));

  for (const id of candidates) {
    if (hasAsset(id)) return id;
  }
  return candidates[0];
}
