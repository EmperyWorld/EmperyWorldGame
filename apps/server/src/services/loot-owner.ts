import type { GroundLootOwner } from '@empery/shared';

export interface DamagePartyLookup {
  /** Party id for save, or null if solo. */
  partyIdForSave(saveId: string): string | null;
  /** Party leader save id (when party exists). */
  partyLeaderSaveId(partyId: string): string | null;
}

interface DamageGroup {
  key: string;
  owner: GroundLootOwner;
  totalDamage: number;
  /** Highest personal contribution inside the group (tie-break). */
  topContributorSaveId: string;
  topContributorDamage: number;
}

/**
 * L2-style loot rights: group with the highest *accumulated* damage wins.
 * Mob HP regen does not erase past damage totals.
 */
export function resolveLootOwner(
  damageBySaveId: Record<string, number> | undefined,
  fallbackSaveId: string,
  lookup: DamagePartyLookup,
): GroundLootOwner {
  const entries = Object.entries(damageBySaveId ?? {}).filter(([, d]) => d > 0);
  if (entries.length === 0) {
    return { kind: 'solo', saveId: fallbackSaveId };
  }

  const groups = new Map<string, DamageGroup>();
  for (const [saveId, damage] of entries) {
    const partyId = lookup.partyIdForSave(saveId);
    let owner: GroundLootOwner;
    let key: string;
    if (partyId) {
      const leaderSaveId = lookup.partyLeaderSaveId(partyId) ?? saveId;
      owner = { kind: 'party', partyId, leaderSaveId };
      key = `party:${partyId}`;
    } else {
      owner = { kind: 'solo', saveId };
      key = `solo:${saveId}`;
    }
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        owner,
        totalDamage: damage,
        topContributorSaveId: saveId,
        topContributorDamage: damage,
      });
    } else {
      existing.totalDamage += damage;
      if (
        damage > existing.topContributorDamage ||
        (damage === existing.topContributorDamage && saveId < existing.topContributorSaveId)
      ) {
        existing.topContributorSaveId = saveId;
        existing.topContributorDamage = damage;
      }
    }
  }

  const ranked = [...groups.values()].sort((a, b) => {
    if (b.totalDamage !== a.totalDamage) return b.totalDamage - a.totalDamage;
    if (b.topContributorDamage !== a.topContributorDamage) {
      return b.topContributorDamage - a.topContributorDamage;
    }
    return a.topContributorSaveId.localeCompare(b.topContributorSaveId);
  });

  return ranked[0]?.owner ?? { kind: 'solo', saveId: fallbackSaveId };
}

export function recordEntityDamage(
  damageBySaveId: Record<string, number> | undefined,
  saveId: string,
  damage: number,
): Record<string, number> {
  const next = { ...damageBySaveId };
  if (damage <= 0) return next;
  next[saveId] = (next[saveId] ?? 0) + damage;
  return next;
}

/** True if picker may take loot during the owner-protection window. */
export function canPickupDuringOwnerLock(
  owner: GroundLootOwner,
  pickerSaveId: string,
  partyIdForSave: (saveId: string) => string | null,
): boolean {
  if (owner.kind === 'solo') return owner.saveId === pickerSaveId;
  const partyId = partyIdForSave(pickerSaveId);
  return partyId === owner.partyId;
}
