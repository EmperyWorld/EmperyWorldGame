import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { InventoryEntry, PlayerSave } from '@empery/shared';
import {
  reconcileInventoryEntries,
  removeEntryAtFlattenedIndex,
  withInventoryEntries,
  addEntry,
  newInventoryEntryId,
} from '@empery/shared';
import { contentRoot } from './paths.js';
import { getItem } from './items.js';
import { applyStatsToSave } from './stats.js';
import { getLocation } from './locations.js';
import { snapshotEntryFreshness, thawFridgeEntry, applyRestRecovery } from './survival.js';

export type HousingStorageKind = 'materials' | 'gear' | 'food';
export type HousingTier = 1 | 2 | 3;

export interface ApartmentTierDef {
  tier: HousingTier;
  name: string;
  price: number;
  materials: number;
  gear: number;
  food: number;
  rooms: number;
}

interface HousingConfig {
  tiers: ApartmentTierDef[];
  apartmentLocationId: string;
  stewardNpcId: string;
}

export interface HousingActionResult {
  save: PlayerSave;
  ok: boolean;
  message: string;
}

const GEAR_SLOTS = new Set([
  'weapon',
  'weapon2',
  'shield',
  'quiver',
  'head',
  'body',
  'legs',
  'gloves',
  'cloak',
]);

/** Keep on the character — cannot stash in apartment storages. */
const HOUSING_BLOCKED_ITEMS = new Set(['field_radio']);

let configCache: HousingConfig | null = null;

export function loadHousingConfig(force = false): HousingConfig {
  if (configCache && !force) return configCache;
  const path = join(contentRoot, 'housing/apartment-tiers.yaml');
  const raw = existsSync(path)
    ? (parseYaml(readFileSync(path, 'utf8')) as Partial<HousingConfig>)
    : {};
  const tiers = (raw.tiers ?? [])
    .map((t) => ({
      tier: Number(t.tier) as HousingTier,
      name: String(t.name ?? `Tier ${t.tier}`),
      price: Math.max(0, Math.floor(Number(t.price) || 0)),
      materials: Math.max(1, Math.floor(Number(t.materials) || 20)),
      gear: Math.max(1, Math.floor(Number(t.gear) || 10)),
      food: Math.max(1, Math.floor(Number(t.food) || 10)),
      rooms: Math.max(1, Math.min(3, Math.floor(Number(t.rooms) || 1))),
    }))
    .filter((t) => t.tier === 1 || t.tier === 2 || t.tier === 3);
  configCache = {
    tiers: tiers.length
      ? tiers
      : [
          { tier: 1, name: 'Однокомнатная', price: 25000, materials: 40, gear: 20, food: 24, rooms: 1 },
          { tier: 2, name: 'Двухкомнатная', price: 75000, materials: 70, gear: 40, food: 40, rooms: 2 },
          { tier: 3, name: 'Трёхкомнатная', price: 180000, materials: 120, gear: 70, food: 70, rooms: 3 },
        ],
    apartmentLocationId: String(raw.apartmentLocationId ?? 'haven_apartment'),
    stewardNpcId: String(raw.stewardNpcId ?? 'town_steward'),
  };
  return configCache;
}

export function apartmentLocationId(): string {
  return loadHousingConfig().apartmentLocationId;
}

export function getApartmentTier(tier: number): ApartmentTierDef | undefined {
  return loadHousingConfig().tiers.find((t) => t.tier === tier);
}

export function emptyHousingStorages(): NonNullable<PlayerSave['housing']>['storages'] {
  return { materials: [], gear: [], food: [] };
}

export function normalizeHousing(raw: PlayerSave['housing']): PlayerSave['housing'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const tier = Number(raw.tier);
  if (tier !== 1 && tier !== 2 && tier !== 3) return undefined;
  const storages = raw.storages && typeof raw.storages === 'object' ? raw.storages : emptyHousingStorages();
  const clean = (list: unknown): InventoryEntry[] => {
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (e): e is InventoryEntry =>
          Boolean(
            e &&
              typeof e === 'object' &&
              typeof (e as InventoryEntry).id === 'string' &&
              typeof (e as InventoryEntry).itemId === 'string' &&
              Number((e as InventoryEntry).quantity) >= 1,
          ),
      )
      .map((e) => ({
        id: e.id,
        itemId: e.itemId,
        quantity: Math.max(1, Math.floor(e.quantity || 1)),
        enchant: typeof e.enchant === 'number' ? e.enchant : undefined,
        acquiredAt: typeof e.acquiredAt === 'string' ? e.acquiredAt : undefined,
        freshness: typeof e.freshness === 'number' ? e.freshness : undefined,
        temperature: e.temperature,
        waterQuality: e.waterQuality,
      }))
      .slice(0, 200);
  };
  return {
    tier,
    purchasedAt:
      typeof raw.purchasedAt === 'string' && !Number.isNaN(Date.parse(raw.purchasedAt))
        ? raw.purchasedAt
        : new Date().toISOString(),
    storages: {
      materials: clean(storages.materials),
      gear: clean(storages.gear),
      food: clean(storages.food),
    },
  };
}

function slotCount(entries: InventoryEntry[]): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.floor(e.quantity || 1)), 0);
}

function capacityFor(tier: ApartmentTierDef, kind: HousingStorageKind): number {
  return tier[kind];
}

export function itemAllowedInStorage(itemId: string, kind: HousingStorageKind): boolean {
  const item = getItem(itemId);
  if (!item) return false;
  if (HOUSING_BLOCKED_ITEMS.has(itemId)) return false;
  if (kind === 'materials') {
    return item.slot === 'material';
  }
  if (kind === 'gear') {
    return GEAR_SLOTS.has(item.slot);
  }
  const s = item.survival;
  return (
    item.slot === 'consumable' &&
    Boolean(s && (typeof s.nutrition === 'number' || typeof s.hydration === 'number'))
  );
}

export function purchaseOrUpgradeApartment(save: PlayerSave, tierRaw: number): HousingActionResult {
  const tierDef = getApartmentTier(tierRaw);
  if (!tierDef) {
    return { save, ok: false, message: 'Нет такой планировки.' };
  }
  const current = save.housing;
  if (current && current.tier === tierDef.tier) {
    return { save, ok: false, message: 'У тебя уже эта планировка.' };
  }
  if (current && current.tier > tierDef.tier) {
    return { save, ok: false, message: 'Нельзя уменьшить квартиру.' };
  }

  const paid = current ? getApartmentTier(current.tier)?.price ?? 0 : 0;
  const cost = Math.max(0, tierDef.price - paid);
  const adena = save.adena ?? 0;
  if (adena < cost) {
    return {
      save,
      ok: false,
      message: `Не хватает adena. Нужно ${cost}, у тебя ${adena}.`,
    };
  }

  const next: PlayerSave = applyStatsToSave({
    ...save,
    adena: adena - cost,
    housing: {
      tier: tierDef.tier,
      purchasedAt: current?.purchasedAt ?? new Date().toISOString(),
      storages: current?.storages ?? emptyHousingStorages(),
    },
  });

  const msg = current
    ? `Квартира расширена до «${tierDef.name}» (−${cost} adena).`
    : `Куплена «${tierDef.name}» (−${cost} adena). Дворецкий проводит внутрь.`;
  return { save: next, ok: true, message: msg };
}

export function enterApartment(save: PlayerSave): HousingActionResult & { locationId?: string } {
  if (!save.housing) {
    return { save, ok: false, message: 'Сначала купи квартиру у дворецкого.' };
  }
  const locId = apartmentLocationId();
  const loc = getLocation(locId);
  if (!loc) {
    return { save, ok: false, message: 'Квартира временно недоступна.' };
  }
  const next: PlayerSave = {
    ...save,
    location: locId,
    worldX: Math.round(loc.spawn.x),
    worldY: Math.round(loc.spawn.y),
  };
  return {
    save: applyStatsToSave(next),
    ok: true,
    message: 'Добро пожаловать домой.',
    locationId: locId,
  };
}

function peekFlatEntry(entries: InventoryEntry[], flatIndex: number): InventoryEntry | null {
  let cursor = 0;
  for (const entry of entries) {
    const qty = Math.max(1, Math.floor(entry.quantity || 1));
    if (flatIndex < cursor + qty) {
      return {
        ...entry,
        id: newInventoryEntryId(),
        quantity: 1,
      };
    }
    cursor += qty;
  }
  return null;
}

export function depositToHousing(
  save: PlayerSave,
  kind: HousingStorageKind,
  inventoryIndex: number,
): HousingActionResult {
  if (!save.housing) {
    return { save, ok: false, message: 'Нет квартиры.' };
  }
  const tier = getApartmentTier(save.housing.tier);
  if (!tier) return { save, ok: false, message: 'Неизвестный тариф квартиры.' };

  const bag = reconcileInventoryEntries(save.inventory, save.inventoryEnchants, save.inventoryEntries);
  let taken = peekFlatEntry(bag, inventoryIndex);
  if (!taken) {
    return { save, ok: false, message: 'Предмет не найден в рюкзаке.' };
  }
  if (!itemAllowedInStorage(taken.itemId, kind)) {
    return { save, ok: false, message: 'Сюда это класть нельзя.' };
  }

  const storage = [...save.housing.storages[kind]];
  if (slotCount(storage) + 1 > capacityFor(tier, kind)) {
    return { save, ok: false, message: 'Хранилище заполнено.' };
  }

  const removed = removeEntryAtFlattenedIndex(bag, inventoryIndex);
  if (!removed) {
    return { save, ok: false, message: 'Предмет не найден в рюкзаке.' };
  }

  // Fridge pauses spoilage: freeze current freshness while stored.
  if (kind === 'food') {
    taken = snapshotEntryFreshness(save, taken);
  }

  const nextStorage = addEntry(storage, taken);
  const withBag = { ...save, ...withInventoryEntries(removed) };
  const next: PlayerSave = {
    ...withBag,
    housing: {
      ...save.housing,
      storages: {
        ...save.housing.storages,
        [kind]: nextStorage,
      },
    },
  };
  const label = getItem(taken.itemId)?.name ?? taken.itemId;
  return {
    save: applyStatsToSave(next),
    ok: true,
    message: `Убрано в хранилище: ${label}.`,
  };
}

export function withdrawFromHousing(
  save: PlayerSave,
  kind: HousingStorageKind,
  storageIndex: number,
): HousingActionResult {
  if (!save.housing) {
    return { save, ok: false, message: 'Нет квартиры.' };
  }
  const storage = save.housing.storages[kind] ?? [];
  let taken = peekFlatEntry(storage, storageIndex);
  if (!taken) {
    return { save, ok: false, message: 'Предмет не найден в хранилище.' };
  }

  const removed = removeEntryAtFlattenedIndex(storage, storageIndex);
  if (!removed) {
    return { save, ok: false, message: 'Предмет не найден в хранилище.' };
  }

  // Resume spoilage clock from preserved fridge freshness.
  if (kind === 'food') {
    taken = thawFridgeEntry(taken);
  }

  const bag = reconcileInventoryEntries(save.inventory, save.inventoryEnchants, save.inventoryEntries);
  const nextBag = addEntry(bag, taken);
  const next: PlayerSave = {
    ...save,
    ...withInventoryEntries(nextBag),
    housing: {
      ...save.housing,
      storages: {
        ...save.housing.storages,
        [kind]: removed,
      },
    },
  };
  const label = getItem(taken.itemId)?.name ?? taken.itemId;
  return {
    save: applyStatsToSave(next),
    ok: true,
    message: `Взято из хранилища: ${label}.`,
  };
}

/** Free rest at home bed: full HP/MP + survival rest. */
export function restAtApartment(save: PlayerSave, now = Date.now()): HousingActionResult {
  if (!save.housing) {
    return { save, ok: false, message: 'Нет квартиры.' };
  }
  if (save.location !== apartmentLocationId()) {
    return { save, ok: false, message: 'Отдыхать можно только дома.' };
  }
  const maxHp = save.maxHp;
  const maxMp = save.maxMp ?? 0;
  const healed = applyStatsToSave({
    ...save,
    hp: maxHp,
    mp: maxMp > 0 ? maxMp : save.mp,
  });
  const rested = applyRestRecovery(healed, now, {
    instantFatigueRelief: 60,
    restMinutes: 45,
    deepSleep: true,
  });
  if (!rested.ok) {
    return { save: healed, ok: true, message: 'HP восстановлено дома.' };
  }
  return {
    save: applyStatsToSave(rested.save),
    ok: true,
    message: `Сон дома: HP/MP полные. ${rested.message}`,
  };
}

export function housingPublicView(save: PlayerSave) {
  const cfg = loadHousingConfig();
  const owned = save.housing;
  return {
    owned: owned
      ? {
          tier: owned.tier,
          purchasedAt: owned.purchasedAt,
          storages: {
            materials: owned.storages.materials,
            gear: owned.storages.gear,
            food: owned.storages.food,
          },
          capacities: getApartmentTier(owned.tier),
        }
      : null,
    tiers: cfg.tiers,
    apartmentLocationId: cfg.apartmentLocationId,
  };
}

/** Fridge: food in housing.storages.food does not spoil. */
export function isFoodInApartmentFridge(save: PlayerSave, entryId: string): boolean {
  return Boolean(save.housing?.storages.food.some((e) => e.id === entryId));
}
