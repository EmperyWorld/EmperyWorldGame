/** Все слоты экипировки (порядок = UI doll). */
export const EQUIPMENT_SLOTS = [
  'weapon',
  'weapon2',
  'shield',
  'quiver',
  'head',
  'body',
  'legs',
  'gloves',
  'cloak',
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const EMPTY_EQUIPMENT: Record<EquipmentSlot, string | null> = {
  weapon: null,
  weapon2: null,
  shield: null,
  quiver: null,
  head: null,
  body: null,
  legs: null,
  gloves: null,
  cloak: null,
};

/** Слоты оружия (основной + второй клинок дуалиста). */
export const WEAPON_SLOTS = ['weapon', 'weapon2'] as const;
export type WeaponSlot = (typeof WEAPON_SLOTS)[number];

export function canEquipShield(profession: string | undefined): boolean {
  return profession === 'warrior';
}

/** Луки — только лучник. */
export function canEquipBow(profession: string | undefined): boolean {
  return profession === 'archer';
}

/** Посохи — мистик и саппорт. */
export function canEquipStaff(profession: string | undefined): boolean {
  return profession === 'mystic' || profession === 'support';
}

/** Стрелы в колчан — только лучник. */
export function canEquipQuiver(profession: string | undefined): boolean {
  return profession === 'archer';
}

export type ArmorType = 'light' | 'heavy' | 'robe';

/**
 * Роба — мистик и саппорт.
 * Они не носят light/heavy (только робу на бронных слотах).
 */
export function canEquipArmorType(
  profession: string | undefined,
  armorType: ArmorType | string | undefined,
): boolean {
  if (!armorType) return true;
  const robeCaster = profession === 'mystic' || profession === 'support';
  if (armorType === 'robe') return robeCaster;
  if (robeCaster) return false;
  return armorType === 'light' || armorType === 'heavy';
}
