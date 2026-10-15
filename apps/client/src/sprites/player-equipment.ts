/** Предмет плаща → вариант процедурного спрайта на герое. */
export const CLOAK_VARIANT_BY_ITEM: Record<string, string> = {
  traveler_cloak: 'traveler',
  shadow_cloak: 'shadow',
  hunter_cloak: 'traveler',
  sergeant_cloak: 'traveler',
  depths_cloak: 'shadow',
  mothwing_cloak: 'shadow',
  daedric_shroud: 'daedric',
  weave_cloak: 'arcane',
  silk_mantle: 'arcane',
  starweave_cloak: 'arcane',
};

export const SHIELD_VARIANT_BY_ITEM: Record<string, string> = {
  wooden_buckler: 'wood',
  iron_kite_shield: 'iron',
  steel_heater_shield: 'steel',
  daedric_tower_shield: 'daedric',
  holy_crusader_shield: 'holy',
};

export function cloakVariantForItem(itemId: string | null | undefined): string | null {
  if (!itemId) return null;
  return CLOAK_VARIANT_BY_ITEM[itemId] ?? 'traveler';
}

export function shieldVariantForItem(itemId: string | null | undefined): string | null {
  if (!itemId) return null;
  return SHIELD_VARIANT_BY_ITEM[itemId] ?? 'iron';
}

export function playerAnimToCloakAnim(
  playerAnimKey: string,
  cloakVariant: string,
  facingRowName: string,
): string {
  const action = playerAnimBaseAction(playerAnimKey);
  if (action === 'walk' || action === 'idle') return `cloak-${cloakVariant}-${action}-${facingRowName}`;
  return `cloak-${cloakVariant}-${action}`;
}

export function playerAnimToShieldAnim(playerAnimKey: string, shieldVariant: string): string {
  return `shield-${shieldVariant}-${playerAnimBaseAction(playerAnimKey)}`;
}

export function playerAnimToWeaponAnim(
  playerAnimKey: string,
  weaponKind: 'melee' | 'bow' | 'staff',
  facingRow: string,
): string {
  const action = playerAnimBaseAction(playerAnimKey);
  if (action === 'walk' || action === 'idle') return `weapon-${weaponKind}-${action}-${facingRow}`;
  return `weapon-${weaponKind}-${action}`;
}

/** Infer overlay from equipped weapon + stats. */
export function weaponOverlayForSave(
  hasWeapon: boolean,
  rangedWeapon: boolean | undefined,
  rangedKind?: 'bow' | 'magic' | null,
): 'melee' | 'bow' | 'staff' | null {
  if (!hasWeapon) return null;
  if (rangedKind === 'magic') return 'staff';
  return rangedWeapon ? 'bow' : 'melee';
}

/** player-elf-walk-down-side → walk; player-human-f-idle → idle */
function playerAnimBaseAction(playerAnimKey: string): string {
  const action = playerAnimKey
    .replace(/^player-(?:human|elf|orc)(?:-f)?-/, '')
    .replace(/^player-/, '');
  if (action.startsWith('walk')) return 'walk';
  if (action.startsWith('idle')) return 'idle';
  if (action.startsWith('attack')) return 'attack';
  if (action.startsWith('hurt')) return 'hurt';
  return action;
}
