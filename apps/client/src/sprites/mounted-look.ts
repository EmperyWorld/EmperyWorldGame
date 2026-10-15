import type { PlayerSave, PlayerStats, ItemDefinition } from '../api.js';
import type { MultiplayerPlayerPresence } from '../api.js';
import { cloakVariantForItem, weaponOverlayForSave } from './player-equipment.js';
import type { SpriteFacingRow } from './facing4.js';

export type MountVisual = 'bay' | 'ash' | 'pale' | 'prism';
export type ArmorLook = 'light' | 'heavy' | 'robe';
export type MountedWeaponKind = 'melee' | 'bow' | 'staff';

export interface MountedLook {
  mountId: string;
  visual: MountVisual;
  race: string;
  gender: 'male' | 'female';
  profession: string;
  armorType: ArmorLook;
  cloakVariant: string | null;
  weaponKind: MountedWeaponKind | null;
}

const VISUAL_BY_MOUNT: Record<string, MountVisual> = {
  field_horse: 'bay',
  ash_steed: 'ash',
  pale_courser: 'pale',
  prism_stallion: 'prism',
};

export function visualForMountId(mountId: string | null | undefined): MountVisual {
  if (!mountId) return 'bay';
  return VISUAL_BY_MOUNT[mountId] ?? 'bay';
}

export function mountedLookId(look: MountedLook): string {
  return [
    look.visual,
    look.race,
    look.gender === 'female' ? 'f' : 'm',
    look.profession.slice(0, 4),
    look.armorType[0],
    look.cloakVariant ?? 'n',
    look.weaponKind ?? 'n',
  ].join('_');
}

/** @deprecated use mountAtlasTextureKey — all mounts share one atlas. */
export function mountedTextureKey(_look: MountedLook, _facing: SpriteFacingRow): string {
  return 'mount-atlas-v1';
}

export function mountedAnimKey(
  look: MountedLook,
  action: 'idle' | 'walk' | 'attack',
  facing: SpriteFacingRow,
): string {
  return `mnt-${mountedLookId(look)}-${action}-${facing}`;
}

function normalizeRace(race: string): string {
  if (race === 'elf' || race === 'orc') return race;
  return 'human';
}

function armorFromBody(
  bodyItem: ItemDefinition | undefined,
  profession: string,
): ArmorLook {
  const t = bodyItem?.armorType;
  if (t === 'heavy' || t === 'light' || t === 'robe') return t;
  return profession === 'mystic' ? 'robe' : 'light';
}

export function resolveMountedLook(input: {
  race: string;
  gender?: string | null;
  profession: string;
  mountId: string | null | undefined;
  bodyItemId?: string | null;
  cloakItemId?: string | null;
  hasWeapon?: boolean;
  rangedWeapon?: boolean;
  rangedKind?: 'bow' | 'magic' | null;
  armorType?: ArmorLook | string | null;
  cloakVariant?: string | null;
  weaponKind?: MountedWeaponKind | string | null;
  items?: ItemDefinition[];
}): MountedLook {
  const race = normalizeRace(input.race);
  const gender = input.gender === 'female' ? 'female' : 'male';
  const profession = input.profession || 'warrior';
  const mountId = input.mountId && input.mountId.length > 0 ? input.mountId : 'field_horse';

  let armorType: ArmorLook =
    input.armorType === 'heavy' || input.armorType === 'light' || input.armorType === 'robe'
      ? input.armorType
      : 'light';
  if (!input.armorType && input.items) {
    const body = input.bodyItemId
      ? input.items.find((i) => i.id === input.bodyItemId)
      : undefined;
    armorType = armorFromBody(body, profession);
  } else if (!input.armorType) {
    armorType = profession === 'mystic' ? 'robe' : 'light';
  }

  const cloakVariant =
    input.cloakVariant !== undefined
      ? input.cloakVariant
      : cloakVariantForItem(input.cloakItemId);

  let weaponKind: MountedWeaponKind | null = null;
  if (input.weaponKind === 'melee' || input.weaponKind === 'bow' || input.weaponKind === 'staff') {
    weaponKind = input.weaponKind;
  } else if (input.weaponKind === null) {
    weaponKind = null;
  } else {
    weaponKind = weaponOverlayForSave(
      Boolean(input.hasWeapon),
      input.rangedWeapon,
      input.rangedKind,
    );
  }

  return {
    mountId,
    visual: visualForMountId(mountId),
    race,
    gender,
    profession,
    armorType,
    cloakVariant,
    weaponKind,
  };
}

export function mountedLookFromSave(
  save: PlayerSave,
  stats?: PlayerStats,
  items?: ItemDefinition[],
): MountedLook {
  return resolveMountedLook({
    race: save.race,
    gender: save.gender,
    profession: save.profession,
    mountId: save.mount?.ownedId,
    bodyItemId: save.equipment?.body,
    cloakItemId: save.equipment?.cloak,
    hasWeapon: Boolean(save.equipment?.weapon),
    rangedWeapon: stats?.rangedWeapon,
    rangedKind: stats?.rangedKind,
    armorType: stats?.bodyArmorType,
    items,
  });
}

export function mountedLookFromPresence(presence: MultiplayerPlayerPresence): MountedLook {
  return resolveMountedLook({
    race: presence.race,
    gender: presence.gender,
    profession: presence.profession,
    mountId: presence.mountId ?? 'field_horse',
    armorType: presence.armorType,
    cloakVariant: presence.cloakVariant ?? null,
    weaponKind: presence.weaponKind ?? null,
  });
}

export function looksEqual(a: MountedLook, b: MountedLook): boolean {
  return mountedLookId(a) === mountedLookId(b);
}
