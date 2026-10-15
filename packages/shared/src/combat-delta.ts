import type { PlayerSave } from './types.js';

/**
 * Лёгкий стейт игрока после combat-тика.
 * Тяжёлые поля (inventory / questFlags / …) — только если изменились.
 * Клиент мержит в локальный save; полный сейв по HTTP не гоняем.
 */
export interface CombatPlayerDelta {
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  stamina?: number;
  staminaAt?: string | null;
  xp: number;
  level: number;
  adena?: number;
  karma?: number;
  skillCooldowns?: Record<string, string>;
  inventory?: string[];
  inventoryEnchants?: number[];
  equipment?: Record<string, string | null>;
  equipmentEnchants?: Record<string, number>;
  questFlags?: Record<string, boolean | number | string>;
  skillLevels?: Record<string, number>;
  mount?: PlayerSave['mount'];
  companion?: PlayerSave['companion'];
}

function sameStringArray(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameNumberArray(a: number[] | undefined, b: number[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameStringRecord(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === b) return true;
  const ak = a ? Object.keys(a) : [];
  const bk = b ? Object.keys(b) : [];
  if (ak.length !== bk.length) return false;
  for (const k of ak) if ((a?.[k] ?? '') !== (b?.[k] ?? '')) return false;
  return true;
}

function sameNumberRecord(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): boolean {
  if (a === b) return true;
  const ak = a ? Object.keys(a) : [];
  const bk = b ? Object.keys(b) : [];
  if (ak.length !== bk.length) return false;
  for (const k of ak) if ((a?.[k] ?? 0) !== (b?.[k] ?? 0)) return false;
  return true;
}

function sameEquip(
  a: Record<string, string | null>,
  b: Record<string, string | null>,
): boolean {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? null) !== (b[k] ?? null)) return false;
  return true;
}

function sameQuestFlags(
  a: Record<string, boolean | number | string>,
  b: Record<string, boolean | number | string>,
): boolean {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

/** Diff after ← before: всегда базовые поля, патчи — только при изменении. */
export function buildCombatPlayerDelta(before: PlayerSave, after: PlayerSave): CombatPlayerDelta {
  const delta: CombatPlayerDelta = {
    hp: after.hp,
    maxHp: after.maxHp,
    mp: after.mp,
    maxMp: after.maxMp,
    xp: after.xp,
    level: after.level,
    adena: after.adena,
    karma: after.karma,
  };
  if ((before.stamina ?? 0) !== (after.stamina ?? 0) || (before.staminaAt ?? null) !== (after.staminaAt ?? null)) {
    delta.stamina = after.stamina;
    delta.staminaAt = after.staminaAt ?? null;
  }

  if (!sameStringRecord(before.skillCooldowns, after.skillCooldowns)) {
    delta.skillCooldowns = after.skillCooldowns;
  }
  if (
    !sameStringArray(before.inventory, after.inventory) ||
    !sameNumberArray(before.inventoryEnchants, after.inventoryEnchants)
  ) {
    delta.inventory = after.inventory;
    delta.inventoryEnchants = after.inventoryEnchants;
  }
  if (!sameEquip(before.equipment, after.equipment)) {
    delta.equipment = after.equipment;
  }
  if (!sameNumberRecord(before.equipmentEnchants, after.equipmentEnchants)) {
    delta.equipmentEnchants = after.equipmentEnchants;
  }
  if (!sameQuestFlags(before.questFlags, after.questFlags)) {
    delta.questFlags = after.questFlags;
  }
  if (!sameNumberRecord(before.skillLevels, after.skillLevels)) {
    delta.skillLevels = after.skillLevels;
  }
  if (
    (before.mount?.ownedId ?? null) !== (after.mount?.ownedId ?? null) ||
    Boolean(before.mount?.mounted) !== Boolean(after.mount?.mounted) ||
    (before.mount?.chargeUntil ?? null) !== (after.mount?.chargeUntil ?? null)
  ) {
    delta.mount = after.mount ?? { ownedId: null, mounted: false, chargeUntil: null };
  }
  if (JSON.stringify(before.companion ?? null) !== JSON.stringify(after.companion ?? null)) {
    delta.companion = after.companion ?? null;
  }

  return delta;
}

/** Клиент: применить серверный стейт к локальному save. */
export function applyCombatPlayerDelta(save: PlayerSave, delta: CombatPlayerDelta): PlayerSave {
  return {
    ...save,
    hp: delta.hp,
    maxHp: delta.maxHp,
    mp: delta.mp ?? save.mp,
    maxMp: delta.maxMp ?? save.maxMp,
    stamina: delta.stamina ?? save.stamina,
    staminaAt: delta.staminaAt !== undefined ? delta.staminaAt : save.staminaAt,
    xp: delta.xp,
    level: delta.level,
    adena: delta.adena ?? save.adena,
    karma: delta.karma ?? save.karma,
    skillCooldowns: delta.skillCooldowns ?? save.skillCooldowns,
    inventory: delta.inventory ?? save.inventory,
    inventoryEnchants: delta.inventoryEnchants ?? save.inventoryEnchants,
    equipment: delta.equipment ?? save.equipment,
    equipmentEnchants: delta.equipmentEnchants ?? save.equipmentEnchants,
    questFlags: delta.questFlags ?? save.questFlags,
    skillLevels: delta.skillLevels ?? save.skillLevels,
    mount: delta.mount !== undefined ? delta.mount : save.mount,
    companion: delta.companion !== undefined ? delta.companion : save.companion,
  };
}
