/** Resolve mount presence visual fields from a save (server-side). */
import type { PlayerSave } from '@empery/shared';
import { getItem } from './items.js';

const CLOAK_VARIANT: Record<string, string> = {
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

export function presenceMountLook(save: PlayerSave): {
  mounted: boolean;
  mountId: string | null;
  armorType: 'light' | 'heavy' | 'robe';
  cloakVariant: string | null;
  weaponKind: 'melee' | 'bow' | 'staff' | null;
} {
  const ownedId =
    typeof save.mount?.ownedId === 'string' && save.mount.ownedId.length > 0
      ? save.mount.ownedId
      : null;
  const mounted = Boolean(ownedId && save.mount?.mounted);
  const body = save.equipment?.body ? getItem(save.equipment.body) : undefined;
  const bodyArmor = body?.armorType;
  const armorType: 'light' | 'heavy' | 'robe' =
    bodyArmor === 'heavy' || bodyArmor === 'light' || bodyArmor === 'robe'
      ? bodyArmor
      : save.profession === 'mystic'
        ? 'robe'
        : 'light';
  const cloakId = save.equipment?.cloak;
  const cloakVariant = cloakId ? (CLOAK_VARIANT[cloakId] ?? 'traveler') : null;
  const weapon = save.equipment?.weapon ? getItem(save.equipment.weapon) : undefined;
  let weaponKind: 'melee' | 'bow' | 'staff' | null = null;
  if (weapon) {
    if (weapon.weaponKind === 'bow') weaponKind = 'bow';
    else if (weapon.weaponKind === 'staff') weaponKind = 'staff';
    else weaponKind = 'melee';
  }
  return {
    mounted,
    mountId: ownedId,
    armorType,
    cloakVariant,
    weaponKind,
  };
}
