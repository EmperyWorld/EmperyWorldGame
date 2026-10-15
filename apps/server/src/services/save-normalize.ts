import type { PlayerSave } from '@empery/shared';
import {
  EMPTY_EQUIPMENT,
  isDeathKind,
  canEquipShield,
  canEquipBow,
  canEquipStaff,
  canEquipQuiver,
  canEquipArmorType,
  normalizeGender,
  normalizeInventoryEnchants,
  reconcileInventoryEntries,
} from '@empery/shared';
import { starterSkillsFor } from './professions.js';
import { normalizeSkillHotbar, syncSkillProgression, stripIneligibleSkills } from './skills.js';
import { applyStatsToSave } from './stats.js';
import { getItem } from './items.js';
import { normalizeRadioState, applyRadioLifecycle } from './radio.js';
import { normalizeMountState } from './mounts.js';
import { normalizeCompanionState } from './companion.js';
import { normalizePlayerStamina } from './player-stamina.js';
import { normalizeHousing } from './housing.js';

const SURVIVAL_CONDITION_IDS = new Set([
  'hungry',
  'dehydrated',
  'hypothermia',
  'hyperthermia',
  'fatigued',
  'infection',
  'food_poisoning',
  'exhaustion_injury',
  'frostbite',
  'heatstroke',
]);

function clampSurvival(value: unknown, fallback: number, min = 0, max = 100): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

/** Legacy characters enter the system healthy; malformed state is never trusted. */
function normalizeSurvival(raw: PlayerSave['survival']): NonNullable<PlayerSave['survival']> {
  const now = new Date().toISOString();
  const source: Partial<NonNullable<PlayerSave['survival']>> =
    raw && typeof raw === 'object' ? raw : {};
  const conditions = Array.isArray(source.conditions)
    ? source.conditions
        .filter((entry): entry is NonNullable<PlayerSave['survival']>['conditions'][number] =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              SURVIVAL_CONDITION_IDS.has((entry as { id?: string }).id ?? '') &&
              ['normal', 'deficit', 'critical'].includes((entry as { severity?: string }).severity ?? '') &&
              ['deficit', 'illness', 'injury'].includes((entry as { kind?: string }).kind ?? ''),
          ),
        )
        .slice(0, 8)
        .map((entry) => ({
          id: entry.id,
          severity: entry.severity,
          kind: entry.kind,
          startedAt: typeof entry.startedAt === 'string' ? entry.startedAt : now,
          stage:
            entry.stage === 'mild' || entry.stage === 'acute'
              ? entry.stage
              : entry.kind === 'illness'
                ? ('mild' as const)
                : undefined,
        }))
    : [];
  const events = Array.isArray(source.events)
    ? source.events
        .filter(
          (entry): entry is NonNullable<PlayerSave['survival']>['events'][number] =>
            Boolean(
              entry &&
                typeof entry === 'object' &&
                typeof (entry as { message?: unknown }).message === 'string' &&
                ['warning', 'condition', 'treatment', 'consumed', 'weather'].includes(
                  (entry as { type?: string }).type ?? '',
                ),
            ),
        )
        .slice(-12)
        .map((entry) => ({
          ...entry,
          at: typeof entry.at === 'string' ? entry.at : now,
          message: entry.message.slice(0, 180),
        }))
    : [];
  return {
    version: 1,
    satiety: clampSurvival(source.satiety, 100),
    hydration: clampSurvival(source.hydration, 100),
    bodyTemperature: clampSurvival(source.bodyTemperature, 37, 30, 43),
    fatigue: clampSurvival(source.fatigue, 0),
    wetness: clampSurvival(source.wetness, 0),
    freshnessAt:
      source.freshnessAt && typeof source.freshnessAt === 'object'
        ? Object.fromEntries(
            Object.entries(source.freshnessAt)
              .filter(([, value]) => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
              .slice(0, 64),
          )
        : {},
    conditions,
    events,
    lastSimulatedAt:
      typeof source.lastSimulatedAt === 'string' && !Number.isNaN(Date.parse(source.lastSimulatedAt))
        ? source.lastSimulatedAt
        : now,
    restingUntil: typeof source.restingUntil === 'string' ? source.restingUntil : null,
    doomGraceUntil:
      typeof source.doomGraceUntil === 'string' && !Number.isNaN(Date.parse(source.doomGraceUntil))
        ? source.doomGraceUntil
        : null,
  };
}

function normalizeRadioFromRaw(raw: PlayerSave['radio']): NonNullable<PlayerSave['radio']> {
  return normalizeRadioState(raw);
}

function normalizeMountFromRaw(raw: PlayerSave['mount']): NonNullable<PlayerSave['mount']> {
  return normalizeMountState(raw);
}

function normalizeCompanionFromRaw(
  raw: PlayerSave['companion'],
): PlayerSave['companion'] {
  return normalizeCompanionState(raw);
}

const DEFAULT_EQUIPMENT: PlayerSave['equipment'] = {
  ...EMPTY_EQUIPMENT,
  weapon: 'rusty_sword',
};

/**
 * Раньше вырезали из рюкзака ВСЕ копии надетого ID — из‑за этого нельзя было
 * иметь два одинаковых клинка (один надет, второй в сумке / во 2-м слоте).
 * Инвентарь хранит экземпляры по типу; экипировка — отдельные слоты.
 * Здесь ничего не вырезаем.
 */
function stripEquippedFromInventory(
  inventory: string[],
  _equipment: PlayerSave['equipment'],
): string[] {
  return inventory;
}

function sanitizeWeapon2(
  equipment: PlayerSave['equipment'],
  inventory: string[],
  equipmentEnchants: Record<string, number>,
  inventoryEnchants: number[],
  skillLevels: Record<string, number>,
): { equipment: PlayerSave['equipment']; inventory: string[]; equipmentEnchants: Record<string, number>; inventoryEnchants: number[] } {
  const offId = equipment.weapon2;
  if (!offId) {
    return { equipment, inventory, equipmentEnchants, inventoryEnchants };
  }
  const off = getItem(offId);
  const main = equipment.weapon ? getItem(equipment.weapon) : null;
  const dualLearned = (skillLevels.mad_dualist ?? 0) > 0;
  const invalid =
    !dualLearned ||
    !off ||
    off.slot !== 'weapon' ||
    off.weaponWeight !== 'light' ||
    !main ||
    main.weaponWeight !== 'light';
  if (!invalid) {
    return { equipment, inventory, equipmentEnchants, inventoryEnchants };
  }
  const nextEq = { ...equipment, weapon2: null };
  const nextInv = [...inventory, offId];
  const nextInvEnc = [...inventoryEnchants, equipmentEnchants.weapon2 ?? 0];
  const nextEqEnc = { ...equipmentEnchants };
  delete nextEqEnc.weapon2;
  return {
    equipment: nextEq,
    inventory: nextInv,
    equipmentEnchants: nextEqEnc,
    inventoryEnchants: nextInvEnc,
  };
}

function sanitizeShield(
  equipment: PlayerSave['equipment'],
  inventory: string[],
  equipmentEnchants: Record<string, number>,
  inventoryEnchants: number[],
  profession: string,
): {
  equipment: PlayerSave['equipment'];
  inventory: string[];
  equipmentEnchants: Record<string, number>;
  inventoryEnchants: number[];
} {
  const shieldId = equipment.shield;
  if (!shieldId) {
    return { equipment, inventory, equipmentEnchants, inventoryEnchants };
  }

  const item = getItem(shieldId);
  const invalid = !canEquipShield(profession) || !item || item.slot !== 'shield';
  let nextEq = { ...equipment };
  let nextInv = [...inventory];
  let nextInvEnc = [...inventoryEnchants];
  const nextEqEnc = { ...equipmentEnchants };

  const takeOff = (slot: string): void => {
    const id = nextEq[slot];
    if (!id) return;
    nextInv.push(id);
    nextInvEnc.push(nextEqEnc[slot] ?? 0);
    nextEq = { ...nextEq, [slot]: null };
    delete nextEqEnc[slot];
  };

  if (invalid) takeOff('shield');
  // Щит и второй клинок вместе не живут
  if (nextEq.shield && nextEq.weapon2) takeOff('weapon2');

  return {
    equipment: nextEq,
    inventory: nextInv,
    equipmentEnchants: nextEqEnc,
    inventoryEnchants: nextInvEnc,
  };
}

function sanitizeBowAndQuiver(
  equipment: PlayerSave['equipment'],
  inventory: string[],
  equipmentEnchants: Record<string, number>,
  inventoryEnchants: number[],
  profession: string,
): {
  equipment: PlayerSave['equipment'];
  inventory: string[];
  equipmentEnchants: Record<string, number>;
  inventoryEnchants: number[];
} {
  let nextEq = { ...equipment };
  let nextInv = [...inventory];
  let nextInvEnc = [...inventoryEnchants];
  const nextEqEnc = { ...equipmentEnchants };

  const takeOff = (slot: string): void => {
    const id = nextEq[slot];
    if (!id) return;
    nextInv.push(id);
    nextInvEnc.push(nextEqEnc[slot] ?? 0);
    nextEq = { ...nextEq, [slot]: null };
    delete nextEqEnc[slot];
  };

  const weaponId = nextEq.weapon;
  if (weaponId) {
    const weapon = getItem(weaponId);
    if (weapon?.weaponKind === 'bow' && !canEquipBow(profession)) {
      takeOff('weapon');
    }
    if (weapon?.weaponKind === 'staff' && !canEquipStaff(profession)) {
      takeOff('weapon');
    }
  }

  const quiverId = nextEq.quiver;
  if (quiverId) {
    const ammo = getItem(quiverId);
    const invalid = !canEquipQuiver(profession) || !ammo || ammo.slot !== 'quiver';
    if (invalid) takeOff('quiver');
  }

  if (nextEq.weapon) {
    const w = getItem(nextEq.weapon);
    if (w?.weaponKind === 'bow' || w?.weaponKind === 'staff') {
      takeOff('shield');
      takeOff('weapon2');
    }
  }

  for (const slot of ['head', 'body', 'legs', 'gloves'] as const) {
    const id = nextEq[slot];
    if (!id) continue;
    const item = getItem(id);
    if (item && !canEquipArmorType(profession, item.armorType)) {
      takeOff(slot);
    }
  }

  return {
    equipment: nextEq,
    inventory: nextInv,
    equipmentEnchants: nextEqEnc,
    inventoryEnchants: nextInvEnc,
  };
}

export function normalizeSave(raw: PlayerSave): PlayerSave {
  const profession = raw.profession ?? 'warrior';
  const hasSkills = raw.skillLevels && Object.keys(raw.skillLevels).length > 0;
  const skillLevels = hasSkills
    ? raw.skillLevels
    : starterSkillsFor(profession, raw.race);
  const skillCooldowns = raw.skillCooldowns ?? {};
  const equipment = { ...DEFAULT_EQUIPMENT, ...raw.equipment };
  if (equipment.weapon2 === undefined) equipment.weapon2 = null;
  if (equipment.shield === undefined) equipment.shield = null;
  if (equipment.quiver === undefined) equipment.quiver = null;

  let inventory: string[];
  if (raw.inventory === undefined) {
    // Стартовое оружие уже в equipment — в сумку дубликат не кладём
    inventory = [];
  } else {
    inventory = [...raw.inventory];
  }

  let inventoryEnchants = normalizeInventoryEnchants(inventory, raw.inventoryEnchants);
  let equipmentEnchants = { ...raw.equipmentEnchants };

  // Сначала чистим устаревшие/чужие скиллы, потом прогрессию (дуалист и т.п.)
  const pruned = stripIneligibleSkills({
    ...raw,
    profession,
    race: raw.race,
    skillLevels,
    skillCooldowns,
  });

  const progressed = syncSkillProgression({
    ...pruned,
    profession,
    skillLevels: pruned.skillLevels,
    skillCooldowns: pruned.skillCooldowns,
    adena: raw.adena ?? 0,
    inventory,
    inventoryEnchants,
    equipmentEnchants,
    equipment,
  });

  const cleaned = sanitizeWeapon2(
    progressed.equipment,
    progressed.inventory,
    progressed.equipmentEnchants ?? {},
    normalizeInventoryEnchants(progressed.inventory, progressed.inventoryEnchants),
    progressed.skillLevels,
  );

  const withShield = sanitizeShield(
    cleaned.equipment,
    cleaned.inventory,
    cleaned.equipmentEnchants,
    cleaned.inventoryEnchants,
    profession,
  );

  const withBow = sanitizeBowAndQuiver(
    withShield.equipment,
    withShield.inventory,
    withShield.equipmentEnchants,
    withShield.inventoryEnchants,
    profession,
  );

  inventory = stripEquippedFromInventory(withBow.inventory, withBow.equipment);
  inventoryEnchants = normalizeInventoryEnchants(inventory, withBow.inventoryEnchants);
  if (inventory.length === 0 && !Object.values(withBow.equipment).some(Boolean)) {
    inventory = ['rusty_sword'];
    withBow.equipment.weapon = 'rusty_sword';
    inventoryEnchants = [0];
  }

  const inventoryEntries = reconcileInventoryEntries(
    inventory,
    inventoryEnchants,
    raw.inventoryEntries ?? progressed.inventoryEntries,
  );

  const stam = normalizePlayerStamina(raw);
  const withEquip: PlayerSave = {
    ...progressed,
    gender: normalizeGender(raw.gender),
    inventory,
    inventoryEnchants,
    inventoryEntries,
    equipmentEnchants: withBow.equipmentEnchants,
    equipment: withBow.equipment,
    karma: Math.max(0, Math.floor(raw.karma ?? progressed.karma ?? 0)),
    pkCount: Math.max(0, Math.floor(raw.pkCount ?? progressed.pkCount ?? 0)),
    pvpCount: Math.max(0, Math.floor(raw.pvpCount ?? progressed.pvpCount ?? 0)),
    radio: normalizeRadioFromRaw(raw.radio),
    mount: normalizeMountFromRaw(raw.mount),
    companion: normalizeCompanionFromRaw(raw.companion),
    stamina: stam.stamina,
    staminaAt: stam.staminaAt,
    worldX: typeof raw.worldX === 'number' && Number.isFinite(raw.worldX) ? raw.worldX : undefined,
    worldY: typeof raw.worldY === 'number' && Number.isFinite(raw.worldY) ? raw.worldY : undefined,
    lastDeathCause:
      typeof raw.lastDeathCause === 'string' && raw.lastDeathCause.trim()
        ? raw.lastDeathCause.trim().slice(0, 200)
        : raw.lastDeathCause === null
          ? null
          : undefined,
    lastDeathKind: isDeathKind(raw.lastDeathKind)
      ? raw.lastDeathKind
      : raw.lastDeathKind === null
        ? null
        : undefined,
    survival: normalizeSurvival(raw.survival),
    housing: normalizeHousing(raw.housing),
  };

  const withRadio = applyRadioLifecycle(withEquip);

  return applyStatsToSave({
    ...withRadio,
    skillHotbar: normalizeSkillHotbar(withRadio),
  });
}

/** Поля, которые клиент может патчить без риска затереть инвентарь */
export function applySavePatch(existing: PlayerSave, patch: Partial<PlayerSave>): PlayerSave {
  const next: PlayerSave = { ...existing };

  if (patch.skillHotbar !== undefined) {
    next.skillHotbar = normalizeSkillHotbar({ ...next, skillHotbar: patch.skillHotbar });
  }

  return applyStatsToSave(next);
}
