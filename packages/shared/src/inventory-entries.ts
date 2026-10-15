/**
 * Versioned bag slots for Survival-Life.
 * Legacy saves still ship `inventory: string[]`; normalize builds entries and keeps both in sync.
 */
export interface InventoryEntry {
  /** Stable instance id (survives quantity splits when qty=1 stacks). */
  id: string;
  itemId: string;
  quantity: number;
  /** Bag enchant for gear copies. */
  enchant?: number;
  acquiredAt?: string;
  /** 0–100 remaining freshness for perishables. */
  freshness?: number;
  temperature?: 'hot' | 'warm' | 'cold';
  waterQuality?: 'dirty' | 'filtered' | 'boiled' | 'clean';
}

let entrySeq = 0;

export function newInventoryEntryId(now = Date.now()): string {
  entrySeq = (entrySeq + 1) % 1_000_000;
  return `e${now.toString(36)}${entrySeq.toString(36)}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

export function inventoryIds(entries: InventoryEntry[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    const qty = Math.max(1, Math.floor(entry.quantity || 1));
    for (let i = 0; i < qty; i++) out.push(entry.itemId);
  }
  return out;
}

export function inventoryEnchantsFromEntries(entries: InventoryEntry[]): number[] {
  const out: number[] = [];
  for (const entry of entries) {
    const qty = Math.max(1, Math.floor(entry.quantity || 1));
    const enchant = Math.max(0, Math.floor(entry.enchant ?? 0));
    for (let i = 0; i < qty; i++) out.push(enchant);
  }
  return out;
}

/** Expand legacy string bag (+ optional enchant array) into versioned entries. */
export function entriesFromLegacy(
  inventory: string[],
  inventoryEnchants?: number[],
  now = Date.now(),
): InventoryEntry[] {
  const stamp = new Date(now).toISOString();
  return inventory.map((itemId, index) => ({
    id: newInventoryEntryId(now + index),
    itemId,
    quantity: 1,
    enchant: Math.max(0, Math.floor(inventoryEnchants?.[index] ?? 0)),
    acquiredAt: stamp,
  }));
}

export function normalizeInventoryEntries(
  raw: unknown,
  legacyInventory: string[],
  legacyEnchants?: number[],
): InventoryEntry[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((entry): entry is InventoryEntry =>
        Boolean(entry && typeof entry === 'object' && typeof (entry as InventoryEntry).itemId === 'string'),
      )
      .map((entry, index) => ({
        id:
          typeof entry.id === 'string' && entry.id.trim()
            ? entry.id.trim()
            : newInventoryEntryId(Date.now() + index),
        itemId: entry.itemId,
        quantity: Math.max(1, Math.floor(Number(entry.quantity) || 1)),
        enchant: Math.max(0, Math.min(10, Math.floor(Number(entry.enchant) || 0))),
        acquiredAt: typeof entry.acquiredAt === 'string' ? entry.acquiredAt : isoNow(),
        freshness:
          typeof entry.freshness === 'number' && Number.isFinite(entry.freshness)
            ? Math.max(0, Math.min(100, entry.freshness))
            : undefined,
        temperature:
          entry.temperature === 'hot' || entry.temperature === 'warm' || entry.temperature === 'cold'
            ? entry.temperature
            : undefined,
        waterQuality:
          entry.waterQuality === 'dirty' ||
          entry.waterQuality === 'filtered' ||
          entry.waterQuality === 'boiled' ||
          entry.waterQuality === 'clean'
            ? entry.waterQuality
            : undefined,
      }));
  }
  return entriesFromLegacy(legacyInventory, legacyEnchants);
}

export function syncLegacyInventory(entries: InventoryEntry[]): {
  inventory: string[];
  inventoryEnchants: number[];
} {
  return {
    inventory: inventoryIds(entries),
    inventoryEnchants: inventoryEnchantsFromEntries(entries),
  };
}

export function removeOneEntry(entries: InventoryEntry[], itemId: string): InventoryEntry[] | null {
  const index = entries.findIndex((entry) => entry.itemId === itemId);
  if (index < 0) return null;
  const current = entries[index]!;
  const next = [...entries];
  if ((current.quantity ?? 1) > 1) {
    next[index] = { ...current, quantity: current.quantity - 1 };
  } else {
    next.splice(index, 1);
  }
  return next;
}

export function removeEntryAtFlattenedIndex(
  entries: InventoryEntry[],
  flatIndex: number,
): InventoryEntry[] | null {
  let cursor = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const qty = Math.max(1, Math.floor(entry.quantity || 1));
    if (flatIndex < cursor + qty) {
      const next = [...entries];
      if (qty > 1) next[i] = { ...entry, quantity: qty - 1 };
      else next.splice(i, 1);
      return next;
    }
    cursor += qty;
  }
  return null;
}

export function addEntry(entries: InventoryEntry[], incoming: InventoryEntry): InventoryEntry[] {
  const withId: InventoryEntry = {
    ...incoming,
    id: incoming.id?.trim() ? incoming.id : newInventoryEntryId(),
    quantity: Math.max(1, incoming.quantity ?? 1),
  };
  const match = entries.findIndex(
    (entry) =>
      entry.itemId === withId.itemId &&
      (entry.enchant ?? 0) === (withId.enchant ?? 0) &&
      entry.temperature === withId.temperature &&
      entry.waterQuality === withId.waterQuality &&
      Math.abs((entry.freshness ?? 100) - (withId.freshness ?? 100)) < 1,
  );
  if (match >= 0) {
    const current = entries[match]!;
    const copy = [...entries];
    copy[match] = {
      ...current,
      quantity: (current.quantity ?? 1) + withId.quantity,
    };
    return copy;
  }
  return [...entries, withId];
}

function sameIdSequence(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Prefer versioned entries when they still match the flattened bag.
 * If legacy mutators changed `inventory` alone, rebuild entries and carry over
 * matching freshness/water metadata in order.
 */
export function reconcileInventoryEntries(
  inventory: string[],
  inventoryEnchants: number[] | undefined,
  previous: InventoryEntry[] | undefined,
  now = Date.now(),
): InventoryEntry[] {
  const prior = Array.isArray(previous) ? previous : [];
  if (prior.length > 0 && sameIdSequence(inventoryIds(prior), inventory)) {
    return prior.map((entry, index) => ({
      ...entry,
      id: entry.id?.trim() ? entry.id : newInventoryEntryId(now + index),
      enchant: Math.max(0, Math.floor(inventoryEnchants?.[index] ?? entry.enchant ?? 0)),
    }));
  }
  const pool = [...prior];
  const stamp = new Date(now).toISOString();
  return inventory.map((itemId, index) => {
    const matchAt = pool.findIndex((entry) => entry.itemId === itemId);
    const matched = matchAt >= 0 ? pool.splice(matchAt, 1)[0] : undefined;
    return {
      id: matched?.id?.trim() ? matched.id : newInventoryEntryId(now + index),
      itemId,
      quantity: 1,
      enchant: Math.max(0, Math.floor(inventoryEnchants?.[index] ?? matched?.enchant ?? 0)),
      acquiredAt: matched?.acquiredAt ?? stamp,
      freshness: matched?.freshness,
      temperature: matched?.temperature,
      waterQuality: matched?.waterQuality,
    };
  });
}

/** Apply entry mutations and keep flattened inventory views in sync. */
export function withInventoryEntries(entries: InventoryEntry[]): {
  inventory: string[];
  inventoryEnchants: number[];
  inventoryEntries: InventoryEntry[];
} {
  const synced = syncLegacyInventory(entries);
  return {
    inventory: synced.inventory,
    inventoryEnchants: synced.inventoryEnchants,
    inventoryEntries: entries,
  };
}
