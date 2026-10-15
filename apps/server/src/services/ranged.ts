import type { PlayerSave } from '@empery/shared';
import {
  resolveAttackRange,
  canEquipBow,
  canEquipStaff,
  canEquipQuiver,
  getEquipmentEnchant,
} from '@empery/shared';
import { getItem } from './items.js';
import { computeSkillBonuses, getSkill } from './skills.js';
import { removeInventoryIndexFromSave, appendItemsToSave } from './inventory-bag.js';

export function equippedWeapon(save: PlayerSave) {
  const id = save.equipment.weapon;
  return id ? getItem(id) : undefined;
}

export function isBowEquipped(save: PlayerSave): boolean {
  return equippedWeapon(save)?.weaponKind === 'bow';
}

export function isStaffEquipped(save: PlayerSave): boolean {
  return equippedWeapon(save)?.weaponKind === 'staff';
}

/** Лук или посох — дальняя атака. */
export function isRangedWeaponEquipped(save: PlayerSave): boolean {
  const kind = equippedWeapon(save)?.weaponKind;
  return kind === 'bow' || kind === 'staff';
}

export function attackRangeForSave(save: PlayerSave, skillId?: string): number {
  const weapon = equippedWeapon(save);
  const skill = skillId ? getSkill(skillId) : undefined;
  const passives = computeSkillBonuses(save).attackRange;
  let enchantRange = 0;
  if (
    (weapon?.weaponKind === 'bow' || weapon?.weaponKind === 'staff') &&
    save.equipment.weapon
  ) {
    const lvl = getEquipmentEnchant(save.equipmentEnchants, 'weapon');
    enchantRange = Math.max(0, lvl) * 4;
  }
  return resolveAttackRange({
    weaponAttackRange: weapon?.attackRange,
    skillAttackRange: skill?.attackRange,
    rangeBonus: passives + enchantRange,
  });
}

export type RangedReadyError = 'NO_BOW' | 'NO_AMMO';

/** Лук + стрела в колчане обязательны для ranged-выстрела. */
export function requireRangedReady(save: PlayerSave): { ok: true } | { ok: false; error: RangedReadyError } {
  if (!isBowEquipped(save)) return { ok: false, error: 'NO_BOW' };
  if (!save.equipment.quiver) return { ok: false, error: 'NO_AMMO' };
  const ammo = getItem(save.equipment.quiver);
  if (!ammo || ammo.slot !== 'quiver') return { ok: false, error: 'NO_AMMO' };
  return { ok: true };
}

/**
 * Снимает 1 стрелу того же id, что в колчане: сначала из инвентаря, иначе unequip.
 */
export function consumeQuiverAmmo(save: PlayerSave): { save: PlayerSave; ok: boolean } {
  const ammoId = save.equipment.quiver;
  if (!ammoId) return { save, ok: false };

  const invIdx = save.inventory.indexOf(ammoId);
  if (invIdx >= 0) {
    const next = removeInventoryIndexFromSave(save, invIdx);
    if (!next) return { save, ok: false };
    return { save: next, ok: true };
  }

  const equipment = { ...save.equipment, quiver: null };
  const equipmentEnchants = { ...save.equipmentEnchants };
  delete equipmentEnchants.quiver;
  return {
    save: { ...save, equipment, equipmentEnchants },
    ok: true,
  };
}

export function rangedRejectMessage(code: RangedReadyError): string {
  if (code === 'NO_BOW') return 'Нужен лук';
  return 'Нет стрел';
}

/** Стартовый набор лучника после create. */
export function applyArcherStarterGear(save: PlayerSave): PlayerSave {
  if (save.profession !== 'archer') return save;
  const arrows = Array.from({ length: 19 }, () => 'wooden_arrow');
  const withArrows = appendItemsToSave(
    {
      ...save,
      inventory: [],
      inventoryEnchants: [],
      inventoryEntries: [],
      equipment: {
        ...save.equipment,
        weapon: 'short_bow',
        weapon2: null,
        shield: null,
        quiver: 'wooden_arrow',
      },
      equipmentEnchants: {
        ...save.equipmentEnchants,
        weapon: 0,
        quiver: 0,
      },
    },
    arrows,
  );
  return withArrows;
}

/** Стартовый набор мистика/саппорта: посох + роба. */
export function applyMysticStarterGear(save: PlayerSave): PlayerSave {
  if (save.profession !== 'mystic' && save.profession !== 'support') return save;
  return {
    ...save,
    equipment: {
      ...save.equipment,
      weapon: 'apprentice_staff',
      weapon2: null,
      shield: null,
      quiver: null,
      body: 'novice_robe',
    },
    inventory: [],
    inventoryEnchants: [],
    inventoryEntries: [],
    equipmentEnchants: {
      ...save.equipmentEnchants,
      weapon: 0,
      body: 0,
    },
  };
}

export function assertCanEquipWeapon(save: PlayerSave, itemId: string): boolean {
  const item = getItem(itemId);
  if (!item || item.slot !== 'weapon') return false;
  if (item.weaponKind === 'bow') return canEquipBow(save.profession);
  if (item.weaponKind === 'staff') return canEquipStaff(save.profession);
  return true;
}

export function assertCanEquipQuiverItem(save: PlayerSave, itemId: string): boolean {
  const item = getItem(itemId);
  if (!item || item.slot !== 'quiver') return false;
  return canEquipQuiver(save.profession);
}

/** Стоимость MP за автоатаку мистика (без активного скилла). */
export function mysticBasicAttackMpCost(save: PlayerSave): number {
  if (save.profession !== 'mystic') return 0;
  return Math.max(3, 3 + Math.floor(Math.max(1, save.level) / 8));
}
